import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { adminActions, adminScript } from '../dist/admin.js';

function setup() {
  const elements = new Map();
  function node() {
    return { value: '', children: [], handlers: {}, dataset: {},
      addEventListener(event, handler) { this.handlers[event] = handler; },
      append(child) { this.children.push(child); },
      prepend(child) { this.children.unshift(child); },
      replaceChildren() { this.children = []; },
      add(option) { this.children.push(option); },
      showModal() { this.open = true; }, close() { this.open = false; },
    };
  }
  const element = id => { if (!elements.has(id)) elements.set(id, node()); return elements.get(id); };
  const buttons = adminActions.map(action => Object.assign(node(), { dataset: { action: action.id } }));
  let selection;
  const context = {
    document: { getElementById: element, createElement: node, querySelectorAll: () => buttons },
    window: { addEventListener() {}, scanUmbrellaForAdmin(action, callback) { selection = { action, callback }; } },
    account: { address: 'admin' }, isMonoWallet: () => Boolean(context.account),
    Option: function(text, value) { this.text = text; this.value = value; },
    setTimeout: () => 0, clearTimeout() {},
  };
  // Inventory rendering has separate coverage; run the full admin controller.
  vm.runInNewContext(adminScript.slice(adminScript.indexOf('  const adminActions =')), context);
  return { context, element, buttons, selection: () => selection };
}
const data = { objectId: '0x' + '1'.repeat(64), station: '0x' + '2'.repeat(64), ownerCount: '18446744073709551615' };
for (const id of ['admin_retire_station_umbrella', 'admin_review_quarantined_umbrella', 'admin_retire_umbrella']) {
  test(id + ' scans before confirmation and fills fields without any owned station', () => {
    const app = setup();
    app.buttons.find(button => button.dataset.action === id).handlers.click();
    assert.equal(app.element('admin-dialog').open, undefined);
    assert.equal(app.selection().action, id);
    app.selection().callback(data);
    assert.equal(app.element('admin-dialog').open, true);
    const fields = app.element('admin-fields').children.map(label => label.children[0]);
    assert.equal(fields.find(input => input.name === 'umbrella').value, data.objectId);
    for (const field of fields) {
      if (field.name === 'approve_refund') {
        assert.equal(field.value, '');
        assert.equal(field.readOnly, undefined);
        assert.deepEqual(field.children.map(option => option.value), ['', 'true', 'false']);
      } else {
        assert.equal(field.readOnly, true);
        if (field.name === 'station') assert.equal(field.value, data.station);
        if (field.name === 'expected_owner_count') assert.equal(field.value, data.ownerCount);
      }
    }
  });
}
test('wallet change during admin scan prevents opening confirmation', () => {
  const app = setup();
  app.buttons.find(button => button.dataset.action === 'admin_retire_umbrella').handlers.click();
  app.context.account = { address: 'other' };
  app.selection().callback(data);
  assert.equal(app.element('admin-dialog').open, undefined);
  assert.match(app.element('toast-message').textContent, /wallet changed/);
});
