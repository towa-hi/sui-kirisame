import test from 'node:test';
import assert from 'node:assert/strict';
import { inventoryRoutes, stationBcs } from '../dist/inventory-routes.js';
import { umbrellaBcs } from '../dist/umbrella-routes.js';
const id = '0x' + '1'.repeat(64);
const station = { id, display_name: '<Station>', location_name: 'Tokyo', latitude_e6: '125680000', longitude_e6: '319760000', payout_address: id, maintenance_reserve: id, admin_payout_address: id, status: { Removing: true }, docked_count: '9007199254740993' };
const umbrella = { id, supplier: id, color: 1, state: { Quarantined: true }, current_station_id: id, checkout_station_id: id, holder: null, checkout_time_ms: '0', inspection_deadline_ms: '0', purchase_price: '100000000', fee_per_ms: '330', condition_bond: '30000000', active_escrow: '0', pending_condition: '30000000', pending_condition_owner: id, last_condition_amount: '30000000', last_condition_cycle: '1', last_condition_status: { AwaitingReview: true }, checkout_payout_address: id, admin_payout_address: id, owner_count: '9007199254740993' };
const payload = (bcs, value, more = false) => ({ data: { objects: { nodes: [{ address: id, asMoveObject: { contents: { bcs: bcs.serialize(value).toBase64() } } }], pageInfo: { hasNextPage: more, endCursor: more ? 'next-page' : null } } } });
test('inventory filters deployment/type and preserves cursor, coordinates, and large counts', async () => {
  const routes = inventoryRoutes(async (_url, options) => {
    const { variables } = JSON.parse(options.body);
    assert.match(variables.type, /::umbrella::Station$/);
    assert.equal(variables.cursor, 'previous-page');
    return Response.json(payload(stationBcs, station, true));
  });
  const response = await routes.request('/stations?cursor=previous-page');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const data = await response.json();
  assert.equal(data.nextCursor, 'next-page');
  assert.equal(data.items[0].name, '<Station>');
  assert.equal(data.items[0].status, 'Removing');
  assert.equal(data.items[0].dockedCount, '9007199254740993');
  assert.ok(Math.abs(data.items[0].latitude - 35.68) < 1e-10);
});
test('umbrella inventory decodes lifecycle and escrow fields', async () => {
  const routes = inventoryRoutes(async () => Response.json(payload(umbrellaBcs, umbrella)));
  const response = await routes.request('/umbrellas');
  const data = await response.json();
  assert.equal(data.items[0].status, 'Quarantined');
  assert.equal(data.items[0].conditionStatus, 'AwaitingReview');
  assert.equal(data.items[0].pendingCondition, '30000000');
  assert.equal(data.items[0].ownerCount, '9007199254740993');
  assert.equal(data.nextCursor, null);
});
test('empty inventory succeeds; partial, malformed, and unavailable responses fail visibly', async () => {
  const empty = inventoryRoutes(async () => Response.json({ data: { objects: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } }));
  assert.deepEqual(await (await empty.request('/stations')).json(), { items: [], nextCursor: null });
  for (const result of [{ errors: [{ message: 'private upstream error' }] }, { data: { objects: { nodes: [{}], pageInfo: {} } } }, { data: { objects: { nodes: [], pageInfo: { hasNextPage: true } } } }]) {
    const routes = inventoryRoutes(async () => Response.json(result));
    const response = await routes.request('/stations');
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /Unable to load stations/);
  }
  const routes = inventoryRoutes(async () => { throw new Error('network'); });
  assert.equal((await routes.request('/umbrellas')).status, 502);
  assert.equal((await routes.request('/other')).status, 404);
});
