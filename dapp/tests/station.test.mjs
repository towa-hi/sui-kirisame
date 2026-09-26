import test from 'node:test';
import assert from 'node:assert/strict';
import { adminRoutes } from '../dist/admin-routes.js';
import { stationActions } from '../dist/station.js';
import { stationCapBcs } from '../dist/station-access.js';
import { stationBcs } from '../dist/inventory-routes.js';
import { umbrellaBcs } from '../dist/umbrella-routes.js';
import { originalId } from '../dist/deployment.js';
import { page } from '../dist/page.js';

const sender = '0x' + '1'.repeat(64);
const parameters = { cap: '0x2', station: '0x3', umbrella: '0x4', expected_owner_count: '18446744073709551615' };
const id = '0x' + '4'.padStart(64, '0'), stationId = '0x' + '3'.padStart(64, '0');
const umbrella = { id, supplier: id, color: 1, state: { Docked: true }, current_station_id: stationId, checkout_station_id: null, holder: null, checkout_time_ms: '0', inspection_deadline_ms: '0', purchase_price: '100000000', fee_per_ms: '330', condition_bond: '30000000', active_escrow: '0', pending_condition: '30000000', pending_condition_owner: id, last_condition_amount: '30000000', last_condition_cycle: '0', last_condition_status: { Pending: true }, checkout_payout_address: null, admin_payout_address: null, owner_count: '18446744073709551615' };
const station = { id: stationId, display_name: 'Tokyo', location_name: 'Tokyo', latitude_e6: '125680000', longitude_e6: '319760000', payout_address: id, maintenance_reserve: id, admin_payout_address: id, status: { Active: true }, docked_count: '1' };
const capId = '0x' + '2'.padStart(64, '0');
const client = {
  listOwnedObjects: async () => ({ objects: [{ objectId: capId, content: stationCapBcs.serialize({ id: capId, station: stationId }).toBytes() }], hasNextPage: false }),
  getObject: async ({ objectId }) => ({ object: objectId === stationId ? { objectId, type: `${originalId}::umbrella::Station`, content: stationBcs.serialize(station).toBytes() } : { objectId, type: `${originalId}::umbrella::Umbrella`, content: umbrellaBcs.serialize(umbrella).toBytes() } }),
};
const request = (routes, action, values = parameters) => routes.request('/' + action, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sender, parameters: values }),
});

test('both station operations prepare unsigned calls with capability, station, umbrella, count and clock in contract order', async () => {
  const routes = adminRoutes(client, 'station');
  for (const action of stationActions) {
    const response = await request(routes, action.id);
    assert.equal(response.status, 200);
    const tx = JSON.parse((await response.json()).transaction);
    assert.equal(tx.sender, sender);
    const call = tx.commands[0].MoveCall;
    assert.equal(call.function, action.id);
    assert.equal(call.module, 'umbrella');
    assert.deepEqual(call.arguments.map(arg => arg.Input), [0, 1, 2, 3, 4]);
    for (const [index, suffix] of [[0, '2'], [1, '3'], [2, '4'], [4, '6']]) {
      assert.equal(tx.inputs[index].UnresolvedObject.objectId, '0x' + suffix.padStart(64, '0'));
    }
    assert.equal(tx.inputs[3].Pure.bytes, '//////////8=');
  }
});

test('station routes reject invalid inputs and admin operations', async () => {
  const routes = adminRoutes(client, 'station');
  for (const [name, value] of [['cap', 'invalid'], ['station', ''], ['umbrella', null], ['expected_owner_count', '-1'], ['expected_owner_count', '18446744073709551616']]) {
    assert.equal((await request(routes, stationActions[0].id, { ...parameters, [name]: value })).status, 400);
  }
  assert.equal((await request(routes, 'admin_remove_station')).status, 404);
  assert.equal((await request(adminRoutes({}), 'station_dock_umbrella')).status, 404);
});

test('station panel contains buttons for both operations', () => {
  const panel = page.match(/<section id="station-panel"[\s\S]*?<\/section>/)[0];
  for (const action of stationActions) assert.ok(panel.includes('data-action="' + action.id + '"'));
  assert.ok(!panel.includes('Under construction'));
});

test('dock requires an owned station and derives the current count from chain', async () => {
  const forbidden = adminRoutes({ ...client, listOwnedObjects: async () => ({ objects: [], hasNextPage: false }) }, 'station');
  assert.equal((await request(forbidden, 'station_dock_umbrella')).status, 403);
  assert.equal((await request(adminRoutes(client, 'station'), 'station_dock_umbrella', { ...parameters, station: '0x9' })).status, 403);
  const response = await request(adminRoutes(client, 'station'), 'station_dock_umbrella', { ...parameters, expected_owner_count: '0' });
  const tx = JSON.parse((await response.json()).transaction);
  assert.equal(tx.inputs[3].Pure.bytes, '//////////8=');
});
test('owned stations endpoint returns active stations and handles pagination', async () => {
  let calls = 0;
  const routes = adminRoutes({ ...client, listOwnedObjects: async ({ cursor }) => {
    calls++;
    if (!cursor) return { objects: [], hasNextPage: true, cursor: 'next' };
    return client.listOwnedObjects();
  } }, 'station');
  const response = await routes.request('/owned/' + sender);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).stations, [{ cap: capId, station: stationId, name: 'Tokyo' }]);
  assert.equal(calls, 2);
});
