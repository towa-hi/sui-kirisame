import test from 'node:test';
import assert from 'node:assert/strict';
import { adminRoutes } from '../dist/admin-routes.js';
import { stationActions } from '../dist/station.js';
import { page } from '../dist/page.js';

const sender = '0x' + '1'.repeat(64);
const parameters = { cap: '0x2', station: '0x3', umbrella: '0x4', expected_owner_count: '18446744073709551615' };
const request = (routes, action, values = parameters) => routes.request('/' + action, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sender, parameters: values }),
});

test('both station operations prepare unsigned calls with capability, station, umbrella, count and clock in contract order', async () => {
  const routes = adminRoutes({}, 'station');
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
  const routes = adminRoutes({}, 'station');
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
