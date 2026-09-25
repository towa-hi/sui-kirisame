import test from 'node:test';
import assert from 'node:assert/strict';
import { supplyRoutes, conditionBond } from '../dist/supply-routes.js';

const sender = '0x' + '1'.repeat(64);
const request = body => supplyRoutes().request('/create', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

test('all supported colors create an unsigned transaction with the exact condition bond', async () => {
  for (const color of [0, 1, 2]) {
    const response = await request({ sender, color });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.network, 'sui:testnet');
    const tx = JSON.parse(result.transaction);
    assert.equal(tx.sender, sender);
    const split = tx.commands[0].SplitCoins;
    assert.deepEqual(split.coin, { GasCoin: true });
    assert.equal(Buffer.from(tx.inputs[0].Pure.bytes, 'base64').readBigUInt64LE(), BigInt(conditionBond));
    assert.equal(conditionBond, 30_000_000);
    const call = tx.commands[1].MoveCall;
    assert.equal(call.function, 'user_create_umbrella');
    assert.equal(call.module, 'umbrella');
    assert.deepEqual(call.arguments[0], { NestedResult: [0, 0] });
    assert.equal(Buffer.from(tx.inputs[1].Pure.bytes, 'base64')[0], color);
  }
});

test('rejects missing, coerced, fractional, and unsupported colors and invalid senders', async () => {
  for (const color of [undefined, null, '', '1', -1, 3, 1.5, true, {}, []]) {
    assert.equal((await request({ sender, color })).status, 400);
  }
  for (const body of [null, {}, { sender: 'bad', color: 0 }]) {
    assert.equal((await request(body)).status, 400);
  }
  assert.equal((await supplyRoutes().request('/create', { method: 'POST', body: '{' })).status, 400);
});
