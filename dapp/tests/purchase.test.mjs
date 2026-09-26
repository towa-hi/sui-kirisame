import test from 'node:test';
import assert from 'node:assert/strict';
import { purchaseRoutes } from '../dist/purchase-routes.js';
import { umbrellaBcs } from '../dist/umbrella-routes.js';
import { stationBcs } from '../dist/inventory-routes.js';
import { originalId, packageId } from '../dist/deployment.js';

const id = '0x' + '1'.repeat(64), stationId = '0x' + '2'.repeat(64), sender = '0x' + '3'.repeat(64);
const umbrella = { id, supplier: id, name: 'Rain companion', color: 1, state: { Docked: true }, current_station_id: stationId, holder: null, inspection_deadline_ms: '0', purchase_price: '100000000', condition_bond: '30000000', active_escrow: '0', pending_condition: '30000000', pending_condition_owner: id, last_condition_amount: '30000000', last_condition_cycle: '0', last_condition_status: { Pending: true }, checkout_payout_address: null, admin_payout_address: null, owner_count: '9007199254740993' };
const station = { id: stationId, display_name: 'Tokyo', location_name: 'Tokyo', latitude_e6: '125680000', longitude_e6: '319760000', payout_address: id, maintenance_reserve: id, admin_payout_address: id, status: { Active: true }, docked_count: '1', authorized_cap: id };
const body = { sender, umbrellaId: id, stationId, purchasePrice: umbrella.purchase_price, ownerCount: umbrella.owner_count };
const request = (routes, data = body) => routes.request('/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
const routes = (asset = umbrella, dock = station, type = `${originalId}::umbrella::Umbrella`) => purchaseRoutes({ getObject: async options => {
  assert.equal(options.include.content, true);
  return { object: options.objectId === id ? { objectId: id, type, content: umbrellaBcs.serialize(asset).toBytes() } : { objectId: stationId, type: `${originalId}::umbrella::Station`, content: stationBcs.serialize(dock).toBytes() } };
} });

test('purchase builds exact payment, station, umbrella, full-precision cycle and clock arguments', async () => {
  const response = await request(routes());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json(), tx = JSON.parse(result.transaction);
  assert.equal(tx.sender, sender); assert.equal(result.network, 'sui:testnet');
  assert.equal(Buffer.from(tx.inputs[0].Pure.bytes, 'base64').readBigUInt64LE(), 100000000n);
  const call = tx.commands[1].MoveCall;
  assert.equal(call.package, packageId); assert.equal(call.module, 'umbrella'); assert.equal(call.function, 'user_undock_umbrella');
  assert.deepEqual(call.arguments, [{ Input: 1 }, { Input: 2 }, { NestedResult: [0, 0] }, { Input: 3 }, { Input: 4 }]);
  assert.equal(tx.inputs[1].UnresolvedObject.objectId, stationId);
  assert.equal(tx.inputs[2].UnresolvedObject.objectId, id);
  assert.equal(Buffer.from(tx.inputs[3].Pure.bytes, 'base64').readBigUInt64LE(), 9007199254740993n);
  assert.match(tx.inputs[4].UnresolvedObject.objectId, /0006$/);
});
test('rejects stale price, station and cycle, unavailable umbrellas and inactive stations', async () => {
  for (const change of [{ purchasePrice: '1' }, { stationId: sender }, { ownerCount: '0' }]) assert.equal((await request(routes(), { ...body, ...change })).status, 409);
  for (const state of ['Created', 'Held', 'Quarantined', 'Sold', 'Retired']) assert.equal((await request(routes({ ...umbrella, state: { [state]: true } }))).status, 409);
  for (const state of ['Removing', 'Removed']) assert.equal((await request(routes(umbrella, { ...station, status: { [state]: true } }))).status, 409);
  assert.equal((await request(routes(umbrella, station, '0x2::umbrella::Umbrella'))).status, 422);
});
test('invalid input is rejected before querying the chain; RPC failure does not return a transaction', async () => {
  let calls = 0;
  const app = purchaseRoutes({ getObject: async () => { calls++; throw Error('internal secret'); } });
  for (const data of [null, {}, { ...body, sender: 'bad' }, { ...body, umbrellaId: '0x1' }, { ...body, purchasePrice: 100000000 }, { ...body, ownerCount: '18446744073709551616' }]) assert.equal((await request(app, data)).status, 400);
  assert.equal(calls, 0);
  const response = await request(app);
  assert.equal(response.status, 502); assert.doesNotMatch(await response.text(), /internal secret|transaction/);
});
