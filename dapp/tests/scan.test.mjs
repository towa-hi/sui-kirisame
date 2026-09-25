import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { scanScript } from '../dist/scan.js';

const id = '0x' + '1'.repeat(64);
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup({ camera, fetcher } = {}) {
  const elements = new Map();
  const element = key => {
    if (!elements.has(key)) elements.set(key, {
      hidden: false, disabled: false, textContent: '', value: '', handlers: {}, children: [],
      addEventListener(name, fn) { this.handlers[name] = fn; },
      showModal() { this.open = true; }, close() { this.open = false; this.handlers.close(); },
      play: async () => {}, append(...nodes) { this.children.push(...nodes); },
      replaceChildren(...nodes) { this.children = nodes; },
    });
    return elements.get(key);
  };
  let stopped = 0, scannerStopped = 0, decode;
  const stream = { getTracks: () => [{ stop: () => stopped++ }] };
  const document = {
    getElementById: element, createElement: () => ({ ...element('new' + Math.random()) }),
    head: { append: script => script.onload() }, addEventListener() {},
  };
  const context = {
    document, window: { isSecureContext: true, addEventListener() {} },
    navigator: { mediaDevices: { getUserMedia: camera || (async () => stream) } },
    ZXingBrowser: { BrowserMultiFormatReader: class { async decodeFromStream(_stream, _video, callback) { decode = callback; return { stop: () => scannerStopped++ }; } } },
    location: { origin: 'https://kirisame.example' }, URL, AbortController, setTimeout, clearTimeout,
    fetch: fetcher || (async () => ({ ok: true, json: async () => ({ objectId: id, color: 'Black', state: 'Docked', purchasePrice: '100000000', conditionBond: '30000000', feePerMs: '330', ownerCount: '0', supplier: id, conditionStatus: 'Pending' }) })),
    formatSui: value => String(value) + ' MIST',
  };
  vm.runInNewContext(scanScript, context);
  return { element, stream, open: async () => { element('scan-umbrella').handlers.click(); await tick(); }, scan: text => decode({ getText: () => text }), stopped: () => stopped, scannerStopped: () => scannerStopped };
}
test('a decoded barcode stops camera, looks up once, and displays details safely', async () => {
  let calls = 0;
  const app = setup({ fetcher: async url => {
    calls++; assert.equal(url, '/api/umbrellas/' + id);
    return { ok: true, json: async () => ({ objectId: id, color: '<img onerror=alert(1)>', state: 'Docked', purchasePrice: '100000000', conditionBond: '30000000', feePerMs: '330', supplier: id, ownerCount: '0', conditionStatus: 'Pending' }) };
  } });
  await app.open(); app.scan(id); app.scan(id); await tick();
  assert.equal(calls, 1); assert.equal(app.stopped(), 1); assert.equal(app.scannerStopped(), 1);
  assert.equal(app.element('scan-details').hidden, false);
  assert.equal(app.element('scan-details').children[0].children[1].textContent, '<img onerror=alert(1)>');
  assert.equal(app.element('scan-explorer').href, 'https://suiscan.xyz/testnet/object/' + id);
});
test('close while camera permission is pending stops the eventual stream', async () => {
  let resolveCamera;
  const app = setup({ camera: () => new Promise(resolve => { resolveCamera = resolve; }) });
  await app.open(); app.element('scan-close').handlers.click(); resolveCamera(app.stream); await tick();
  assert.equal(app.stopped(), 1); assert.equal(app.element('scan-dialog').open, false);
});
test('closing during lookup aborts it and stale results cannot update the modal', async () => {
  let resolveLookup, signal;
  const app = setup({ fetcher: (_url, options) => { signal = options.signal; return new Promise(resolve => { resolveLookup = resolve; }); } });
  await app.open(); app.scan(id); app.element('scan-close').handlers.click();
  assert.equal(signal.aborted, true);
  resolveLookup({ ok: true, json: async () => ({}) }); await tick();
  assert.equal(app.element('scan-details').hidden, true);
});
test('invalid scans offer retry without fetching; valid explorer URLs work', async () => {
  const app = setup(); await app.open(); app.scan('https://evil.example/' + id); await tick();
  assert.match(app.element('scan-error').textContent, /valid umbrella object ID/);
  assert.equal(app.element('scan-again').hidden, false);
  app.element('scan-again').handlers.click(); await tick();
  app.scan('https://suiscan.xyz/testnet/object/' + id); await tick();
  assert.equal(app.element('scan-details').hidden, false);
});
test('denied camera permission retains manual lookup and retry', async () => {
  const app = setup({ camera: async () => { throw Object.assign(new Error(), { name: 'NotAllowedError' }); } });
  await app.open();
  assert.match(app.element('scan-error').textContent, /permission was denied/);
  assert.equal(app.element('scan-again').hidden, false);
  app.element('scan-id').value = id;
  app.element('scan-form').handlers.submit({ preventDefault() {} }); await tick();
  assert.equal(app.element('scan-details').hidden, false);
});
