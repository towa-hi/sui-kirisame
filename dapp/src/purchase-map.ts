export const purchaseMapMarkup = /* html */ `
  <section class="purchase-stations" aria-labelledby="purchase-stations-heading">
    <div class="purchase-map-toolbar">
      <h2 id="purchase-stations-heading">Nearby stations</h2>
      <button id="purchase-map-locate" type="button">Near me</button>
      <button id="purchase-map-refresh" type="button">Refresh</button>
    </div>
    <p id="purchase-map-status" role="status">Loading stations…</p>
    <div id="purchase-map" role="region" aria-label="Umbrella stations map" aria-describedby="purchase-map-status"></div>
    <p class="purchase-map-hint">Tap a pin to see docked umbrellas. Use Near me to find stations around you. Counts may take a moment to update.</p>
  </section>
`;

export const purchaseMapStyles = /* css */ `
  .purchase-stations { margin-top: 1.5rem; }
  .purchase-map-toolbar { display: flex; align-items: center; gap: .4rem; }
  .purchase-map-toolbar h2 { flex: 1; margin: 0; font-size: 1rem; }
  .purchase-map-toolbar button { flex: 0 0 auto; background: #fff; border: 1px solid #cad4cc; font-size: .8rem; }
  #purchase-map { width: 100%; aspect-ratio: 1; border: 1px solid #cad4cc; border-radius: .75rem; background: #e7ebe5; isolation: isolate; }
  #purchase-map-status, .purchase-map-hint { margin: .5rem 0; color: #526358; font-size: .8rem; }
  #purchase-map-status[data-error="true"] { color: #9a332e; }
  .purchase-station-popup { color: #243c32; font: .85rem/1.5 system-ui, sans-serif; overflow-wrap: anywhere; }
  .purchase-station-popup strong, .purchase-station-popup span { display: block; }
  .purchase-station-popup b { display: block; margin-top: .4rem; }
`;

export const purchaseMapScript = /* js */ `
  const purchaseMapElement = document.getElementById('purchase-map');
  const purchaseMapStatus = document.getElementById('purchase-map-status');
  const purchaseMapRefresh = document.getElementById('purchase-map-refresh');
  const purchaseMapLocate = document.getElementById('purchase-map-locate');
  let purchaseMap, purchaseStationLayer, purchaseUserMarker, purchaseUserLocation;
  let purchaseStations = [], purchaseMapPending = false, purchaseMapLoaded = false, purchaseLocating = false;

  function purchaseStationSummary() {
    if (!purchaseStations.length) return 'No active stations found in this deployment.';
    if (purchaseUserLocation) {
      const nearby = purchaseStations.filter(station => purchaseMap.distance(purchaseUserLocation, [station.latitude, station.longitude]) <= 5000).length;
      return nearby ? nearby + ' active station' + (nearby === 1 ? '' : 's') + ' within 5 km. Tap a pin for umbrella counts.'
        : 'No active stations within 5 km. Zoom out to explore.';
    }
    return purchaseStations.length + ' active station' + (purchaseStations.length === 1 ? '' : 's') + '. Tap a pin for umbrella counts.';
  }

  async function loadPurchaseStations() {
    if (purchaseMapPending) return;
    purchaseMapPending = true;
    purchaseMapRefresh.disabled = true;
    purchaseMapLocate.disabled = true;
    purchaseMapElement.setAttribute('aria-busy', 'true');
    purchaseMapStatus.dataset.error = 'false';
    purchaseMapStatus.textContent = 'Loading stations…';
    try {
      await loadStationMapAssets();
      if (!purchaseMap) {
        purchaseMap = L.map(purchaseMapElement, { scrollWheelZoom: false }).setView([20, 0], 2);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).on('tileerror', () => {
          purchaseMapStatus.dataset.error = 'true';
          purchaseMapStatus.textContent = 'Map tiles could not load. Check your connection and tap Refresh.';
        }).addTo(purchaseMap);
        purchaseStationLayer = L.layerGroup().addTo(purchaseMap);
      }
      const stations = new Map();
      const cursors = new Set();
      let cursor = null;
      do {
        const response = await fetch('/api/inventory/stations' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''), { signal: AbortSignal.timeout(20000) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to load stations.');
        for (const station of result.items) {
          if (station.status === 'Active' && Number.isFinite(station.latitude) && Math.abs(station.latitude) <= 90 && Number.isFinite(station.longitude) && Math.abs(station.longitude) <= 180) stations.set(station.objectId, station);
        }
        cursor = result.nextCursor;
        if (cursor && cursors.has(cursor)) throw new Error('Unable to load all stations. Try Refresh.');
        if (cursor) cursors.add(cursor);
      } while (cursor);
      purchaseStations = [...stations.values()];
      purchaseStationLayer.clearLayers();
      for (const station of purchaseStations) {
        const popup = document.createElement('div');
        popup.className = 'purchase-station-popup';
        const title = document.createElement('strong');
        title.textContent = station.name || 'Unnamed station';
        const location = document.createElement('span');
        location.textContent = station.location || '';
        const count = document.createElement('b');
        count.textContent = station.dockedCount + ' docked umbrella' + (String(station.dockedCount) === '1' ? '' : 's');
        popup.append(title, location, count);
        L.marker([station.latitude, station.longitude], { title: title.textContent, alt: title.textContent + ' station' })
          .bindPopup(popup, { maxWidth: 240 }).addTo(purchaseStationLayer);
      }
      purchaseMap.invalidateSize();
      if (!purchaseMapLoaded && !purchaseUserLocation && purchaseStations.length) {
        purchaseMap.fitBounds(purchaseStations.map(station => [station.latitude, station.longitude]), { padding: [30, 30], maxZoom: 15 });
      }
      purchaseMapLoaded = true;
      purchaseMapStatus.textContent = purchaseStationSummary();
    } catch (error) {
      purchaseMapStatus.dataset.error = 'true';
      purchaseMapStatus.textContent = (purchaseMapLoaded ? 'Showing previously loaded stations. ' : '') + (error.name === 'TimeoutError' ? 'Request timed out. Try Refresh.' : error.message || 'Unable to load stations. Try Refresh.');
    } finally {
      purchaseMapPending = false;
      purchaseMapRefresh.disabled = false;
      purchaseMapLocate.disabled = purchaseLocating;
      purchaseMapElement.setAttribute('aria-busy', 'false');
    }
  }

  purchaseMapRefresh.addEventListener('click', () => {
    if (purchaseMap) purchaseMap.eachLayer(layer => { if (layer instanceof L.TileLayer) layer.redraw(); });
    void loadPurchaseStations();
  });
  purchaseMapLocate.addEventListener('click', () => {
    if (!navigator.geolocation) {
      purchaseMapStatus.textContent = 'Location is unavailable in this browser. Pan and zoom to find a station.';
      return;
    }
    purchaseLocating = true;
    purchaseMapLocate.disabled = true;
    purchaseMapStatus.textContent = 'Finding your location…';
    navigator.geolocation.getCurrentPosition(async position => {
      purchaseUserLocation = [position.coords.latitude, position.coords.longitude];
      if (!purchaseMap) await loadPurchaseStations();
      if (purchaseMap) {
        purchaseMap.invalidateSize();
        purchaseMap.setView(purchaseUserLocation, 13);
        if (purchaseUserMarker) purchaseUserMarker.remove();
        purchaseUserMarker = L.circleMarker(purchaseUserLocation, { radius: 7, color: '#fff', weight: 3, fillColor: '#3379bd', fillOpacity: 1 }).bindPopup('Your location').addTo(purchaseMap);
        if (purchaseMapLoaded) purchaseMapStatus.textContent = purchaseStationSummary();
      }
      purchaseLocating = false;
      purchaseMapLocate.disabled = purchaseMapPending;
    }, error => {
      purchaseLocating = false;
      purchaseMapLocate.disabled = purchaseMapPending;
      purchaseMapStatus.textContent = error.code === 1 ? 'Location access was denied. Pan and zoom to find a station.' : 'Could not find your location. Try Near me again or explore the map.';
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  });
  function showPurchaseMap() {
    if (document.getElementById('user-panel').hidden || document.getElementById('purchase-panel').hidden) return;
    if (purchaseMap) purchaseMap.invalidateSize();
    void loadPurchaseStations();
  }
`;
