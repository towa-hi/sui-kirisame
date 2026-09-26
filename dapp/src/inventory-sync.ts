import { normalizeSuiAddress } from '@mysten/sui/utils';
import { setTimeout as delay } from 'node:timers/promises';
import { InventoryStore, type InventoryWrite } from './inventory-store.js';
import type { InventoryKind } from './inventory-data.js';

type Page<T> = { nodes: T[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
type ObjectState = { address?: string; version: number; asMoveObject: { contents: { bcs: string; type: { repr: string } } } | null };
type Change = { address: string; outputState: ObjectState | null };
type Effects = { status: string; lamportVersion: number; objectChanges: Page<Change> };
type Transaction = { digest: string; effects: Effects };
const objectFields = 'version asMoveObject { contents { bcs type { repr } } }';
const changesFields = `nodes { address outputState { ${objectFields} } } pageInfo { hasNextPage endCursor }`;
const transactionFields = `digest effects { status lamportVersion objectChanges(first: 50) { ${changesFields} } }`;

function nextPage<T>(page: Page<T>, previous: string | null): string | null {
  if (!page || !Array.isArray(page.nodes) || typeof page.pageInfo?.hasNextPage !== 'boolean') throw new Error('Incomplete GraphQL page');
  if (!page.pageInfo.hasNextPage) return null;
  const next = page.pageInfo.endCursor;
  if (!next || next === previous) throw new Error('GraphQL pagination did not advance');
  return next;
}

/** POST-based SSE, including fragmented UTF-8, CRLF, comments and multiple data lines. */
export async function* sseMessages(body: ReadableStream<Uint8Array>, activity: () => void = () => {}) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let data: string[] = [];
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      activity();
      buffer += decoder.decode(chunk.value, { stream: true });
      let end: number;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end).replace(/\r$/, '');
        buffer = buffer.slice(end + 1);
        if (!line) {
          if (data.length) yield JSON.parse(data.join('\n'));
          data = [];
        } else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
      if (buffer.length > 8_000_000 || data.join('\n').length > 8_000_000) throw new Error('Oversized subscription frame');
    }
    throw new Error('GraphQL subscription ended');
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export class InventorySync {
  private readonly original: string;
  constructor(readonly store: InventoryStore, readonly url: string, original: string, readonly currentPackage: string,
    readonly fetcher: typeof fetch = fetch, readonly subscriptionUrl = `${url.replace(/\/$/, '')}/subscriptions`) {
    this.original = normalizeSuiAddress(original);
  }
  async query<T>(query: string, variables: Record<string, unknown>, signal: AbortSignal): Promise<T> {
    const response = await this.fetcher(this.url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }), signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) });
    if (!response.ok) throw new Error(`GraphQL HTTP ${response.status}`);
    const result = await response.json();
    if (result.errors?.length || !result.data) throw new Error('GraphQL returned incomplete data');
    return result.data;
  }
  private write(address: string, state: ObjectState | null, deletedVersion?: number): InventoryWrite | undefined {
    if (!state) {
      if (!Number.isSafeInteger(deletedVersion)) throw new Error('Missing deletion version');
      return { id: address, version: String(deletedVersion) };
    }
    const type = state.asMoveObject?.contents?.type?.repr;
    const kind: InventoryKind | undefined = type === `${this.original}::umbrella::Station` ? 'stations'
      : type === `${this.original}::umbrella::Umbrella` ? 'umbrellas' : undefined;
    if (!kind) return;
    if (!Number.isSafeInteger(state.version) || !state.asMoveObject?.contents?.bcs) throw new Error('Incomplete inventory object');
    return { id: address, version: String(state.version), kind, node: { address, asMoveObject: state.asMoveObject } };
  }
  async packages(signal: AbortSignal) {
    const ids = new Set([this.original, normalizeSuiAddress(this.currentPackage)]);
    let cursor: string | null = null;
    do {
      const data: { packageVersions: Page<{ address: string }> } = await this.query(`query($id: SuiAddress!, $cursor: String) {
        packageVersions(address: $id, first: 50, after: $cursor) { nodes { address } pageInfo { hasNextPage endCursor } }
      }`, { id: this.original, cursor }, signal);
      cursor = nextPage(data.packageVersions, cursor);
      for (const node of data.packageVersions.nodes) ids.add(normalizeSuiAddress(node.address));
    } while (cursor);
    return [...ids].sort();
  }
  async bootstrap(scope: string, signal: AbortSignal) {
    const data = await this.query<{ serviceConfig: { availableRange: { last: { sequenceNumber: number } } } }>(`{
      serviceConfig { availableRange(type: "Query", field: "objects", filters: ["type"]) { last { sequenceNumber } } }
    }`, {}, signal);
    const checkpoint = data.serviceConfig?.availableRange?.last?.sequenceNumber;
    if (!Number.isSafeInteger(checkpoint)) throw new Error('No consistent object snapshot available');
    const writes: InventoryWrite[] = [];
    for (const name of ['Station', 'Umbrella']) {
      let cursor: string | null = null;
      do {
        const data: { checkpoint: { query: { objects: Page<ObjectState & { address: string }> } } } = await this.query(`
          query($cp: UInt53!, $type: String!, $cursor: String) {
            checkpoint(sequenceNumber: $cp) { query { objects(first: 50, after: $cursor, filter: {type: $type}) {
              nodes { address ${objectFields} } pageInfo { hasNextPage endCursor }
            } } }
          }`, { cp: checkpoint, type: `${this.original}::umbrella::${name}`, cursor }, signal);
        const page = data.checkpoint?.query?.objects;
        cursor = nextPage(page, cursor);
        for (const object of page.nodes) {
          const write = this.write(object.address, object);
          if (!write) throw new Error('Unexpected snapshot object type');
          writes.push(write);
        }
      } while (cursor);
    }
    this.store.replace(writes, { scope, checkpoint, createdAt: Date.now(), cursors: {} });
  }
  async apply(transaction: Transaction, stream: string, cursor: string, signal: AbortSignal) {
    if (!transaction?.digest || !cursor || !transaction.effects) throw new Error('Incomplete transaction');
    const writes: InventoryWrite[] = [];
    if (transaction.effects.status === 'SUCCESS') {
      let page = transaction.effects.objectChanges;
      let previous: string | null = null;
      while (true) {
        const next: string | null = nextPage(page, previous);
        for (const change of page.nodes) {
          const write = this.write(change.address, change.outputState, transaction.effects.lamportVersion);
          if (write) writes.push(write);
        }
        if (!next) break;
        const data: { transaction: { effects: { objectChanges: Page<Change> } } } = await this.query(`
          query($digest: String!, $cursor: String!) {
            transaction(digest: $digest) { effects { objectChanges(first: 50, after: $cursor) { ${changesFields} } } }
          }`, { digest: transaction.digest, cursor: next }, signal);
        page = data.transaction?.effects?.objectChanges;
        previous = next;
      }
    } else if (transaction.effects.status !== 'FAILURE') throw new Error('Unknown transaction status');
    // Decode every relevant object and persist the resume cursor in the same SQLite transaction.
    this.store.apply(writes, stream, cursor);
  }
  async stream(id: string, caughtUp: () => void, signal: AbortSignal) {
    const state = this.store.state()!;
    const filter = { function: `${id}::umbrella`, afterCheckpoint: state.checkpoint };
    // A fixed target avoids serving the old database during reconnect backfill.
    let targetDigest: string | undefined;
    let scanCursor: string | null = state.cursors[id] ?? null;
    do {
      const target: { transactions: Page<{ digest: string }> } = await this.query(`query($filter: TransactionFilter!, $after: String) {
        transactions(first: 50, filter: $filter, after: $after) { nodes { digest } pageInfo { hasNextPage endCursor } }
      }`, { filter, after: scanCursor }, signal);
      scanCursor = nextPage(target.transactions, scanCursor);
      targetDigest = target.transactions.nodes.at(-1)?.digest ?? targetDigest;
    } while (scanCursor);
    const idle = new AbortController();
    let idleTimer: ReturnType<typeof setTimeout>;
    const activity = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => idle.abort(), 45000); };
    activity();
    signal = AbortSignal.any([signal, idle.signal]);
    try {
      const response = await this.fetcher(this.subscriptionUrl, { method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ query: `subscription($filter: TransactionFilter!, $after: String) {
          transactions(filter: $filter, after: $after) { cursor node { ${transactionFields} } }
        }`, variables: { filter, after: state.cursors[id] ?? null } }), signal });
      if (!response.ok || !response.body || !response.headers.get('content-type')?.includes('text/event-stream')) throw new Error('Subscription unavailable');
      if (!targetDigest) caughtUp();
      for await (const message of sseMessages(response.body, activity)) {
        if (message.errors?.length || !message.data?.transactions) throw new Error('Invalid subscription response');
        const edge = message.data.transactions;
        await this.apply(edge.node, id, edge.cursor, signal);
        if (edge.node.digest === targetDigest) caughtUp();
      }
    } finally { clearTimeout(idleTimer!); idle.abort(); }
  }
  async run(signal: AbortSignal) {
    let failures = 0;
    while (!signal.aborted) {
      const cycle = new AbortController();
      // Periodically refresh the snapshot and discover new package versions; bound retention needs.
      const timer = setTimeout(() => cycle.abort(), 20 * 60 * 1000);
      const combined = AbortSignal.any([signal, cycle.signal]);
      this.store.ready = false;
      let streams: Promise<void>[] = [];
      try {
        const ids = await this.packages(combined);
        const scope = JSON.stringify([this.url, this.original, ids]);
        const saved = this.store.state();
        // Long outages or unusable cursors recover from a fresh authoritative snapshot.
        if (!saved || saved.scope !== scope || Date.now() - saved.createdAt > 20 * 60 * 1000 || failures >= 3) {
          await this.bootstrap(scope, combined);
        }
        const pending = new Set(ids);
        streams = ids.map(id => this.stream(id, () => {
          pending.delete(id);
          if (!pending.size && !this.store.ready) {
            this.store.ready = true;
            failures = 0;
            console.log('Inventory database synchronized with GraphQL.');
          }
        }, combined));
        await Promise.all(streams);
      } catch (error) {
        if (!signal.aborted && !cycle.signal.aborted) console.warn('Inventory sync retry:', error instanceof Error ? error.message : 'unknown error');
      } finally {
        this.store.ready = false;
        cycle.abort();
        await Promise.allSettled(streams);
        clearTimeout(timer);
      }
      if (!signal.aborted) await delay(Math.min(30000, 1000 * 2 ** Math.min(failures++, 5)), undefined, { signal }).catch(() => {});
    }
  }
}
