import { Hono } from 'hono';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { inventoryItem } from './inventory-data.js';
import type { InventoryStore } from './inventory-store.js';
export { stationBcs } from './inventory-data.js';
import { originalId } from './deployment.js';

const query = `query Inventory($type: String!, $cursor: String) {
  objects(first: 50, after: $cursor, filter: { type: $type }) {
    nodes { address asMoveObject { contents { bcs } } }
    pageInfo { hasNextPage endCursor }
  }
}`;

export function inventoryRoutes(fetcher: typeof fetch = fetch, store?: InventoryStore) {
  const routes = new Hono();
  routes.get('/:kind', async c => {
    c.header('Cache-Control', 'no-store');
    const kind = c.req.param('kind');
    if (kind !== 'stations' && kind !== 'umbrellas') return c.json({ error: 'Unknown inventory list.' }, 404);
    const cursor = c.req.query('cursor') || null;
    if (cursor && cursor.length > 4096) return c.json({ error: 'Invalid page cursor.' }, 400);
    try {
      if (store && (cursor?.startsWith('local:') || (!cursor && store.ready))) {
        if (!store.ready) throw new Error('Inventory catching up');
        return c.json(store.list(kind, cursor));
      }
      const response = await fetcher(process.env.KIRISAME_GRAPHQL_URL || 'https://graphql.testnet.sui.io/graphql', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { type: `${normalizeSuiAddress(originalId)}::umbrella::${kind === 'stations' ? 'Station' : 'Umbrella'}`, cursor } }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error('Indexer unavailable');
      const result = await response.json();
      const connection = result.data?.objects;
      if (result.errors?.length || !connection || !Array.isArray(connection.nodes) || !connection.pageInfo) throw new Error('Incomplete inventory');
      if (connection.pageInfo.hasNextPage && (!connection.pageInfo.endCursor || connection.pageInfo.endCursor === cursor)) throw new Error('Invalid pagination');
      const items = connection.nodes.map((node: Parameters<typeof inventoryItem>[1]) => inventoryItem(kind, node));
      return c.json({ items, nextCursor: connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null });
    } catch {
      return c.json({ error: `Unable to load ${kind} from testnet. Please try again.` }, 502);
    }
  });
  return routes;
}
