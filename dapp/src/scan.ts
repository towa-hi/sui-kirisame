export const scanMarkup = /* html */ `
  <dialog id="scan-dialog" aria-labelledby="scan-title">
    <div class="scan-heading"><h2 id="scan-title">Scan umbrella</h2><button id="scan-close" type="button" aria-label="Close scanner">✕</button></div>
    <p id="scan-status" role="status" aria-live="polite">Point your camera at the umbrella’s QR code or barcode.</p>
    <video id="scan-video" autoplay muted playsinline aria-label="Live camera preview"></video>
    <p id="scan-error" role="alert"></p>
    <dl id="scan-details" hidden></dl>
    <a id="scan-explorer" target="_blank" rel="noreferrer" hidden>View object on Sui Explorer ↗</a>
    <p id="purchase-note" hidden></p>
    <button id="purchase-connect" class="connect-wallet" type="button" hidden>Connect Slush Wallet</button>
    <p class="wallet-status" role="status" aria-live="polite"></p>
    <button id="purchase-confirm" class="umbrella-action" type="button" hidden>Purchase umbrella</button>
    <p id="purchase-status" role="status" aria-live="polite"></p>
    <a id="purchase-transaction" target="_blank" rel="noopener noreferrer" hidden>View purchase transaction ↗</a>
    <button id="scan-again" class="umbrella-action" type="button" hidden>Scan again</button>
    <details id="scan-manual"><summary>Enter umbrella ID instead</summary>
      <form id="scan-form"><label class="admin-field" for="scan-id">Umbrella object ID<input id="scan-id" placeholder="0x…" autocomplete="off" spellcheck="false" required maxlength="66"></label>
      <button id="scan-lookup" class="umbrella-action" type="submit">Look up umbrella</button></form>
    </details>
  </dialog>`;

export const scanStyles = /* css */ `
  #scan-dialog { width: calc(100% - 2rem); max-width: 410px; max-height: calc(100dvh - 2rem); overflow: auto; padding: 1.25rem; border: 1px solid #cad4cc; border-radius: 1rem; background: #f3f5f1; color: #243c32; }
  #scan-dialog::backdrop { background: #12271fcc; }
  .scan-heading { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
  .scan-heading h2 { margin: 0; font-size: 1.3rem; }
  #scan-close { flex: none; width: 44px; height: 44px; background: #e7ebe5; }
  #scan-video { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: .75rem; background: #172b22; }
  #scan-dialog [hidden] { display: none; }
  #scan-status { font-size: .9rem; }
  #scan-error { color: #9a332e; }
  #scan-error:empty { display: none; }
  #scan-details { margin: 1rem 0; }
  #scan-details > div { padding: .6rem 0; border-bottom: 1px solid #cad4cc; }
  #scan-details dt { font-size: .8rem; color: #526358; }
  #scan-details dd { margin: .2rem 0 0; overflow-wrap: anywhere; }
  #scan-explorer { color: #365544; }
  #scan-manual { margin-top: 1.25rem; }
  #scan-manual summary { cursor: pointer; padding: .5rem 0; }
  #scan-dialog button:disabled { opacity: .6; cursor: wait; }
`;

export const scanScript = /* js */ `
  (() => {
    const dialog = document.getElementById('scan-dialog');
    const video = document.getElementById('scan-video');
    const status = document.getElementById('scan-status');
    const error = document.getElementById('scan-error');
    const details = document.getElementById('scan-details');
    const explorer = document.getElementById('scan-explorer');
    const again = document.getElementById('scan-again');
    const lookup = document.getElementById('scan-lookup');
    const purchase = document.getElementById('purchase-confirm');
    const purchaseNote = document.getElementById('purchase-note');
    const purchaseStatus = document.getElementById('purchase-status');
    const purchaseTransaction = document.getElementById('purchase-transaction');
    const pendingPurchases = new Map();
    let umbrella = null, purchasePending = false, actionSelection = null;
    function renderPurchase() {
      const available = !actionSelection && umbrella?.state === 'Docked' && !!umbrella.station;
      const digest = pendingPurchases.get(umbrella?.objectId);
      purchase.hidden = !available && !digest;
      purchase.disabled = purchasePending || (!digest && !account);
      purchase.textContent = purchasePending ? 'Processing purchase…' : digest ? 'Check purchase status' : 'Purchase for ' + (umbrella ? formatSui(umbrella.purchasePrice) : '');
      purchaseNote.hidden = !umbrella || !!actionSelection;
      purchaseNote.textContent = available ? 'Pay ' + formatSui(umbrella.purchasePrice) + ' plus network gas fees. Your inspection window starts when the purchase confirms.' : 'This umbrella is not available for purchase.';
      document.getElementById('purchase-connect').hidden = !available || !!account;
      document.getElementById('purchase-connect').value = umbrella?.objectId || '';
      document.getElementById('scan-close').disabled = purchasePending;
      again.disabled = purchasePending;
      lookup.disabled = purchasePending;
      if (digest) {
        purchaseTransaction.href = 'https://suiscan.xyz/testnet/tx/' + encodeURIComponent(digest);
        purchaseTransaction.hidden = false;
      }
    }
    window.addEventListener('kirisame-wallet-change', renderPurchase);
    purchase.addEventListener('click', async () => {
      if (purchasePending || actionSelection || !umbrella) return;
      const selected = umbrella;
      let digest = pendingPurchases.get(selected.objectId);
      if (!digest && (!account || selected.state !== 'Docked' || !selected.station)) return;
      purchasePending = true;
      renderPurchase();
      error.textContent = '';
      try {
        if (!digest) {
          const signingAccount = account, signingWallet = activeWallet;
          const feature = signingWallet?.features['sui:signAndExecuteTransaction'];
          if (!feature) throw new Error('This wallet does not support transaction signing. Update Slush and try again.');
          if (!signingAccount.chains.includes('sui:testnet')) throw new Error('Switch your wallet to Sui testnet.');
          purchaseStatus.textContent = 'Preparing purchase…';
          const response = await fetch('/api/purchase', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sender: signingAccount.address, umbrellaId: selected.objectId, stationId: selected.station, purchasePrice: selected.purchasePrice, ownerCount: selected.ownerCount }),
            signal: AbortSignal.timeout(30000),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Unable to prepare purchase.');
          if (account !== signingAccount || activeWallet !== signingWallet) throw new Error('The wallet changed. Please confirm again.');
          purchaseStatus.textContent = 'Approve the purchase in Slush…';
          const signed = await feature.signAndExecuteTransaction({ transaction: { toJSON: async () => result.transaction }, account: signingAccount, chain: 'sui:testnet' });
          digest = signed.digest;
          if (!digest) throw new Error('No transaction ID returned. Check wallet activity and look up the umbrella again before retrying.');
          pendingPurchases.set(selected.objectId, digest);
          renderPurchase();
        }
        purchaseStatus.textContent = 'Awaiting chain confirmation…';
        const response = await fetch('/api/admin/transactions/' + encodeURIComponent(digest), { signal: AbortSignal.timeout(25000) });
        const outcome = await response.json();
        if (!response.ok || !outcome.success) {
          if (response.status === 422) pendingPurchases.delete(selected.objectId);
          throw new Error(outcome.error || 'Confirmation is unavailable. Check purchase status before retrying.');
        }
        pendingPurchases.delete(selected.objectId);
        purchasePending = false;
        await showUmbrella(selected.objectId);
        purchaseStatus.textContent = 'Purchase confirmed. The umbrella is now yours to take.';
        purchaseTransaction.href = 'https://suiscan.xyz/testnet/tx/' + encodeURIComponent(digest);
        purchaseTransaction.hidden = false;
        void refreshBalance();
        refreshInventory();
      } catch (failure) {
        purchaseStatus.textContent = '';
        error.textContent = failure.name === 'TimeoutError' ? 'Request timed out. Check wallet activity or purchase status before retrying.' : failure.message || 'Unable to purchase umbrella.';
      } finally {
        purchasePending = false;
        renderPurchase();
      }
    });
    let generation = 0, stream = null, controls = null, request = null;
    let decoderReady;

    function stopCamera() {
      controls?.stop(); controls = null;
      stream?.getTracks().forEach(track => track.stop()); stream = null;
      video.srcObject = null;
    }
    function cancel() {
      generation++;
      request?.abort(); request = null;
      stopCamera();
    }
    function loadDecoder() {
      if (!decoderReady) decoderReady = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '/assets/barcode-reader.js';
        script.onload = resolve;
        script.onerror = () => { script.remove(); decoderReady = null; reject(new Error('Unable to load the scanner. Check your connection and try again.')); };
        document.head.append(script);
      });
      return decoderReady;
    }
    function objectId(raw) {
      const text = raw.trim();
      if (/^0x[0-9a-fA-F]{64}$/.test(text)) return text.toLowerCase();
      // Only extract an ID; never navigate to or fetch a scanned URL.
      // Labels remain usable across app hosts and inside Slush's browse wrapper.
      try {
        let url = new URL(text);
        if (!['https:', 'http:'].includes(url.protocol)) return null;
        if (url.hostname === 'my.slush.app' && url.pathname.startsWith('/browse/')) {
          const target = url.pathname.slice('/browse/'.length);
          url = new URL((/^https?:/.test(target) ? target : decodeURIComponent(target)) + url.search + url.hash);
          if (!['https:', 'http:'].includes(url.protocol)) return null;
        }
        const candidate = url.searchParams.get('umbrella') ?? (
          url.hostname === 'suiscan.xyz' ? url.pathname.match(/^\\/testnet\\/object\\/(0x[0-9a-fA-F]{64})\\/?$/)?.[1] : null);
        return candidate && /^0x[0-9a-fA-F]{64}$/.test(candidate) ? candidate.toLowerCase() : null;
      } catch { return null; }
    }
    async function showUmbrella(raw) {
      if (purchasePending) return;
      umbrella = null;
      purchase.hidden = true; purchaseNote.hidden = true;
      document.getElementById('purchase-connect').hidden = true;
      purchaseStatus.textContent = ''; purchaseTransaction.hidden = true;
      const id = objectId(raw);
      cancel();
      const current = generation;
      video.hidden = true; again.hidden = false; details.hidden = true; explorer.hidden = true;
      error.textContent = ''; status.textContent = ''; lookup.disabled = false;
      if (!id) { error.textContent = 'This code does not contain a valid umbrella object ID. Scan the umbrella label or enter its ID.'; return; }
      document.getElementById('scan-id').value = id;
      document.getElementById('scan-title').textContent = 'Umbrella details';
      status.textContent = 'Looking up umbrella on Sui testnet…';
      lookup.disabled = true;
      const controller = new AbortController();
      request = controller;
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch('/api/umbrellas/' + encodeURIComponent(id), { signal: request.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load umbrella details.');
        if (current !== generation || !dialog.open) return;
        if (actionSelection) {
          if (actionSelection.action === 'quarantine') {
            if (data.state !== 'Held') throw new Error('Only checked-out umbrellas can be quarantined.');
          } else if (actionSelection.action === 'admin_retire_station_umbrella') {
            if (data.state !== 'Docked' || !data.station) throw new Error('Only docked umbrellas can be retired from a station.');
          } else if (actionSelection.action === 'admin_review_quarantined_umbrella') {
            if (data.state !== 'Quarantined' || !data.station) throw new Error('Only quarantined umbrellas at a station can be reviewed.');
            if (data.conditionStatus !== 'AwaitingReview') throw new Error('This umbrella’s refund review is already finalized.');
          } else if (actionSelection.action === 'admin_retire_umbrella') {
            if (data.state !== 'Quarantined') throw new Error('Only quarantined umbrellas can be retired.');
            if (!['Paid', 'Forfeited'].includes(data.conditionStatus)) throw new Error('Review this umbrella and settle its pending payments before retiring it.');
          } else if (!['Created', 'Held'].includes(data.state)) throw new Error('Only new or checked-out umbrellas can be docked.');
          const onSelected = actionSelection.onSelected;
          actionSelection = null;
          dialog.close();
          onSelected(data);
          return;
        }
        const rows = [
          ['Name', data.name || 'Supplier Umbrella'], ['Color', data.color], ['Status', data.state], ['Purchase price', formatSui(data.purchasePrice)],
          ['Condition bond', formatSui(data.conditionBond)], ['Usage period', '1 day after the 2-minute inspection window'],
          ['Current station', data.station || 'Not docked'], ['Current holder', data.holder || 'None'],
          ['Supplier', data.supplier], ['Checkout count', data.ownerCount], ['Condition funds', data.conditionStatus], ['Object ID', data.objectId],
        ];
        details.replaceChildren(...rows.map(([label, value]) => {
          const row = document.createElement('div'), term = document.createElement('dt'), description = document.createElement('dd');
          term.textContent = label; description.textContent = value; row.append(term, description); return row;
        }));
        details.hidden = false;
        explorer.href = 'https://suiscan.xyz/testnet/object/' + encodeURIComponent(data.objectId); explorer.hidden = false;
        status.textContent = data.state === 'Sold' ? 'This umbrella has been removed from the system and is permanently yours.' : 'Umbrella found · Sui testnet';
        umbrella = data;
        renderPurchase();
      } catch (failure) {
        if (current !== generation || !dialog.open) return;
        status.textContent = '';
        error.textContent = failure.name === 'AbortError' ? 'Lookup timed out. Please try again.' : failure.message;
      } finally {
        clearTimeout(timeout);
        if (current === generation) { lookup.disabled = false; request = null; }
      }
    }
    async function start() {
      if (purchasePending) return;
      umbrella = null; renderPurchase();
      purchaseStatus.textContent = ''; purchaseTransaction.hidden = true;
      cancel();
      const current = generation;
      document.getElementById('scan-title').textContent = actionSelection ? 'Scan umbrella to ' + ({ admin_retire_station_umbrella: 'retire from station', admin_review_quarantined_umbrella: 'review quarantine', admin_retire_umbrella: 'retire from quarantine' }[actionSelection.action] || actionSelection.action) : 'Scan umbrella';
      error.textContent = ''; details.hidden = true; explorer.hidden = true; again.hidden = true; video.hidden = false; lookup.disabled = false;
      status.textContent = 'Opening camera…';
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Camera access requires HTTPS and a supported browser. You can enter the umbrella ID below.');
        const camera = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (current !== generation || !dialog.open) { camera.getTracks().forEach(track => track.stop()); return; }
        stream = camera;
        video.srcObject = camera;
        await video.play();
        await loadDecoder();
        if (current !== generation || !dialog.open) return;
        status.textContent = 'Point your camera at the umbrella’s QR code or barcode.';
        const reader = new ZXingBrowser.BrowserMultiFormatReader();
        const scanner = await reader.decodeFromStream(camera, video, (result) => {
          if (result && current === generation && dialog.open) void showUmbrella(result.getText());
        });
        if (current !== generation || !dialog.open) scanner.stop(); else controls = scanner;
      } catch (failure) {
        if (current !== generation || !dialog.open) return;
        stopCamera(); video.hidden = true; again.hidden = false; status.textContent = '';
        error.textContent = failure.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access in your browser settings, then try again.' :
          failure.name === 'NotFoundError' ? 'No camera was found. Enter the umbrella ID below.' :
          failure.name === 'NotReadableError' ? 'The camera is unavailable or in use by another app. Close it and try again.' : failure.message;
      }
    }
    function scanForAction(action, onSelected) {
      if (purchasePending) return;
      actionSelection = { action, onSelected };
      dialog.showModal(); void start();
    };
    window.scanUmbrellaForAdmin = (action, onSelected) => scanForAction(action, onSelected);
    window.scanUmbrellaForDock = onSelected => scanForAction('dock', onSelected);
    window.scanUmbrellaForQuarantine = onSelected => scanForAction('quarantine', onSelected);
    document.getElementById('scan-umbrella').addEventListener('click', () => { dialog.showModal(); void start(); });
    document.getElementById('scan-close').addEventListener('click', () => { if (!purchasePending) dialog.close(); });
    dialog.addEventListener('close', () => { cancel(); actionSelection = null; });
    dialog.addEventListener('cancel', event => { if (purchasePending) event.preventDefault(); else cancel(); });
    again.addEventListener('click', () => void start());
    document.getElementById('scan-form').addEventListener('submit', event => { event.preventDefault(); void showUmbrella(document.getElementById('scan-id').value); });
    window.addEventListener('pagehide', cancel);
    document.addEventListener('visibilitychange', () => { if (document.hidden && dialog.open && !purchasePending && stream) { cancel(); video.hidden = true; again.hidden = false; lookup.disabled = false; status.textContent = 'Scan paused. Tap Scan again to resume.'; } });
    const linkedUmbrella = new URLSearchParams(location.search).get('umbrella');
    if (linkedUmbrella !== null) {
      dialog.showModal();
      void showUmbrella(linkedUmbrella);
    }
  })();
`;
