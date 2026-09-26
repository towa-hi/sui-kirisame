import { inventoryMarkup, inventoryStyles, inventoryScript } from './inventory.js';
import { stationActions } from './station.js';
import { stationLocationScript, stationLocationStyles } from './station-location.js';

const objectField = (name: string, label: string) => ({ name, label, kind: 'object' });
const station = objectField('station', 'Station ID');
const umbrella = objectField('umbrella', 'Umbrella ID');
const ownerCount = { name: 'expected_owner_count', label: 'Expected owner count', kind: 'integer' };

export const adminActions = [
  { id: 'admin_create_station', title: 'Create station', description: 'Register a station. The payout address receives access to station functions.', fields: [
    { name: 'display_name', label: 'Display name', kind: 'text' },
    { name: 'location_name', label: 'Location name', kind: 'text' },
    { name: 'latitude_e6', label: 'Encoded latitude (0–180,000,000)', kind: 'integer', max: '180000000' },
    { name: 'longitude_e6', label: 'Encoded longitude (0–360,000,000)', kind: 'integer', max: '360000000' },
    objectField('payout_address', 'Station wallet address (receives payouts and station access)'),
  ] },
  { id: 'admin_remove_station', title: 'Remove station', description: 'Stop station operations. Docked umbrellas must be retired to finish removal.', fields: [station] },
  { id: 'admin_retire_station_umbrella', title: 'Retire station umbrella', description: 'Retire a docked umbrella at a station being removed and refund its pending hold.', fields: [station, umbrella] },
  { id: 'admin_review_quarantined_umbrella', title: 'Review quarantined umbrella', description: 'Make a final refund decision for a quarantined umbrella.', fields: [station, umbrella, ownerCount, { name: 'approve_refund', label: 'Refund decision', kind: 'boolean' }] },
  { id: 'admin_retire_umbrella', title: 'Retire quarantined umbrella', description: 'Permanently retire a quarantined umbrella after its payments are settled.', fields: [umbrella, ownerCount] },
  { id: 'admin_settle_pending_payments', title: 'Settle pending payments', description: 'Process eligible payments for one umbrella. Open inspections remain pending.', fields: [umbrella] },
];

export const adminMarkup = /* html */ `
  ${inventoryMarkup}
  <div class="admin-heading"><h2>Admin functions</h2><p id="admin-mode">Testnet · Connect mono to use admin functions.</p></div>
  <div class="admin-actions">${adminActions.map(action => `<button type="button" class="admin-action" disabled data-action="${action.id}"><strong>${action.title}</strong><span>${action.description}</span><span class="action-arrow" aria-hidden="true">↗</span></button>`).join('')}</div>
`;

export const adminOverlay = /* html */ `
  <dialog id="admin-dialog" aria-labelledby="admin-dialog-title" aria-describedby="admin-dialog-description">
    <form id="admin-form">
      <h2 id="admin-dialog-title"></h2>
      <p id="admin-dialog-description"></p>
      <fieldset id="admin-fields"></fieldset>
      <p id="admin-error" role="alert"></p>
      <div class="modal-actions"><button type="button" id="admin-cancel">Cancel</button><button type="submit" id="admin-confirm" disabled>Confirm</button></div>
      <p id="admin-pending" role="status" hidden><span class="spinner" aria-hidden="true"></span> <span id="admin-pending-label">Awaiting server response…</span></p>
    </form>
  </dialog>
  <div id="app-toast" class="toast" role="status" aria-live="polite" aria-atomic="true" hidden><span id="toast-message"></span><button type="button" id="toast-dismiss" aria-label="Dismiss notification">×</button></div>
`;

export const adminStyles = /* css */ `
  ${stationLocationStyles}
  ${inventoryStyles}
  .admin-heading { margin: 1.75rem 0 1rem; }
  .admin-heading h1, .admin-heading h2 { font-size: 1.2rem; margin: 0; }
  .admin-heading p { font-size: .8rem; color: #526358; margin: .4rem 0; }
  .admin-actions { display: grid; gap: .65rem; }
  .admin-action { position: relative; text-align: left; padding: 1rem 2.5rem 1rem 1rem; background: #fff; border: 1px solid #cad4cc; color: #243c32; }
  .admin-action:not(:disabled):hover { background: #eaf0e9; border-color: #557866; }
  .admin-action:disabled { cursor: not-allowed; }
  .admin-action strong, .admin-action span { display: block; }
  .admin-action strong { font-size: .95rem; }
  .admin-action span { font-size: .8rem; line-height: 1.5; margin-top: .3rem; color: #526358; }
  .admin-action .action-arrow { position: absolute; right: 1rem; top: .6rem; font-size: 1.2rem; }
  dialog { width: calc(100% - 2rem); max-width: 398px; max-height: calc(100svh - 2rem); padding: 1.4rem; border: 1px solid #cad4cc; border-radius: 1rem; background: #f9faf7; color: #243c32; box-shadow: 0 20px 80px #172b3540; }
  dialog::backdrop { background: #15282080; }
  dialog h2 { font-size: 1.25rem; margin: 0; }
  dialog p { font-size: .85rem; color: #526358; }
  fieldset { margin: 0; padding: 0; border: 0; min-width: 0; }
  .admin-field { display: block; font-size: .85rem; margin-top: 1rem; }
  .admin-field[hidden] { display: none; }
  .admin-field input, .admin-field select { display: block; width: 100%; margin-top: .4rem; padding: .7rem; border: 1px solid #aebeb2; border-radius: .5rem; background: #fff; color: #243c32; font: inherit; font-size: 1rem; }
  .admin-field input:focus-visible, .admin-field select:focus-visible { outline: 2px solid #557866; outline-offset: 2px; }
  .modal-actions { display: flex; gap: .65rem; margin-top: 1.4rem; }
  #admin-cancel, #supply-cancel { border: 1px solid #cad4cc; }
  #admin-confirm, #supply-confirm { background: #243c32; color: #fff; }
  button:disabled { opacity: .55; cursor: wait; }
  #admin-error { color: #9a332e; overflow-wrap: anywhere; }
  #admin-error:empty { display: none; }
  #admin-pending { margin-bottom: 0; }
  .spinner { display: inline-block; width: .85rem; height: .85rem; border: 2px solid #cad4cc; border-top-color: #243c32; border-radius: 50%; animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
  .toast { position: fixed; z-index: 10; bottom: 1.25rem; left: 50%; transform: translateX(-50%); width: calc(100% - 2rem); max-width: 398px; display: flex; align-items: center; gap: .75rem; padding: .8rem 1rem; border-radius: .75rem; background: #243c32; color: white; box-shadow: 0 8px 32px #15282030; font-size: .875rem; }
  .toast[hidden] { display: none; }
  .toast[data-tone="error"] { background: #873b33; }
  #toast-dismiss { flex: 0 0 auto; margin-left: auto; color: inherit; font-size: 1.3rem; }
`;

export const adminScript = /* js */ `
  ${inventoryScript}
  const adminActions = ${JSON.stringify([...adminActions, ...stationActions])};
  const adminDialog = document.getElementById('admin-dialog');
  const adminForm = document.getElementById('admin-form');
  const adminFields = document.getElementById('admin-fields');
  const adminConfirm = document.getElementById('admin-confirm');
  const adminCancel = document.getElementById('admin-cancel');
  const adminError = document.getElementById('admin-error');
  const toast = document.getElementById('app-toast');
  let adminAction = null;
  let adminPending = false;
  let toastTimer;
  ${stationLocationScript}
  function showToast(message, tone = 'success') {
    clearTimeout(toastTimer);
    document.getElementById('toast-message').textContent = message;
    toast.dataset.tone = tone;
    toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, 6000);
  }
  document.getElementById('toast-dismiss').addEventListener('click', () => {
    clearTimeout(toastTimer);
    toast.hidden = true;
  });
  let ownedStationAccount = null, availableStations = [], stationAccessMessage = '';
  async function loadStationAccess() {
    const selectedAccount = account;
    ownedStationAccount = selectedAccount;
    availableStations = [];
    stationAccessMessage = selectedAccount ? 'Loading your stations…' : '';
    renderAdminAccess();
    if (!selectedAccount) return;
    try {
      const response = await fetch('/api/station/owned/' + encodeURIComponent(selectedAccount.address), { signal: AbortSignal.timeout(15000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to load stations.');
      if (account !== selectedAccount) return;
      availableStations = result.stations;
      stationAccessMessage = availableStations.length ? 'Scan an umbrella to dock or quarantine it at your station.' : 'This wallet does not own an active station.';
    } catch (error) {
      if (account !== selectedAccount) return;
      stationAccessMessage = error.message || 'Unable to load stations. Reconnect to retry.';
    }
    renderAdminAccess();
  }
  window.addEventListener('kirisame-wallet-change', () => { if (account !== ownedStationAccount) void loadStationAccess(); });
  function canUseAction(action) {
    return action?.id.startsWith('station_') ? Boolean(account && account === ownedStationAccount && availableStations.length) : isMonoWallet();
  }
  function renderAdminAccess() {
    const allowed = isMonoWallet();
    for (const button of document.querySelectorAll('.admin-action')) button.disabled = adminPending || !canUseAction(adminActions.find(action => action.id === button.dataset.action));
    adminConfirm.disabled = adminPending || !canUseAction(adminAction);
    adminFields.disabled = adminPending || !canUseAction(adminAction);
    document.getElementById('admin-mode').textContent = allowed
      ? 'Testnet · mono connected. Admin functions require the Kirisame AdminCap.'
      : 'Testnet · Connect mono to use admin functions.';
    document.getElementById('station-mode').textContent = account
      ? 'Testnet · ' + stationAccessMessage
      : 'Testnet · Connect your wallet to use station functions. You must own the matching StationCap.';
    if (!canUseAction(adminAction) && !adminPending && adminDialog.open) adminDialog.close();
  }
  function setAdminPending(value) {
    adminPending = value;
    document.getElementById('admin-pending-label').textContent = 'Awaiting server response…';
    document.body.dataset.state = value ? 'awaiting-response' : 'idle';
    adminForm.setAttribute('aria-busy', String(value));
    adminCancel.disabled = value;
    adminConfirm.textContent = value ? 'Submitting…' : 'Confirm';
    document.getElementById('admin-pending').hidden = !value;
    renderAdminAccess();
  }
  function openAdminAction(action, scannedUmbrella = null) {
    if (adminPending || !canUseAction(action)) return;
    adminAction = action;
    document.getElementById('admin-dialog-title').textContent = adminAction.title;
    document.getElementById('admin-dialog-description').textContent = adminAction.description;
    adminError.textContent = '';
    disposeStationLocation();
    adminFields.replaceChildren();
    for (const field of adminAction.fields) {
      const label = document.createElement('label');
      label.className = 'admin-field';
      label.textContent = field.label;
      const input = document.createElement(field.kind === 'boolean' ? 'select' : 'input');
      input.name = field.name;
      input.required = true;
      if (field.kind === 'boolean') {
        for (const [value, text] of [['', 'Choose a decision'], ['true', 'Approve refund'], ['false', 'Forfeit hold']]) {
          input.add(new Option(text, value));
        }
      } else {
        input.type = 'text';
        input.autocomplete = 'off';
        if (field.name === 'payout_address') input.value = '0xd8fd6bc0c0bc0bae5c618f1d7408e6febab749e2cf6f0afe178c9dc41fa6c282';
        if (field.kind === 'object') {
          input.pattern = '0x[0-9a-fA-F]{1,64}';
          input.placeholder = '0x…';
          input.title = 'Enter a hexadecimal Sui ID or address beginning with 0x (up to 64 digits).';
        } else if (field.kind === 'integer') {
          input.inputMode = 'numeric';
          input.pattern = '[0-9]+';
          input.title = 'Enter a non-negative whole number.';
        } else input.maxLength = 256;
      }
      if (scannedUmbrella) {
        input.value = field.name === 'umbrella' ? scannedUmbrella.objectId : field.name === 'expected_owner_count' ? scannedUmbrella.ownerCount : availableStations[0][field.name];
        input.readOnly = true;
        if (field.name === 'cap' || field.name === 'expected_owner_count') label.hidden = true;
      }
      input.addEventListener('input', () => input.setCustomValidity(''));
      label.append(input);
      adminFields.append(label);
    }
    if (scannedUmbrella && availableStations.length > 1) {
      const label = document.createElement('label');
      label.className = 'admin-field'; label.textContent = adminAction.id === 'station_quarantine_umbrella' ? 'Quarantine at station' : 'Dock at station';
      const select = document.createElement('select');
      availableStations.forEach((station, index) => select.add(new Option(station.name + ' · ' + station.station, String(index))));
      select.addEventListener('change', () => {
        const station = availableStations[Number(select.value)];
        adminForm.elements.namedItem('cap').value = station.cap;
        adminForm.elements.namedItem('station').value = station.station;
      });
      label.append(select); adminFields.prepend(label);
    }
    if (adminAction.id === 'admin_create_station') addStationLocationControls();
    renderAdminAccess();
    adminDialog.showModal();
  }
  for (const button of document.querySelectorAll('.admin-action')) button.addEventListener('click', () => {
    const action = adminActions.find(action => action.id === button.dataset.action);
    if (adminPending || !canUseAction(action)) return;
    if (action.id === 'station_dock_umbrella' || action.id === 'station_quarantine_umbrella') {
      const scanningAccount = account;
      const scan = action.id === 'station_quarantine_umbrella' ? window.scanUmbrellaForQuarantine : window.scanUmbrellaForDock;
      scan(data => {
        if (account !== scanningAccount || !canUseAction(action)) { showToast('The wallet changed. Scan again with your station wallet.', 'error'); return; }
        openAdminAction(action, data);
      });
    } else openAdminAction(action);
  });
  adminCancel.addEventListener('click', () => { if (!adminPending) adminDialog.close(); });
  adminDialog.addEventListener('cancel', event => { if (adminPending) event.preventDefault(); });
  adminForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (adminPending || !adminAction || !canUseAction(adminAction)) return;
    const parameters = {};
    for (const field of adminAction.fields) {
      const input = adminForm.elements.namedItem(field.name);
      const value = input.value.trim();
      if (!value || (field.kind === 'integer' && BigInt(value) > BigInt(field.max || '18446744073709551615'))) {
        input.setCustomValidity(!value ? 'Please enter a value.' : 'Value exceeds the allowed maximum.');
        input.reportValidity();
        return;
      }
      parameters[field.name] = field.kind === 'boolean' ? value === 'true' : value;
    }
    adminError.textContent = '';
    setAdminPending(true);
    let digest = null;
    try {
      if (!account || !activeWallet) throw new Error('Connect your Slush wallet before confirming.');
      const signingAccount = account;
      const signingWallet = activeWallet;
      const feature = signingWallet.features['sui:signAndExecuteTransaction'];
      if (!feature) throw new Error('This wallet does not support transaction signing. Update Slush and try again.');
      if (!signingAccount.chains.includes('sui:testnet')) throw new Error('Switch your wallet to Sui testnet.');
      const response = await fetch('/api/' + (adminAction.id.startsWith('station_') ? 'station/' : 'admin/') + adminAction.id, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parameters, sender: signingAccount.address }), signal: AbortSignal.timeout(30000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The request failed. Please try again.');
      if (account !== signingAccount || activeWallet !== signingWallet) throw new Error('The wallet changed. Please confirm again.');
      document.getElementById('admin-pending-label').textContent = 'Awaiting approval in Slush…';
      const signed = await feature.signAndExecuteTransaction({
        transaction: { toJSON: async () => result.transaction },
        account: signingAccount, chain: 'sui:testnet',
      });
      digest = signed.digest;
      if (!digest) throw new Error('The wallet did not return a transaction ID. Check wallet activity before retrying.');
      document.getElementById('admin-pending-label').textContent = 'Awaiting chain confirmation…';
      const confirmation = await fetch('/api/admin/transactions/' + encodeURIComponent(digest), { signal: AbortSignal.timeout(25000) });
      const outcome = await confirmation.json();
      if (!confirmation.ok || !outcome.success) throw new Error(outcome.error || 'Unable to confirm the transaction.');
      let completionMessage = adminAction.title + ' completed.';
      if (adminAction.id === 'station_dock_umbrella') {
        const umbrellaResponse = await fetch('/api/umbrellas/' + encodeURIComponent(parameters.umbrella), { signal: AbortSignal.timeout(15000) });
        const returnedUmbrella = await umbrellaResponse.json();
        if (!umbrellaResponse.ok) throw new Error('Transaction confirmed, but the umbrella status could not be loaded. Scan it again to check the result.');
        if (returnedUmbrella.state === 'Sold') completionMessage = 'This umbrella has been removed from the system and is permanently yours.';
      }
      adminDialog.close();
      showToast(completionMessage);
      void refreshBalance();
      refreshInventory();
    } catch (error) {
      const message = error.name === 'TimeoutError' ? 'The server did not respond in time. Check the result before retrying.' : error.message || 'Unable to reach the server. Please try again.';
      adminError.textContent = message;
      if (digest) {
        const link = document.createElement('a');
        link.href = 'https://suiscan.xyz/testnet/tx/' + encodeURIComponent(digest);
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = ' View transaction';
        adminError.append(link);
      }
      showToast(message, 'error');
    } finally {
      setAdminPending(false);
    }
  });
`;
