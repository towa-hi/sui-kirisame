import { Hono } from 'hono';
import { bcs } from '@mysten/sui/bcs';
import { fromBase64, normalizeSuiAddress } from '@mysten/sui/utils';
import { umbrellaBcs } from './umbrella-routes.js';
import { originalId } from './deployment.js';

// Field order follows Station in move/kirisame/sources/kirisame.move.
export const stationBcs = bcs.struct('Station', {
  id: bcs.Address, display_name: bcs.string(), location_name: bcs.string(),
  latitude_e6: bcs.u64(), longitude_e6: bcs.u64(), payout_address: bcs.Address,
  maintenance_reserve: bcs.Address, admin_payout_address: bcs.Address,
  status: bcs.enum('StationStatus', { Active: null, Removing: null, Removed: null }),
  docked_count: bcs.u64(),
});
const query = `query Inventory($type: String!, $cursor: String) {
  objects(first: 50, after: $cursor, filter: { type: $type }) {
    nodes { address asMoveObject { contents { bcs } } }
    pageInfo { hasNextPage endCursor }
  }
}`;

export function inventoryRoutes(fetcher: typeof fetch = fetch) {
  const routes = new Hono();
  routes.get('/:kind', async c => {
    c.header('Cache-Control', 'no-store');
    const kind = c.req.param('kind');
    if (kind !== 'stations' && kind !== 'umbrellas') return c.json({ error: 'Unknown inventory list.' }, 404);
    const cursor = c.req.query('cursor') || null;
    if (cursor && cursor.length > 4096) return c.json({ error: 'Invalid page cursor.' }, 400);
    try {
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
      const items = connection.nodes.map((node: { address: string; asMoveObject?: { contents?: { bcs?: string } } }) => {
        const encoded = node.asMoveObject?.contents?.bcs;
        if (!encoded) throw new Error('Missing object contents');
        const bytes = fromBase64(encoded);
        if (kind === 'stations') {
          const data = stationBcs.parse(bytes);
          return { objectId: node.address, name: data.display_name, location: data.location_name,
            latitude: Number(data.latitude_e6) / 1e6 - 90, longitude: Number(data.longitude_e6) / 1e6 - 180,
            status: data.status.$kind, dockedCount: data.docked_count, payoutAddress: data.payout_address };
        }
        const data = umbrellaBcs.parse(bytes);
        return { objectId: node.address, color: ['Vinyl', 'Black', 'White'][data.color] ?? 'Unknown',
          status: data.state.$kind, station: data.current_station_id, holder: data.holder, supplier: data.supplier,
          ownerCount: data.owner_count, purchasePrice: data.purchase_price, conditionBond: data.condition_bond,
          activeEscrow: data.active_escrow, pendingCondition: data.pending_condition, conditionStatus: data.last_condition_status.$kind };
      });
      return c.json({ items, nextCursor: connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null });
    } catch {
      return c.json({ error: `Unable to load ${kind} from testnet. Please try again.` }, 502);
    }
  });
  return routes;
}
