export const scanMarkup = /* html */ `
  <dialog id="scan-dialog" aria-labelledby="scan-title">
    <div class="scan-heading"><h2 id="scan-title">Scan umbrella</h2><button id="scan-close" type="button" aria-label="Close scanner">✕</button></div>
    <p id="scan-status" role="status" aria-live="polite">Point your camera at the umbrella’s QR code or barcode.</p>
    <video id="scan-video" autoplay muted playsinline aria-label="Live camera preview"></video>
    <p id="scan-error" role="alert"></p>
    <dl id="scan-details" hidden></dl>
    <a id="scan-explorer" target="_blank" rel="noreferrer" hidden>View object on Sui Explorer ↗</a>
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
      // Support labels linking to this app or a Sui testnet object page.
      try {
        const url = new URL(text);
        if (!['https:', 'http:'].includes(url.protocol)) return null;
        const candidate = url.origin === location.origin ? url.searchParams.get('umbrella') :
          url.hostname === 'suiscan.xyz' ? url.pathname.match(/^\\/testnet\\/object\\/(0x[0-9a-fA-F]{64})\\/?$/)?.[1] : null;
        return candidate && /^0x[0-9a-fA-F]{64}$/.test(candidate) ? candidate.toLowerCase() : null;
      } catch { return null; }
    }
    async function showUmbrella(raw) {
      const id = objectId(raw);
      cancel();
      const current = generation;
      video.hidden = true; again.hidden = false; details.hidden = true; explorer.hidden = true;
      error.textContent = ''; status.textContent = ''; lookup.disabled = false;
      if (!id) { error.textContent = 'This code does not contain a valid umbrella object ID. Scan the umbrella label or enter its ID.'; return; }
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
        const rows = [
          ['Color', data.color], ['Status', data.state], ['Purchase price', formatSui(data.purchasePrice)],
          ['Condition bond', formatSui(data.conditionBond)], ['Usage fee per hour', formatSui((BigInt(data.feePerMs) * 3600000n).toString())],
          ['Current station', data.station || 'Not docked'], ['Current holder', data.holder || 'None'],
          ['Supplier', data.supplier], ['Checkout count', data.ownerCount], ['Condition funds', data.conditionStatus], ['Object ID', data.objectId],
        ];
        details.replaceChildren(...rows.map(([label, value]) => {
          const row = document.createElement('div'), term = document.createElement('dt'), description = document.createElement('dd');
          term.textContent = label; description.textContent = value; row.append(term, description); return row;
        }));
        details.hidden = false;
        explorer.href = 'https://suiscan.xyz/testnet/object/' + encodeURIComponent(data.objectId); explorer.hidden = false;
        status.textContent = 'Umbrella found · Sui testnet';
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
      cancel();
      const current = generation;
      document.getElementById('scan-title').textContent = 'Scan umbrella';
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
    document.getElementById('scan-umbrella').addEventListener('click', () => { dialog.showModal(); void start(); });
    document.getElementById('scan-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', cancel);
    dialog.addEventListener('cancel', cancel);
    again.addEventListener('click', () => void start());
    document.getElementById('scan-form').addEventListener('submit', event => { event.preventDefault(); void showUmbrella(document.getElementById('scan-id').value); });
    window.addEventListener('pagehide', cancel);
    document.addEventListener('visibilitychange', () => { if (document.hidden && dialog.open) { cancel(); video.hidden = true; again.hidden = false; lookup.disabled = false; status.textContent = 'Scan paused. Tap Scan again to resume.'; } });
  })();
`;
