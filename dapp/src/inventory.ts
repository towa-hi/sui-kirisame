export const inventoryMarkup = /* html */ `
  <div class="inventory-heading"><h1>Network inventory</h1><span>Testnet</span></div>
  <p class="inventory-intro">Stations and umbrellas in this deployment. Recent changes may take a moment to appear.</p>
  ${['stations', 'umbrellas'].map(kind => `
    <section class="inventory-section" aria-labelledby="${kind}-heading">
      <div class="inventory-toolbar"><h2 id="${kind}-heading">${kind === 'stations' ? 'Stations' : 'Umbrellas'} <span id="${kind}-count"></span></h2><button type="button" id="${kind}-refresh" aria-label="Refresh ${kind}">Refresh ↻</button></div>
      <p id="${kind}-status" class="inventory-status" role="status">Open Admin to load ${kind}.</p>
      <ul id="${kind}-list" class="inventory-list" tabindex="0" aria-labelledby="${kind}-heading" aria-busy="false"></ul>
      <button type="button" id="${kind}-more" class="inventory-more" hidden>Load more ${kind}</button>
    </section>`).join('')}
`;

export const inventoryStyles = /* css */ `
  .inventory-heading { display: flex; align-items: baseline; justify-content: space-between; margin-top: 1.75rem; }
  .inventory-heading h1 { margin: 0; font-size: 1.2rem; }
  .inventory-heading > span, .inventory-intro { color: #526358; font-size: .8rem; }
  .inventory-intro { margin: .4rem 0 1.25rem; }
  .inventory-section { margin-bottom: 1.5rem; }
  .inventory-toolbar { display: flex; align-items: center; justify-content: space-between; gap: .5rem; }
  .inventory-toolbar h2 { margin: 0; font-size: 1rem; }
  .inventory-toolbar h2 span { font-size: .75rem; font-weight: 400; color: #526358; }
  .inventory-toolbar button { flex: 0 0 auto; font-size: .8rem; }
  .inventory-status { margin: .25rem 0 .6rem; font-size: .8rem; color: #526358; }
  .inventory-status[data-error="true"] { color: #9a332e; }
  .inventory-list { list-style: none; margin: 0; padding: .2rem; display: grid; gap: .7rem; max-height: 420px; max-height: min(420px, 60svh); overflow-y: auto; overscroll-behavior-y: contain; scrollbar-gutter: stable; }
  .inventory-list:empty { display: none; }
  .inventory-list:focus-visible { outline: 2px solid #557866; outline-offset: 2px; border-radius: .75rem; }
  .inventory-card { min-width: 0; padding: 1rem; border: 1px solid #cad4cc; border-radius: .75rem; background: white; }
  .inventory-card-heading { display: flex; align-items: start; justify-content: space-between; gap: .5rem; }
  .inventory-card h3 { margin: 0; font-size: .95rem; }
  .inventory-badge { flex-shrink: 0; font-size: .7rem; padding: .2rem .5rem; border-radius: 1rem; background: #edf0ec; color: #526358; }
  .inventory-badge[data-status="Active"], .inventory-badge[data-status="Docked"] { background: #e4efe6; color: #315e40; }
  .inventory-badge[data-status="Quarantined"], .inventory-badge[data-status="Removing"] { background: #fff0d5; color: #805614; }
  .inventory-card dl { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); gap: .45rem .65rem; margin: .8rem 0 0; font-size: .75rem; line-height: 1.45; }
  .inventory-card dt { color: #526358; }
  .inventory-card dd { margin: 0; text-align: right; overflow-wrap: anywhere; }
  .inventory-card a { color: #315e40; text-underline-offset: 2px; }
  .inventory-more { width: 100%; border: 1px solid #cad4cc; margin-top: .6rem; font-size: .8rem; }
  .inventory-more[hidden] { display: none; }
`;

export const inventoryScript = /* js */ `
  const inventoryLists = Object.fromEntries(['stations', 'umbrellas'].map(kind => [kind, { pending: false, loaded: false, cursor: null, items: new Map() }]));
  function inventoryCard(kind, item) {
    const card = document.createElement('li');
    card.className = 'inventory-card';
    const heading = document.createElement('div');
    heading.className = 'inventory-card-heading';
    const title = document.createElement('h3');
    title.textContent = kind === 'stations' ? item.name || 'Unnamed station' : item.color + ' umbrella';
    const badge = document.createElement('span');
    badge.className = 'inventory-badge';
    badge.dataset.status = item.status;
    badge.textContent = item.status;
    heading.append(title, badge);
    const fields = document.createElement('dl');
    function field(label, value, object = false) {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      if (object && value) {
        const link = document.createElement('a');
        link.href = 'https://suiscan.xyz/testnet/' + (label === 'Supplier' || label === 'Holder' || label === 'Payout address' ? 'account/' : 'object/') + encodeURIComponent(value);
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = value;
        dd.append(link);
      } else dd.textContent = value ?? '—';
      fields.append(dt, dd);
    }
    field('Object ID', item.objectId, true);
    if (kind === 'stations') {
      field('Location', item.location || '—');
      field('Coordinates', item.latitude.toFixed(6) + ', ' + item.longitude.toFixed(6));
      field('Docked umbrellas', item.dockedCount);
      field('Payout address', item.payoutAddress, true);
    } else {
      field('Current station', item.station, true);
      field('Holder', item.holder, true);
      field('Supplier', item.supplier, true);
      field('Checkout count', item.ownerCount);
      field('Purchase price', formatSui(item.purchasePrice));
      field('Condition bond', formatSui(item.conditionBond));
      field('Active escrow', formatSui(item.activeEscrow));
      field('Pending condition', formatSui(item.pendingCondition));
      field('Condition status', item.conditionStatus);
    }
    card.append(heading, fields);
    return card;
  }
  async function loadInventory(kind, more = false) {
    const state = inventoryLists[kind];
    if (state.pending || (more && !state.cursor)) return;
    const list = document.getElementById(kind + '-list');
    const status = document.getElementById(kind + '-status');
    const refresh = document.getElementById(kind + '-refresh');
    const moreButton = document.getElementById(kind + '-more');
    state.pending = true;
    refresh.disabled = moreButton.disabled = true;
    list.setAttribute('aria-busy', 'true');
    status.dataset.error = 'false';
    status.textContent = more ? 'Loading more ' + kind + '…' : 'Refreshing ' + kind + '…';
    try {
      const response = await fetch('/api/inventory/' + kind + (more ? '?cursor=' + encodeURIComponent(state.cursor) : ''), { signal: AbortSignal.timeout(20000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to load ' + kind + '.');
      const nextItems = more ? new Map(state.items) : new Map();
      for (const item of result.items) nextItems.set(item.objectId, item);
      const cards = [...nextItems.values()].map(item => inventoryCard(kind, item));
      const scrollTop = more ? list.scrollTop : 0;
      list.replaceChildren(...cards);
      list.scrollTop = scrollTop;
      state.items = nextItems;
      state.cursor = result.nextCursor;
      state.loaded = true;
      document.getElementById(kind + '-count').textContent = '(' + state.items.size + (state.cursor ? '+' : '') + ')';
      status.textContent = state.items.size ? state.items.size + ' ' + kind + ' loaded' + (state.cursor ? ' · More available below.' : '.') : 'No ' + kind + ' found in this deployment.';
      moreButton.hidden = !state.cursor;
    } catch (error) {
      status.dataset.error = 'true';
      status.textContent = (state.items.size ? 'Showing previously loaded cards. ' : '') + (error.name === 'TimeoutError' ? 'Request timed out. Try Refresh.' : error.message || 'Unable to load data. Try Refresh.');
    } finally {
      state.pending = false;
      refresh.disabled = moreButton.disabled = false;
      list.setAttribute('aria-busy', 'false');
    }
  }
  function refreshInventory() {
    for (const kind of Object.keys(inventoryLists)) void loadInventory(kind);
  }
  function ensureInventory() {
    for (const [kind, state] of Object.entries(inventoryLists)) if (!state.loaded) void loadInventory(kind);
  }
  for (const kind of Object.keys(inventoryLists)) {
    document.getElementById(kind + '-refresh').addEventListener('click', () => void loadInventory(kind));
    document.getElementById(kind + '-more').addEventListener('click', () => void loadInventory(kind, true));
  }
`;
