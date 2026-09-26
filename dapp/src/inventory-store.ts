import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { inventoryItem, type InventoryKind, type InventoryNode } from './inventory-data.js';

export type InventoryWrite = { id: string; version: string; kind?: InventoryKind; node?: InventoryNode };
export type SyncState = { scope: string; checkpoint: number; createdAt: number; cursors: Record<string, string> };

/** Rebuildable read model. Chain validation remains in the transaction routes. */
export class InventoryStore {
  readonly db: DatabaseSync;
  ready = false;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS inventory (id TEXT PRIMARY KEY, version TEXT NOT NULL, kind TEXT, item TEXT);
      CREATE TABLE IF NOT EXISTS sync_state (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);`);
  }
  state(): SyncState | undefined {
    const row = this.db.prepare('SELECT value FROM sync_state WHERE id=1').get();
    return row ? JSON.parse(row.value as string) : undefined;
  }
  private atomic(work: () => void) {
    this.db.exec('BEGIN IMMEDIATE');
    try { work(); this.db.exec('COMMIT'); } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  private save(state: SyncState) {
    this.db.prepare('INSERT OR REPLACE INTO sync_state VALUES (1, ?)').run(JSON.stringify(state));
  }
  private write(change: InventoryWrite) {
    const previous = this.db.prepare('SELECT version, kind FROM inventory WHERE id=?').get(change.id);
    if (previous && BigInt(previous.version as string) >= BigInt(change.version)) return;
    if (!change.kind && !previous) return; // unrelated deleted object
    const kind = change.kind ?? previous!.kind as InventoryKind;
    const item = change.node ? JSON.stringify(inventoryItem(kind, change.node)) : null;
    this.db.prepare('INSERT OR REPLACE INTO inventory VALUES (?, ?, ?, ?)').run(change.id, change.version, kind, item);
  }
  replace(changes: InventoryWrite[], state: SyncState) {
    this.atomic(() => {
      this.db.exec('DELETE FROM inventory');
      for (const change of changes) this.write(change);
      this.save(state);
    });
  }
  apply(changes: InventoryWrite[], stream: string, cursor: string) {
    this.atomic(() => {
      const state = this.state();
      if (!state) throw new Error('Inventory has no baseline');
      for (const change of changes) this.write(change);
      state.cursors[stream] = cursor;
      this.save(state);
    });
  }
  list(kind: InventoryKind, cursor: string | null) {
    let after = '';
    if (cursor) {
      const match = /^local:(stations|umbrellas):(0x[0-9a-f]{64})$/.exec(cursor);
      if (!match || match[1] !== kind) throw new Error('Invalid inventory cursor');
      after = match[2];
    }
    const rows = this.db.prepare('SELECT id, item FROM inventory WHERE kind=? AND item IS NOT NULL AND id>? ORDER BY id LIMIT 51').all(kind, after);
    const page = rows.slice(0, 50);
    return { items: page.map(row => JSON.parse(row.item as string)), nextCursor: rows.length > 50 ? `local:${kind}:${page[49].id}` : null };
  }
  close() { this.ready = false; this.db.close(); }
}
