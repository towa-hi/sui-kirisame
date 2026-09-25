import test from 'node:test';
import assert from 'node:assert/strict';
import { supplyRoutes, conditionBond } from '../dist/supply-routes.js';
import { supplyScript } from '../dist/supply.js';
import vm from 'node:vm';

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
test('confirmed creation shows a QR and direct link; failed creation never shows a label', async () => {
  for (const success of [true, false]) {
    const elements = new Map();
    const element = id => {
      if (!elements.has(id)) elements.set(id, {
        value: '1', hidden: true, textContent: '', handlers: {},
        addEventListener(event, fn) { this.handlers[event] = fn; },
        setAttribute() {}, reportValidity() { return true; }, reset() {}, close() {}, append() {},
      });
      return elements.get(id);
    };
    const context = {
      document: { getElementById: element, createElement: () => ({}) },
      account: { address: sender, chains: ['sui:testnet'] },
      activeWallet: { features: { 'sui:signAndExecuteTransaction': { signAndExecuteTransaction: async () => ({ digest: 'digest' }) } } },
      location: { origin: 'https://kirisame.example' }, URL, AbortSignal,
      fetch: async url => ({ ok: true, json: async () => url.includes('/create') ? { transaction: '{}' } : { success, umbrellaIds: [sender] } }),
      showToast() {}, refreshBalance() {}, refreshInventory() {},
    };
    vm.runInNewContext(supplyScript, context);
    await element('supply-form').handlers.submit({ preventDefault() {} });
    assert.equal(element('supply-label').hidden, !success);
    if (success) {
      assert.equal(element('supply-umbrella-link').href, 'https://kirisame.example/?umbrella=' + sender);
      assert.equal(element('supply-qr').src, '/api/umbrellas/' + sender + '/qr?origin=https%3A%2F%2Fkirisame.example');
      assert.equal(element('supply-qr-download').href, element('supply-qr').src);
      element('supply-qr').handlers.error();
      assert.equal(element('supply-qr-error').hidden, false);
    } else assert.match(element('supply-error').textContent, /Unable to confirm/);
  }
});
