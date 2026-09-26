import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { InventoryStore } from '../dist/inventory-store.js';
import { InventorySync, sseMessages } from '../dist/inventory-sync.js';
import { inventoryRoutes, stationBcs } from '../dist/inventory-routes.js';
import { umbrellaBcs } from '../dist/umbrella-routes.js';
import { originalId, packageId } from '../dist/deployment.js';
const id = '0x' + '1'.repeat(64);
const station = { id, display_name: '<Station>', location_name: 'Tokyo', latitude_e6: '125680000', longitude_e6: '319760000', payout_address: id, maintenance_reserve: id, admin_payout_address: id, status: { Removing: true }, docked_count: '9007199254740993', authorized_cap: id };
const umbrella = { id, supplier: id, name: 'Rain companion', color: 1, state: { Quarantined: true }, current_station_id: id, holder: null, inspection_deadline_ms: '0', purchase_price: '100000000', condition_bond: '30000000', active_escrow: '0', pending_condition: '30000000', pending_condition_owner: id, last_condition_amount: '30000000', last_condition_cycle: '1', last_condition_status: { AwaitingReview: true }, checkout_payout_address: id, admin_payout_address: id, owner_count: '9007199254740993' };

const state = () => ({ scope: 'test', checkpoint: 10, createdAt: Date.now(), cursors: {} });
const node = (value = station) => ({ address: value.id, asMoveObject: { contents: { bcs: stationBcs.serialize(value).toBase64() } } });
const write = (version, value = station) => ({ id: value.id, version: String(version), kind: 'stations', node: node(value) });
const page = (nodes, next = null) => ({ nodes, pageInfo: { hasNextPage: next !== null, endCursor: next } });
const change = (version, value = station) => ({ address: value.id, outputState: { version, asMoveObject: { contents: { ...node(value).asMoveObject.contents, type: { repr: `${originalId}::umbrella::Station` } } } } });

test('atomic writes roll back every row and the cursor when any object fails decoding', () => {
  const db = new InventoryStore(':memory:');
  try {
    db.replace([write(1)], state());
    assert.throws(() => db.apply([write(2, { ...station, display_name: 'changed' }), { ...write(2), id: 'other', node: { address: 'other', asMoveObject: { contents: { bcs: 'AA==' } } } }], 'stream', 'cursor-2'));
    assert.equal(db.list('stations', null).items[0].name, '<Station>');
    assert.deepEqual(db.state().cursors, {});
  } finally { db.close(); }
});

test('duplicate and out-of-order deliveries cannot regress state or resurrect deleted rows', () => {
  const db = new InventoryStore(':memory:');
  try {
    db.replace([write(1)], state());
    db.apply([write(3, { ...station, docked_count: '5' })], 'new', 'c3');
    db.apply([write(2)], 'old', 'c2');
    db.apply([write(3)], 'new', 'c3');
    assert.equal(db.list('stations', null).items[0].dockedCount, '5');
    db.apply([{ id, version: '4' }], 'new', 'c4');
    db.apply([write(3)], 'old', 'c3');
    assert.equal(db.list('stations', null).items.length, 0);
    assert.equal(db.state().cursors.new, 'c4');
  } finally { db.close(); }
});

test('database and per-package cursors survive a process restart', () => {
  const directory = mkdtempSync(join(tmpdir(), 'kirisame-inventory-'));
  try {
    const path = join(directory, 'inventory.sqlite');
    const first = new InventoryStore(path);
    first.replace([write(1)], state()); first.apply([write(2)], 'package', 'saved'); first.close();
    const second = new InventoryStore(path);
    try {
      assert.equal(second.state().cursors.package, 'saved');
      assert.equal(second.list('stations', null).items.length, 1);
      assert.equal(second.ready, false);
    } finally { second.close(); }
  } finally { rmSync(directory, { recursive: true }); }
});

test('local inventory preserves response fields, 50-row pagination and remote fallback', async () => {
  const db = new InventoryStore(':memory:');
  let remoteCalls = 0;
  const routes = inventoryRoutes(async () => { remoteCalls++; return Response.json({ data: { objects: page([]) } }); }, db);
  try {
    const rows = Array.from({ length: 51 }, (_, i) => write(1, { ...station, id: '0x' + (i+1).toString(16).padStart(64, '0') }));
    db.replace(rows, state());
    await routes.request('/stations');
    assert.equal(remoteCalls, 1);
    db.ready = true;
    const first = await (await routes.request('/stations')).json();
    assert.equal(first.items.length, 50); assert.equal(first.items[0].dockedCount, '9007199254740993');
    const second = await (await routes.request('/stations?cursor=' + encodeURIComponent(first.nextCursor))).json();
    assert.equal(second.items.length, 1); assert.equal(second.nextCursor, null);
    assert.equal(remoteCalls, 1);
    await routes.request('/stations?cursor=existing-graphql-cursor');
    assert.equal(remoteCalls, 2);
    db.ready = false;
    assert.equal((await routes.request('/stations?cursor=' + first.nextCursor)).status, 502);
  } finally { db.close(); }
});

test('all object-change pages must succeed before committing any changes or cursor', async () => {
  const db = new InventoryStore(':memory:');
  try {
    db.replace([write(1)], state());
    const tx = { digest: 'digest', effects: { status: 'SUCCESS', lamportVersion: 2, objectChanges: page([change(2, { ...station, display_name: 'new' })], 'next') } };
    const failed = new InventorySync(db, 'https://example.test/graphql', originalId, packageId, async () => Response.json({ errors: [{}] }));
    await assert.rejects(failed.apply(tx, 'stream', 'cursor', new AbortController().signal));
    assert.equal(db.list('stations', null).items[0].name, '<Station>');
    assert.deepEqual(db.state().cursors, {});
    const success = new InventorySync(db, 'https://example.test/graphql', originalId, packageId, async (_url, options) => {
      assert.equal(JSON.parse(options.body).variables.cursor, 'next');
      return Response.json({ data: { transaction: { effects: { objectChanges: page([]) } } } });
    });
    await success.apply(tx, 'stream', 'cursor', new AbortController().signal);
    assert.equal(db.list('stations', null).items[0].name, 'new');
    assert.equal(db.state().cursors.stream, 'cursor');
  } finally { db.close(); }
});

test('SSE parser handles split UTF-8, CRLF, keepalives, multiple frames and truncated EOF', async () => {
  const bytes = new TextEncoder().encode(': keep-alive\r\n\r\nevent: next\r\ndata: {"name":"傘"}\r\n\r\ndata: {"n":2}\n\n');
  const body = new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } });
  const messages = sseMessages(body);
  assert.deepEqual((await messages.next()).value, { name: '傘' });
  assert.deepEqual((await messages.next()).value, { n: 2 });
  await assert.rejects(messages.next(), /ended/);
});

test('subscription reconnect passes saved cursor to both catch-up target query and stream', async () => {
  const db = new InventoryStore(':memory:');
  try {
    db.replace([write(1)], state()); db.apply([], packageId, 'saved-cursor');
    let caughtUp = false;
    const sync = new InventorySync(db, 'https://example.test/graphql', originalId, packageId, async (url, options) => {
      assert.equal(JSON.parse(options.body).variables.after, 'saved-cursor');
      if (!url.endsWith('/subscriptions')) return Response.json({ data: { transactions: page([]) } });
      return new Response('data: {"errors":[{"message":"invalid cursor"}]}\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
    });
    await assert.rejects(sync.stream(packageId, () => { caughtUp = true; }, new AbortController().signal), /Invalid subscription/);
    assert.equal(caughtUp, true);
    assert.equal(db.state().cursors[packageId], 'saved-cursor');
  } finally { db.close(); }
});

test('bootstrap pins every object page to one checkpoint and replaces both kinds together', async () => {
  const db = new InventoryStore(':memory:');
  try {
    db.replace([write(1)], state());
    let failUmbrellas = true;
    const fetcher = async (_url, options) => {
      const { query, variables } = JSON.parse(options.body);
      if (query.includes('availableRange')) return Response.json({ data: { serviceConfig: { availableRange: { last: { sequenceNumber: 42 } } } } });
      assert.equal(variables.cp, 42);
      if (variables.type.endsWith('::Station')) {
        const objects = variables.cursor ? page([]) : page([{ address: id, ...change(2, { ...station, display_name: 'snapshot' }).outputState }], 'station-page-2');
        return Response.json({ data: { checkpoint: { query: { objects } } } });
      }
      if (failUmbrellas) return Response.json({ errors: [{}] });
      const objects = page([{ address: id, version: 2, asMoveObject: { contents: { type: { repr: `${originalId}::umbrella::Umbrella` }, bcs: umbrellaBcs.serialize({ ...umbrella, id: '0x' + '2'.repeat(64) }).toBase64() } } }]);
      // A separate real object ID for the umbrella.
      objects.nodes[0].address = '0x' + '2'.repeat(64);
      return Response.json({ data: { checkpoint: { query: { objects } } } });
    };
    const sync = new InventorySync(db, 'https://example.test/graphql', originalId, packageId, fetcher);
    await assert.rejects(sync.bootstrap('new', new AbortController().signal));
    assert.equal(db.list('stations', null).items[0].name, '<Station>');
    assert.equal(db.state().checkpoint, 10);
    failUmbrellas = false;
    await sync.bootstrap('new', new AbortController().signal);
    assert.equal(db.list('stations', null).items[0].name, 'snapshot');
    assert.equal(db.list('umbrellas', null).items[0].ownerCount, '9007199254740993');
    assert.equal(db.state().checkpoint, 42);
  } finally { db.close(); }
});

test('catch-up scans empty filtered pages before declaring the database ready', async () => {
  const db = new InventoryStore(':memory:');
  try {
    db.replace([write(1)], state());
    let scans = 0;
    let caughtUp = false;
    const tx = { digest: 'latest', effects: { status: 'SUCCESS', lamportVersion: 2, objectChanges: page([change(2)]) } };
    const sync = new InventorySync(db, 'https://example.test/graphql', originalId, packageId, async (url, options) => {
      const variables = JSON.parse(options.body).variables;
      if (!url.endsWith('/subscriptions')) {
        scans++;
        if (scans === 1) return Response.json({ data: { transactions: page([], 'scan-progress') } });
        assert.equal(variables.after, 'scan-progress');
        return Response.json({ data: { transactions: page([{ digest: 'latest' }]) } });
      }
      assert.equal(caughtUp, false);
      return new Response(`data: ${JSON.stringify({ data: { transactions: { cursor: 'latest-cursor', node: tx } } })}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
    });
    await assert.rejects(sync.stream(packageId, () => { caughtUp = true; }, new AbortController().signal), /ended/);
    assert.equal(scans, 2);
    assert.equal(caughtUp, true);
    assert.equal(db.state().cursors[packageId], 'latest-cursor');
  } finally { db.close(); }
});


test('default names skip retired and custom names and survive deletion, rebuild and restart', () => {
  const directory = mkdtempSync(join(tmpdir(), 'kirisame-names-'));
  const path = join(directory, 'inventory.sqlite');
  let db = new InventoryStore(path);
  try {
    const retired = { ...umbrella, name: 'Supplier Umbrella #1', state: { Retired: true } };
    db.replace([{ id, version: '1', kind: 'umbrellas', node: { address: id, asMoveObject: { contents: { bcs: umbrellaBcs.serialize(retired).toBase64() } } } }], state());
    assert.equal(db.list('umbrellas', null).items[0].name, retired.name);
    assert.equal(db.reserveUmbrellaName('Supplier Umbrella #2'), 'Supplier Umbrella #2');
    assert.equal(db.reserveUmbrellaName(''), 'Supplier Umbrella #3');
    db.apply([{ id, version: '2' }], 'stream', 'deleted');
    db.replace([], state());
    db.close();
    db = new InventoryStore(path);
    assert.equal(db.reserveUmbrellaName(''), 'Supplier Umbrella #4');
    // Two connections preparing transactions cannot choose the same default.
    const other = new InventoryStore(path);
    try {
      assert.equal(other.reserveUmbrellaName(''), 'Supplier Umbrella #5');
      assert.equal(db.reserveUmbrellaName(''), 'Supplier Umbrella #6');
    } finally { other.close(); }
  } finally { db.close(); rmSync(directory, { recursive: true }); }
});

test('legacy inventory cache is rebuilt when checkout timing is missing', () => {
  const directory = mkdtempSync(join(tmpdir(), 'kirisame-timing-'));
  const path = join(directory, 'inventory.sqlite');
  const legacy = new DatabaseSync(path);
  legacy.exec(`CREATE TABLE inventory (id TEXT PRIMARY KEY, version TEXT NOT NULL, kind TEXT, item TEXT);
    CREATE TABLE umbrella_names (name TEXT PRIMARY KEY);
    CREATE TABLE sync_state (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);`);
  legacy.prepare('INSERT INTO inventory VALUES (?, ?, ?, ?)').run(id, '1', 'umbrellas', JSON.stringify({ name: 'Supplier Umbrella #9', status: 'Held' }));
  legacy.prepare('INSERT INTO sync_state VALUES (1, ?)').run(JSON.stringify(state()));
  legacy.close();
  const db = new InventoryStore(path);
  try {
    assert.deepEqual(db.list('umbrellas', null).items, []);
    assert.equal(db.state(), undefined);
    assert.equal(db.reserveUmbrellaName(''), 'Supplier Umbrella #1');
    assert.equal(db.db.prepare('SELECT 1 FROM umbrella_names WHERE name=?').get('Supplier Umbrella #9') !== undefined, true);
  } finally { db.close(); rmSync(directory, { recursive: true }); }
});
