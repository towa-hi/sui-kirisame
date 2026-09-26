import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { scanScript } from '../dist/scan.js';

const id = '0x' + '1'.repeat(64);
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup({ camera, fetcher, search = '', account = null, wallet = null } = {}) {
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
    account, activeWallet: wallet, AbortSignal, refreshBalance() {}, refreshInventory() {},
    location: { origin: 'https://kirisame.example', search }, URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
    fetch: fetcher || (async () => ({ ok: true, json: async () => ({ objectId: id, color: 'Black', state: 'Docked', purchasePrice: '100000000', conditionBond: '30000000', ownerCount: '0', supplier: id, conditionStatus: 'Pending' }) })),
    formatSui: value => String(value) + ' MIST',
  };
  vm.runInNewContext(scanScript, context);
  return { context, element, stream, open: async () => { element('scan-umbrella').handlers.click(); await tick(); }, scan: text => decode({ getText: () => text }), stopped: () => stopped, scannerStopped: () => scannerStopped };
}
test('a decoded barcode stops camera, looks up once, and displays details safely', async () => {
  let calls = 0;
  const app = setup({ fetcher: async url => {
    calls++; assert.equal(url, '/api/umbrellas/' + id);
    return { ok: true, json: async () => ({ objectId: id, name: '<img onerror=alert(1)>', color: '<img onerror=alert(1)>', state: 'Docked', purchasePrice: '100000000', conditionBond: '30000000', supplier: id, ownerCount: '0', conditionStatus: 'Pending' }) };
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

test('umbrella deep link opens the same modal without camera access', async () => {
  let cameras = 0, calls = 0;
  const app = setup({ search: '?umbrella=' + id, camera: async () => { cameras++; throw Error('unexpected'); } });
  await tick();
  assert.equal(cameras, 0);
  assert.equal(app.element('scan-dialog').open, true);
  assert.equal(app.element('scan-video').hidden, true);
  assert.equal(app.element('scan-details').hidden, false);
  assert.equal(app.element('scan-explorer').href, 'https://suiscan.xyz/testnet/object/' + id);
});
test('invalid deep links display an error without fetching or accessing camera', async () => {
  let calls = 0;
  const app = setup({ search: '?umbrella=bad', fetcher: async () => { calls++; }, camera: async () => { calls++; } });
  await tick();
  assert.equal(calls, 0);
  assert.equal(app.element('scan-dialog').open, true);
  assert.match(app.element('scan-error').textContent, /valid umbrella object ID/);
});
test('scanning an app link resolves the umbrella details', async () => {
  const app = setup(); await app.open();
  app.scan('https://kirisame.example/?umbrella=' + id); await tick();
  assert.equal(app.element('scan-details').hidden, false);
});

const docked = { objectId: id, station: '0x' + '2'.repeat(64), color: 'Black', state: 'Docked', purchasePrice: '100000000', conditionBond: '30000000', ownerCount: '0', supplier: id, conditionStatus: 'Pending' };
const buyer = { address: '0x' + '3'.repeat(64), chains: ['sui:testnet'] };
const response = (data, status = 200) => ({ ok: status === 200, status, json: async () => data });
test('purchase signs exact prepared transaction once and refreshes confirmed ownership', async () => {
  let signed = 0, confirmed = false;
  const app = setup({ account: buyer, search: '?umbrella=' + id,
    wallet: { features: { 'sui:signAndExecuteTransaction': { signAndExecuteTransaction: async options => {
      signed++; assert.equal(options.account, buyer); assert.equal(options.chain, 'sui:testnet');
      assert.equal(await options.transaction.toJSON(), 'prepared'); return { digest: 'purchase-digest' };
    } } } },
    fetcher: async (url, options) => {
      if (url === '/api/purchase') {
        assert.deepEqual(JSON.parse(options.body), { sender: buyer.address, umbrellaId: id, stationId: docked.station, purchasePrice: docked.purchasePrice, ownerCount: docked.ownerCount });
        return response({ transaction: 'prepared' });
      }
      if (url.includes('/transactions/')) { confirmed = true; return response({ success: true }); }
      return response(confirmed ? { ...docked, state: 'Held', station: null, holder: buyer.address } : docked);
    },
  });
  await tick();
  assert.equal(app.element('purchase-confirm').disabled, false);
  const first = app.element('purchase-confirm').handlers.click();
  await app.element('purchase-confirm').handlers.click();
  await first;
  assert.equal(signed, 1);
  assert.match(app.element('purchase-status').textContent, /Purchase confirmed/);
  assert.equal(app.element('purchase-confirm').hidden, true);
});
test('uncertain confirmation retries the same digest without signing again', async () => {
  let signed = 0, checks = 0;
  const app = setup({ account: buyer, search: '?umbrella=' + id,
    wallet: { features: { 'sui:signAndExecuteTransaction': { signAndExecuteTransaction: async () => { signed++; return { digest: 'pending-digest' }; } } } },
    fetcher: async url => url === '/api/purchase' ? response({ transaction: '{}' }) : url.includes('/transactions/') ? (++checks === 1 ? response({ error: 'Still pending' }, 504) : response({ success: true })) : response(checks > 1 ? { ...docked, state: 'Held', station: null } : docked),
  });
  await tick(); await app.element('purchase-confirm').handlers.click();
  assert.equal(app.element('purchase-confirm').textContent, 'Check purchase status');
  assert.match(app.element('purchase-transaction').href, /pending-digest$/);
  await app.element('purchase-confirm').handlers.click();
  assert.equal(signed, 1); assert.equal(checks, 2);
  assert.match(app.element('purchase-status').textContent, /Purchase confirmed/);
});
test('purchase requires connection and a docked umbrella', async () => {
  const app = setup({ search: '?umbrella=' + id, fetcher: async () => response(docked) });
  await tick();
  assert.equal(app.element('purchase-confirm').disabled, true);
  assert.equal(app.element('purchase-connect').hidden, false);
  const held = setup({ account: buyer, search: '?umbrella=' + id, fetcher: async () => response({ ...docked, state: 'Held', station: null }) });
  await tick(); assert.equal(held.element('purchase-confirm').hidden, true);
});
test('wallet rejection and on-chain failure never display purchase success', async () => {
  for (const rejected of [true, false]) {
    const app = setup({ account: buyer, search: '?umbrella=' + id,
      wallet: { features: { 'sui:signAndExecuteTransaction': { signAndExecuteTransaction: async () => { if (rejected) throw Error('User rejected'); return { digest: 'failed' }; } } } },
      fetcher: async url => url === '/api/purchase' ? response({ transaction: '{}' }) : url.includes('/transactions/') ? response({ error: 'Failed on chain' }, 422) : response(docked),
    });
    await tick(); await app.element('purchase-confirm').handlers.click();
    assert.equal(app.element('purchase-status').textContent, '');
    assert.match(app.element('scan-error').textContent, rejected ? /User rejected/ : /Failed on chain/);
    assert.equal(app.element('purchase-confirm').disabled, false);
  }
});
test('wallet change during preparation prevents signing', async () => {
  let finish, signed = 0;
  const app = setup({ account: buyer, search: '?umbrella=' + id,
    wallet: { features: { 'sui:signAndExecuteTransaction': { signAndExecuteTransaction: async () => { signed++; } } } },
    fetcher: async url => url === '/api/purchase' ? new Promise(resolve => { finish = resolve; }) : response(docked),
  });
  await tick(); const pending = app.element('purchase-confirm').handlers.click();
  app.context.account = null; finish(response({ transaction: '{}' })); await pending;
  assert.equal(signed, 0); assert.match(app.element('scan-error').textContent, /wallet changed/);
});

test('dock scanning selects a new umbrella without showing purchase actions', async () => {
  let selected;
  const app = setup({ fetcher: async () => ({ ok: true, json: async () => ({ objectId: id, state: 'Created', ownerCount: '9007199254740993' }) }) });
  app.context.window.scanUmbrellaForDock(data => { selected = data; });
  await tick(); app.scan(id); await tick();
  assert.equal(selected.objectId, id);
  assert.equal(selected.ownerCount, '9007199254740993');
  assert.equal(app.element('scan-dialog').open, false);
  assert.equal(app.element('purchase-confirm').hidden, true);
  assert.equal(app.stopped(), 1);
});
test('dock scanning extracts IDs from Slush and existing labels across app hosts', async () => {
  const labelId = '0x43a5017e1587ce91c713080d8408f2509f2094adcd08198c57d67785a6162082';
  const link = 'https://kirisame-dapp.onrender.com/?umbrella=' + labelId;
  for (const label of [link, 'https://my.slush.app/browse/' + link,
    'https://my.slush.app/browse/' + encodeURIComponent(link)]) {
    let selected, calls = 0;
    const app = setup({ fetcher: async url => {
      calls++;
      assert.equal(url, '/api/umbrellas/' + labelId);
      return response({ objectId: labelId, state: 'Created', ownerCount: '0' });
    } });
    app.context.window.scanUmbrellaForDock(data => { selected = data; });
    await tick(); app.scan(label); await tick();
    assert.equal(calls, 1);
    assert.equal(selected.objectId, labelId);
    assert.equal(app.element('scan-dialog').open, false);
  }
});
test('malformed labels never trigger an object lookup', async () => {
  for (const label of ['https://my.slush.app/browse/%ZZ',
    'https://my.slush.app/browse/javascript:alert(1)?umbrella=' + id,
    'javascript:alert(1)?umbrella=' + id,
    'https://kirisame.example/?umbrella=0x123',
    'https://my.slush.app/browse/https://kirisame.example/']) {
    let calls = 0;
    const app = setup({ fetcher: async () => { calls++; } });
    await app.open(); app.scan(label); await tick();
    assert.equal(calls, 0);
    assert.match(app.element('scan-error').textContent, /valid umbrella object ID/);
  }
});
test('dock scanning rejects unavailable umbrellas and can be cancelled', async () => {
  let selected = false;
  const app = setup();
  app.context.window.scanUmbrellaForDock(() => { selected = true; });
  await tick(); app.scan(id); await tick();
  assert.equal(selected, false);
  assert.match(app.element('scan-error').textContent, /Only new or checked-out/);
  app.element('scan-close').handlers.click();
  await app.open(); app.scan(id); await tick();
  assert.equal(app.element('scan-details').hidden, false);
});

test('sold umbrella shows permanent ownership and cannot be purchased', async () => {
  const app = setup({ fetcher: async () => ({ ok: true, json: async () => ({
    ...docked, state: 'Sold', holder: id,
  }) }) });
  await app.open(); app.scan(id); await tick();
  assert.equal(app.element('scan-status').textContent, 'This umbrella has been removed from the system and is permanently yours.');
  assert.equal(app.element('purchase-confirm').hidden, true);
  const rows = app.element('scan-details').children;
  assert.ok(rows.some(row => row.children[0].textContent === 'Usage period' && row.children[1].textContent === '1 day after the 2-minute inspection window'));
});

test('quarantine scanning selects a held umbrella and preserves its checkout count', async () => {
  let selected;
  const app = setup({ fetcher: async () => response({ objectId: id, state: 'Held', ownerCount: '9007199254740993' }) });
  app.context.window.scanUmbrellaForQuarantine(data => { selected = data; });
  await tick();
  assert.equal(app.element('scan-title').textContent, 'Scan umbrella to quarantine');
  app.scan(id); await tick();
  assert.equal(selected.objectId, id);
  assert.equal(selected.ownerCount, '9007199254740993');
  assert.equal(app.element('scan-dialog').open, false);
  assert.equal(app.element('purchase-confirm').hidden, true);
  assert.equal(app.stopped(), 1);
});

test('quarantine scanning rejects other states and allows retry with a held umbrella', async () => {
  for (const state of ['Created', 'Docked', 'Quarantined', 'Sold', 'Retired']) {
    let selected, currentState = state;
    const app = setup({ fetcher: async () => response({ objectId: id, state: currentState, ownerCount: '1' }) });
    app.context.window.scanUmbrellaForQuarantine(data => { selected = data; });
    await tick(); app.scan(id); await tick();
    assert.equal(selected, undefined);
    assert.equal(app.element('scan-dialog').open, true);
    assert.match(app.element('scan-error').textContent, /Only checked-out umbrellas/);
    currentState = 'Held';
    app.element('scan-again').handlers.click(); await tick();
    app.scan(id); await tick();
    assert.equal(selected.state, 'Held');
  }
});

const adminScans = [
  ['admin_retire_station_umbrella', { ...docked }],
  ['admin_review_quarantined_umbrella', { ...docked, state: 'Quarantined', conditionStatus: 'AwaitingReview' }],
  ['admin_retire_umbrella', { ...docked, state: 'Quarantined', conditionStatus: 'Paid' }],
  ['admin_retire_umbrella', { ...docked, state: 'Quarantined', conditionStatus: 'Forfeited' }],
];
test('admin QR scans preserve station and precise checkout count without purchase actions', async () => {
  for (const [action, data] of adminScans) {
    let selected;
    const app = setup({ fetcher: async () => response({ ...data, ownerCount: '18446744073709551615' }) });
    app.context.window.scanUmbrellaForAdmin(action, value => { selected = value; });
    await tick();
    app.scan('https://my.slush.app/browse/' + encodeURIComponent('https://kirisame.example/?umbrella=' + id));
    await tick();
    assert.equal(selected.objectId, id);
    assert.equal(selected.station, docked.station);
    assert.equal(selected.ownerCount, '18446744073709551615');
    assert.equal(app.element('scan-dialog').open, false);
    assert.equal(app.element('purchase-confirm').hidden, true);
    assert.equal(app.stopped(), 1);
  }
});
test('admin scans reject ineligible states and allow retry with eligible umbrellas', async () => {
  for (const [action, valid] of adminScans) {
    for (const invalid of [{ ...valid, state: 'Sold' }, { ...valid, station: null, conditionStatus: 'RefundApproved' }]) {
      if (action === 'admin_retire_umbrella') invalid.conditionStatus = 'RefundApproved';
      let selected, data = invalid;
      const app = setup({ fetcher: async () => response(data) });
      app.context.window.scanUmbrellaForAdmin(action, value => { selected = value; });
      await tick(); app.scan(id); await tick();
      assert.equal(selected, undefined);
      assert.equal(app.element('scan-dialog').open, true);
      assert.ok(app.element('scan-error').textContent);
      data = valid;
      app.element('scan-again').handlers.click(); await tick(); app.scan(id); await tick();
      assert.equal(selected.objectId, id);
    }
  }
});
test('admin scanner permits manual lookup after camera denial and resets selection on cancel', async () => {
  let selected;
  const app = setup({ camera: async () => { throw Object.assign(new Error(), { name: 'NotAllowedError' }); }, fetcher: async () => response(docked) });
  app.context.window.scanUmbrellaForAdmin('admin_retire_station_umbrella', data => { selected = data; });
  await tick();
  app.element('scan-id').value = id;
  app.element('scan-form').handlers.submit({ preventDefault() {} }); await tick();
  assert.equal(selected.objectId, id);
  selected = undefined;
  app.context.window.scanUmbrellaForAdmin('admin_retire_station_umbrella', data => { selected = data; });
  app.element('scan-close').handlers.click();
  await app.open();
  app.element('scan-form').handlers.submit({ preventDefault() {} }); await tick();
  assert.equal(selected, undefined);
  assert.equal(app.element('scan-details').hidden, false);
});
