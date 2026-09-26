import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { inventoryItem, type InventoryKind, type InventoryNode } from './inventory-data.js';

export type InventoryWrite = { id: string; version: string; kind?: InventoryKind; node?: InventoryNode };
export type SyncState = { scope: string; checkpoint: number; createdAt: number; cursors: Record<string, string> };

/** Chain read model plus durable name reservations for concurrent supply requests. */
export class InventoryStore {
  readonly db: DatabaseSync;
  ready = false;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS inventory (id TEXT PRIMARY KEY, version TEXT NOT NULL, kind TEXT, item TEXT);
      CREATE TABLE IF NOT EXISTS umbrella_names (name TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS sync_state (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);`);
    this.db.exec(`INSERT OR IGNORE INTO umbrella_names SELECT json_extract(item, '$.name') FROM inventory
      WHERE kind='umbrellas' AND json_extract(item, '$.name') IS NOT NULL;`);
    // Rebuild caches written before checkout timing was included in inventory JSON.
    // Reserved names remain durable so a rebuild cannot reuse an old umbrella name.
    const staleUmbrellas = this.db.prepare(`SELECT 1 FROM inventory WHERE kind='umbrellas' AND item IS NOT NULL
      AND json_type(item, '$.inspectionDeadlineMs') IS NULL LIMIT 1`).get();
    if (staleUmbrellas) this.db.exec('DELETE FROM inventory; DELETE FROM sync_state;');
  }
  nextUmbrellaName(): string {
    let number = 1;
    while (this.db.prepare('SELECT 1 FROM umbrella_names WHERE name=?').get(`Supplier Umbrella #${number}`)) number++;
    return `Supplier Umbrella #${number}`;
  }
  reserveUmbrellaName(requested: string): string {
    let name = requested;
    this.atomic(() => {
      if (!name) name = this.nextUmbrellaName();
      this.db.prepare('INSERT OR IGNORE INTO umbrella_names VALUES (?)').run(name);
    });
    return name;
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
    const data = change.node ? inventoryItem(kind, change.node) : null;
    if (kind === 'umbrellas' && data?.name) this.db.prepare('INSERT OR IGNORE INTO umbrella_names VALUES (?)').run(data.name);
    const item = data ? JSON.stringify(data) : null;
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
