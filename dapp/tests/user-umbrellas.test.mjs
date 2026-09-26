import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { userUmbrellasScript } from '../dist/user-umbrellas.js';

const wallet = '0x' + '1'.repeat(64);
const other = '0x' + '2'.repeat(64);

function setup(fetcher = async () => Response.json({ items: [], nextCursor: null })) {
  const elements = new Map();
  function node(tag = '') {
    return {
      tag, children: [], dataset: {}, handlers: {}, checked: false,
      addEventListener(event, handler) { this.handlers[event] = handler; },
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; },
      setAttribute(name, value) { this[name] = value; },
    };
  }
  const element = id => {
    if (!elements.has(id)) elements.set(id, node());
    return elements.get(id);
  };
  const context = {
    document: { getElementById: element, createElement: node },
    window: { addEventListener(event, handler) { this[event] = handler; } },
    account: { address: wallet }, location: { origin: 'https://kirisame.example' },
    URL, AbortSignal, encodeURIComponent, fetch: fetcher,
  };
  vm.createContext(context);
  vm.runInContext(userUmbrellasScript, context);
  return { context, element };
}

test('wallet lists separate rented and supplied umbrellas and hide deactivated items by default', () => {
  const app = setup();
  app.context.fixtures = [
    { objectId: 'held', name: '<Held>', color: 'Black', status: 'Held', holder: wallet, supplier: other, station: null },
    { objectId: 'sold', name: 'Sold', color: 'White', status: 'Sold', holder: wallet, supplier: wallet, station: null },
    { objectId: 'docked', name: 'Docked', color: 'Vinyl', status: 'Docked', holder: null, supplier: wallet, station: other },
    { objectId: 'unrelated', name: 'Other', color: 'Black', status: 'Held', holder: other, supplier: other, station: null },
  ];
  vm.runInContext('userUmbrellas = new Map(fixtures.map(item => [item.objectId, item])); userUmbrellasLoaded = true; renderUserUmbrellas();', app.context);
  assert.equal(app.element('purchase-umbrellas-list').children.length, 1);
  assert.equal(app.element('purchase-umbrellas-list').children[0].children[0].children[0].textContent, '<Held> (Black)');
  assert.equal(app.element('purchase-umbrellas-list').children[0].children[0].children[0].children.length, 0);
  assert.equal(app.element('supply-umbrellas-list').children.length, 1);
  assert.match(app.element('purchase-umbrellas-status').textContent, /1 deactivated hidden/);
  assert.match(app.element('supply-umbrellas-status').textContent, /1 deactivated hidden/);

  app.element('purchase-umbrellas-deactivated').checked = true;
  app.element('purchase-umbrellas-deactivated').handlers.change();
  assert.equal(app.element('purchase-umbrellas-list').children.length, 2);
  assert.equal(app.element('supply-umbrellas-list').children.length, 1);
});

test('wallet umbrella loading follows all inventory pages', async () => {
  const calls = [];
  const app = setup(async url => {
    calls.push(url);
    return Response.json(url.includes('cursor=next')
      ? { items: [{ objectId: 'second', name: 'Second', color: 'White', status: 'Docked', holder: null, supplier: wallet }], nextCursor: null }
      : { items: [{ objectId: 'first', name: 'First', color: 'Black', status: 'Held', holder: wallet, supplier: other }], nextCursor: 'next' });
  });
  await app.context.loadUserUmbrellas();
  assert.equal(calls.length, 2);
  assert.match(calls[1], /cursor=next/);
  assert.equal(app.element('purchase-umbrellas-list').children.length, 1);
  assert.equal(app.element('supply-umbrellas-list').children.length, 1);
});
