const umbrellaListMarkup = (kind: 'purchase' | 'supply', title: string) => /* html */ `
  <section class="user-umbrellas" aria-labelledby="${kind}-umbrellas-heading">
    <div class="user-umbrellas-toolbar">
      <h2 id="${kind}-umbrellas-heading">${title} <span id="${kind}-umbrellas-count"></span></h2>
      <button type="button" id="${kind}-umbrellas-refresh">Refresh</button>
    </div>
    <label class="deactivated-toggle">
      <input type="checkbox" id="${kind}-umbrellas-deactivated">
      Show deactivated umbrellas
    </label>
    <p id="${kind}-umbrellas-status" class="user-umbrellas-status" role="status">Connect your wallet to load umbrellas.</p>
    <ul id="${kind}-umbrellas-list" class="user-umbrellas-list" aria-labelledby="${kind}-umbrellas-heading" aria-busy="false"></ul>
  </section>`;

export const purchaseUmbrellasMarkup = umbrellaListMarkup('purchase', 'Umbrellas you rented');
export const supplyUmbrellasMarkup = umbrellaListMarkup('supply', 'Umbrellas you supplied');

export const userUmbrellasStyles = /* css */ `
  .user-umbrellas { margin-top: 1.75rem; padding-top: 1.25rem; border-top: 1px solid #cad4cc; }
  .user-umbrellas-toolbar { display: flex; align-items: center; justify-content: space-between; gap: .5rem; }
  .user-umbrellas-toolbar h2 { margin: 0; font-size: 1rem; }
  .user-umbrellas-toolbar h2 span { color: #526358; font-size: .75rem; font-weight: 400; }
  .user-umbrellas-toolbar button { flex: 0 0 auto; border: 1px solid #cad4cc; background: #fff; font-size: .8rem; }
  .deactivated-toggle { display: inline-flex; align-items: center; gap: .5rem; margin-top: .75rem; color: #526358; font-size: .8rem; cursor: pointer; }
  .deactivated-toggle input { width: 1rem; height: 1rem; margin: 0; accent-color: #315e40; }
  .deactivated-toggle:has(input:focus-visible) { outline: 2px solid #557866; outline-offset: 3px; border-radius: .2rem; }
  .user-umbrellas-status { margin: .45rem 0 .65rem; color: #526358; font-size: .8rem; }
  .user-umbrellas-status[data-error="true"] { color: #9a332e; }
  .user-umbrellas-list { display: grid; gap: .7rem; margin: 0; padding: 0; list-style: none; }
  .user-umbrellas-list:empty { display: none; }
  .user-umbrella-card { display: flex; align-items: flex-start; gap: .75rem; padding: .9rem; border: 1px solid #cad4cc; border-radius: .75rem; background: #fff; }
  .user-umbrella-card[data-status="Sold"], .user-umbrella-card[data-status="Retired"] { background: #e8e8e8; }
  .user-umbrella-icon { flex: 0 0 auto; width: clamp(2.5rem, 10vw, 4rem); height: clamp(2.5rem, 10vw, 4rem); object-fit: contain; }
  .user-umbrella-details { flex: 1; min-width: 0; }
  .user-umbrella-heading { display: flex; align-items: start; justify-content: space-between; gap: .5rem; }
  .user-umbrella-heading h3 { min-width: 0; margin: 0; font-size: .95rem; overflow-wrap: anywhere; }
  .user-umbrella-badge { flex-shrink: 0; padding: .2rem .5rem; border-radius: 1rem; background: #edf0ec; color: #526358; font-size: .7rem; }
  .user-umbrella-badge[data-status="Docked"], .user-umbrella-badge[data-status="Held"] { background: #e4efe6; color: #315e40; }
  .user-umbrella-badge[data-status="Quarantined"] { background: #fff0d5; color: #805614; }
  .user-umbrella-card p { margin: .45rem 0 0; color: #526358; font-size: .75rem; line-height: 1.5; overflow-wrap: anywhere; }
  .held-umbrella-timer { padding: .55rem .65rem; border-radius: .5rem; background: #edf4ee; color: #315e40 !important; font-variant-numeric: tabular-nums; }
  .user-umbrella-card a { color: #315e40; text-underline-offset: 2px; }
`;

export const userUmbrellasScript = /* js */ `
  const userUmbrellaViews = ['purchase', 'supply'];
  const deactivatedUmbrellaStates = new Set(['Sold', 'Retired']);
  const umbrellaUsagePeriodMs = 86400000n;
  let userUmbrellas = new Map(), userUmbrellasAddress = '', userUmbrellasLoaded = false, userUmbrellasPending = false, userUmbrellasError = '';

  function heldUmbrellaTimerText(item, now = Date.now()) {
    if (!/^[0-9]+$/.test(item.inspectionDeadlineMs || '') || !/^[0-9]+$/.test(item.purchasePrice || '')) return 'Usage timing unavailable · Refresh to try again.';
    const elapsed = BigInt(Math.max(0, Math.trunc(now))) - BigInt(item.inspectionDeadlineMs);
    if (elapsed <= 0n) return 'Refund Window Active · Estimated cost: 0 SUI';
    const chargedMs = elapsed < umbrellaUsagePeriodMs ? elapsed : umbrellaUsagePeriodMs;
    const cost = BigInt(item.purchasePrice) * chargedMs / umbrellaUsagePeriodMs;
    const totalSeconds = elapsed / 1000n;
    const days = totalSeconds / 86400n;
    const hours = totalSeconds % 86400n / 3600n;
    const minutes = totalSeconds % 3600n / 60n;
    const seconds = totalSeconds % 60n;
    const clock = [hours, minutes, seconds].map(value => value.toString().padStart(2, '0')).join(':');
    return 'Time since refund window: ' + (days ? days + 'd ' : '') + clock + ' · Estimated cost: ' + formatSui(cost);
  }

  function updateHeldUmbrellaTimers(now = Date.now()) {
    for (const timer of document.querySelectorAll('.held-umbrella-timer')) timer.textContent = heldUmbrellaTimerText(timer.dataset, now);
  }

  function userUmbrellaCard(item, kind = 'purchase') {
    const card = document.createElement('li');
    card.className = 'user-umbrella-card';
    card.dataset.status = item.status;
    const icon = document.createElement('img');
    icon.className = 'user-umbrella-icon';
    const color = String(item.color || '').toLowerCase();
    const iconColor = ['vinyl', 'black', 'blue', 'green', 'orange', 'pink', 'purple', 'red', 'yellow'].includes(color) ? color : 'vinyl';
    icon.src = '/assets/umbrellas/' + (item.status === 'Quarantined' || item.status === 'Retired' ? 'broken_kasa_vinyl' : 'rain_kasa_' + iconColor) + '.png';
    icon.alt = '';
    icon.width = 64;
    icon.height = 64;
    const details = document.createElement('div');
    details.className = 'user-umbrella-details';
    const heading = document.createElement('div');
    heading.className = 'user-umbrella-heading';
    const title = document.createElement('h3');
    title.textContent = (item.name || 'Supplier Umbrella') + ' (' + item.color + ')';
    const badge = document.createElement('span');
    badge.className = 'user-umbrella-badge';
    badge.dataset.status = item.status;
    badge.textContent = item.status;
    heading.append(title, badge);
    const summary = document.createElement('p');
    summary.textContent = item.status === 'Held' ? (kind === 'purchase' ? 'Currently checked out to you.' : 'Currently checked out.')
      : item.station ? 'Station: ' + item.station : 'Not currently at a station.';
    const link = document.createElement('a');
    const url = new URL('/', location.origin);
    url.searchParams.set('umbrella', item.objectId);
    link.href = url.href;
    link.textContent = 'Open umbrella';
    details.append(heading, summary);
    if (item.status === 'Held') {
      const timer = document.createElement('p');
      timer.className = 'held-umbrella-timer';
      timer.dataset.inspectionDeadlineMs = item.inspectionDeadlineMs;
      timer.dataset.purchasePrice = item.purchasePrice;
      timer.textContent = heldUmbrellaTimerText(item);
      details.append(timer);
    }
    details.append(link);
    card.append(icon, details);
    return card;
  }

  function renderUserUmbrellas() {
    const address = account?.address?.toLowerCase() || '';
    for (const kind of userUmbrellaViews) {
      const list = document.getElementById(kind + '-umbrellas-list');
      const status = document.getElementById(kind + '-umbrellas-status');
      const refresh = document.getElementById(kind + '-umbrellas-refresh');
      const checkbox = document.getElementById(kind + '-umbrellas-deactivated');
      refresh.disabled = userUmbrellasPending || !address;
      checkbox.disabled = userUmbrellasPending || !address;
      list.setAttribute('aria-busy', String(userUmbrellasPending));
      if (!address) {
        list.replaceChildren();
        document.getElementById(kind + '-umbrellas-count').textContent = '';
        status.dataset.error = 'false';
        status.textContent = 'Connect your wallet to load umbrellas.';
        continue;
      }
      const matches = [...userUmbrellas.values()].filter(item => {
        const owner = kind === 'purchase' ? item.holder : item.supplier;
        return typeof owner === 'string' && owner.toLowerCase() === address;
      });
      const hidden = matches.filter(item => deactivatedUmbrellaStates.has(item.status)).length;
      const visible = checkbox.checked ? matches : matches.filter(item => !deactivatedUmbrellaStates.has(item.status));
      list.replaceChildren(...visible.map(item => userUmbrellaCard(item, kind)));
      document.getElementById(kind + '-umbrellas-count').textContent = '(' + visible.length + ')';
      status.dataset.error = String(Boolean(userUmbrellasError));
      if (userUmbrellasPending) status.textContent = 'Loading your umbrellas…';
      else if (userUmbrellasError) status.textContent = userUmbrellasError;
      else if (!userUmbrellasLoaded) status.textContent = 'Refresh to load your umbrellas.';
      else if (visible.length) status.textContent = visible.length + (kind === 'purchase' ? ' rented' : ' supplied') + ' umbrella' + (visible.length === 1 ? '' : 's') + (hidden && !checkbox.checked ? ' · ' + hidden + ' deactivated hidden.' : '.');
      else status.textContent = 'No ' + (checkbox.checked ? '' : 'active ') + (kind === 'purchase' ? 'rented' : 'supplied') + ' umbrellas found' + (hidden && !checkbox.checked ? ' · ' + hidden + ' deactivated hidden.' : '.');
    }
  }

  async function loadUserUmbrellas(force = false) {
    const address = account?.address?.toLowerCase() || '';
    if (!address) { userUmbrellasAddress = ''; userUmbrellas = new Map(); userUmbrellasLoaded = false; userUmbrellasError = ''; renderUserUmbrellas(); return; }
    if (userUmbrellasPending || (!force && userUmbrellasLoaded && userUmbrellasAddress === address)) return;
    userUmbrellasAddress = address;
    userUmbrellasPending = true;
    userUmbrellasError = '';
    for (const kind of userUmbrellaViews) document.getElementById(kind + '-umbrellas-status').dataset.error = 'false';
    renderUserUmbrellas();
    try {
      const items = new Map(), cursors = new Set();
      let cursor = null;
      do {
        const response = await fetch('/api/inventory/umbrellas' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''), { signal: AbortSignal.timeout(20000) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to load your umbrellas.');
        for (const item of result.items) items.set(item.objectId, item);
        cursor = result.nextCursor;
        if (cursor && cursors.has(cursor)) throw new Error('Unable to load all umbrellas. Try Refresh.');
        if (cursor) cursors.add(cursor);
      } while (cursor);
      if (account?.address?.toLowerCase() !== address) return;
      userUmbrellas = items;
      userUmbrellasLoaded = true;
    } catch (error) {
      if (account?.address?.toLowerCase() !== address) return;
      userUmbrellasError = error.name === 'TimeoutError' ? 'Request timed out. Try Refresh.' : error.message || 'Unable to load your umbrellas. Try Refresh.';
    } finally {
      if (account?.address?.toLowerCase() === address) { userUmbrellasPending = false; renderUserUmbrellas(); }
    }
  }

  function refreshUserUmbrellas() { void loadUserUmbrellas(true); }
  for (const kind of userUmbrellaViews) {
    document.getElementById(kind + '-umbrellas-refresh').addEventListener('click', refreshUserUmbrellas);
    document.getElementById(kind + '-umbrellas-deactivated').addEventListener('change', renderUserUmbrellas);
  }
  window.addEventListener('kirisame-wallet-change', () => {
    const address = account?.address?.toLowerCase() || '';
    if (address !== userUmbrellasAddress) {
      userUmbrellas = new Map(); userUmbrellasLoaded = false; userUmbrellasPending = false; userUmbrellasError = ''; userUmbrellasAddress = address;
      renderUserUmbrellas();
      if (address) void loadUserUmbrellas();
    }
  });
  setInterval(updateHeldUmbrellaTimers, 1000);
`;
