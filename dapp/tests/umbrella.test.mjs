import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectError } from '@mysten/sui/client';
import { umbrellaRoutes, umbrellaBcs } from '../dist/umbrella-routes.js';
import { page } from '../dist/page.js';
import { originalId as pkg } from '../dist/deployment.js';
import QRCode from 'qrcode';

const id = '0x' + '1'.repeat(64);
const value = {
  id, supplier: id, color: 1, state: { Docked: true },
  current_station_id: id, checkout_station_id: null, holder: null,
  checkout_time_ms: '0', inspection_deadline_ms: '0', purchase_price: '100000000', fee_per_ms: '330', condition_bond: '30000000',
  active_escrow: '0', pending_condition: '30000000', pending_condition_owner: id,
  last_condition_amount: '30000000', last_condition_cycle: '0', last_condition_status: { Pending: true },
  checkout_payout_address: null, admin_payout_address: null, owner_count: '9007199254740993',
};
test('lookup decodes contract data without losing integer precision', async () => {
  const routes = umbrellaRoutes({ getObject: async options => {
    assert.equal(options.objectId, id);
    assert.equal(options.include.content, true);
    return { object: { objectId: id, type: `${pkg}::umbrella::Umbrella`, content: umbrellaBcs.serialize(value).toBytes() } };
  } });
  const response = await routes.request('/' + id);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const data = await response.json();
  assert.equal(data.color, 'Black'); assert.equal(data.state, 'Docked');
  assert.equal(data.station, id); assert.equal(data.holder, null);
  assert.equal(data.purchasePrice, '100000000'); assert.equal(data.ownerCount, '9007199254740993');
});
test('invalid scan IDs never reach the chain', async () => {
  const routes = umbrellaRoutes({ getObject: () => { throw new Error('should not be called'); } });
  for (const input of ['bad', '0x2', '0x' + 'g'.repeat(64)]) assert.equal((await routes.request('/' + input)).status, 400);
});
test('rejects unrelated objects, missing objects and chain failures distinctly', async () => {
  const wrong = umbrellaRoutes({ getObject: async () => ({ object: { type: '0x2::coin::Coin<0x2::sui::SUI>' } }) });
  assert.equal((await wrong.request('/' + id)).status, 422);
  const otherDeployment = umbrellaRoutes({ getObject: async () => ({ object: { type: `${id}::umbrella::Umbrella` } }) });
  const mismatch = await otherDeployment.request('/' + id);
  assert.equal(mismatch.status, 422);
  assert.match((await mismatch.json()).error, /different Kirisame deployment/);
  for (const reason of ['notFound', 'deleted']) {
    const missing = umbrellaRoutes({ getObject: async () => { throw new ObjectError('NOT_FOUND', 'missing', { reason }); } });
    assert.equal((await missing.request('/' + id)).status, 404);
  }
  const failed = umbrellaRoutes({ getObject: async () => { throw new Error('secret internal detail'); } });
  const response = await failed.request('/' + id);
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /secret/);
});
test('all rendered inline scripts parse', () => {
  for (const match of page.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(match[1]);
});
test('QR serves a Photos-compatible PNG with the Slush browse link, quiet zone, and download filename', async () => {
  const routes = umbrellaRoutes({ getObject: () => { throw Error('QR generation needs no chain query'); } });
  const response = await routes.request('/' + id + '/qr?origin=https%3A%2F%2Fkirisame.example');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('content-disposition'), `inline; filename="umbrella-${id}.png"`);
  const destination = 'https://kirisame.example/?umbrella=' + id;
  const slushLink = 'https://my.slush.app/browse/' + encodeURIComponent(destination);
  const expected = await QRCode.toBuffer(slushLink, { type: 'png', errorCorrectionLevel: 'M', margin: 4, width: 320 });
  const image = Buffer.from(await response.arrayBuffer());
  assert.deepEqual(image.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.equal(image.readUInt32BE(16), 320);
  assert.equal(image.readUInt32BE(20), 320);
  assert.deepEqual(image, expected);
  for (const origin of ['javascript:alert(1)', 'https://evil.example/path', 'https://user:pass@example.com']) {
    assert.equal((await routes.request('/' + id + '/qr?origin=' + encodeURIComponent(origin))).status, 400);
  }
  assert.equal((await routes.request('/bad/qr')).status, 400);
});
