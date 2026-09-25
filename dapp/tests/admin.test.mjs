import test from 'node:test';
import assert from 'node:assert/strict';
import { adminRoutes } from '../dist/admin-routes.js';
import { adminActions } from '../dist/admin.js';
import { page } from '../dist/page.js';
const sender = '0x' + '1'.repeat(64);
const cap = '0x' + '2'.repeat(64);
const params = action => Object.fromEntries(action.fields.map(field => [field.name, field.kind === 'boolean' ? false : field.kind === 'object' ? '0x3' : field.kind === 'integer' ? '1' : 'Station']));
const request = (routes, action, parameters = params(action)) => routes.request('/' + action.id, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sender, parameters }) });
test('all admin functions prepare correct ordered arguments without execution', async () => {
  const routes = adminRoutes({ listOwnedObjects: async options => {
    assert.equal(options.owner, sender);
    assert.match(options.type, /::umbrella::AdminCap$/);
    return { objects: [{ objectId: cap }] };
  } });
  for (const action of adminActions) {
    const response = await request(routes, action);
    assert.equal(response.status, 200);
    const tx = JSON.parse((await response.json()).transaction);
    assert.equal(tx.sender, sender);
    const call = tx.commands[0].MoveCall;
    assert.equal(call.function, action.id);
    assert.equal(call.module, 'umbrella');
    assert.equal(call.arguments.length, 1 + action.fields.length + Number(action.id === 'admin_settle_pending_payments'));
    assert.equal(tx.inputs[0].UnresolvedObject.objectId, cap);
    if (action.id === 'admin_review_quarantined_umbrella') assert.equal(tx.inputs.at(-1).Pure.bytes, 'AA==');
    if (action.id === 'admin_settle_pending_payments') assert.match(tx.inputs.at(-1).UnresolvedObject.objectId, /0006$/);
  }
});
test('rejects invalid parameters before accessing the chain', async () => {
  const routes = adminRoutes({ listOwnedObjects: () => { throw new Error('must not query'); } });
  const action = adminActions[0];
  for (const [key, value] of [['latitude_e6', '180000001'], ['longitude_e6', '-1'], ['payout_address', 'invalid'], ['display_name', '   ']]) {
    assert.equal((await request(routes, action, { ...params(action), [key]: value })).status, 400);
  }
});
test('requires an owned AdminCap', async () => {
  const routes = adminRoutes({ listOwnedObjects: async () => ({ objects: [] }) });
  assert.equal((await request(routes, adminActions[1])).status, 403);
});
test('on-chain failure and unavailable confirmation never report success', async () => {
  const digest = '11111111111111111111111111111111';
  for (const [result, expected] of [[{ $kind: 'Transaction', Transaction: { status: { success: true } } }, 200], [{ $kind: 'FailedTransaction' }, 422], [null, 504]]) {
    const routes = adminRoutes({ waitForTransaction: async () => { if (!result) throw Error('timeout'); return result; } });
    assert.equal((await routes.request('/transactions/' + digest)).status, expected);
  }
});
test('rendered browser script parses', () => {
  new Function(page.match(/<script>([\s\S]*?)<\/script>/)[1]);
});
