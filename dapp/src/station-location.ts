export const stationLocationStyles = /* css */ `
  .station-location-actions { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: 1rem; }
  .station-location-actions button, .station-location-apply { border: 1px solid #cad4cc; background: #fff; }
  .station-location-map { height: 260px; border-radius: .5rem; margin: .7rem 0; }
  .station-location-status { overflow-wrap: anywhere; }
`;

export const stationLocationScript = /* js */ `
  let stationMapAssets;
  let disposeStationLocation = () => {};
  function loadStationMapAssets() {
    if (!stationMapAssets) stationMapAssets = Promise.all([
      new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        link.onload = resolve;
        link.onerror = () => { link.remove(); reject(new Error('Map styles could not load. Check your connection and try again.')); };
        document.head.append(link);
      }),
      new Promise((resolve, reject) => {
        if (window.L) return resolve();
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.onload = resolve;
        script.onerror = () => { script.remove(); reject(new Error('Map could not load. Check your connection and try again.')); };
        document.head.append(script);
      }),
    ]).catch(error => { stationMapAssets = null; throw error; });
    return stationMapAssets;
  }
  function addStationLocationControls() {
    const controls = document.createElement('div');
    controls.innerHTML = '<div class="station-location-actions"><button type="button" class="station-locate">Use current location</button><button type="button" class="station-select-map" aria-expanded="false" aria-controls="station-map-selector">Choose on map</button></div><p class="station-location-status" role="status"></p><div id="station-map-selector" hidden><p>Tap the map or move it with the arrow keys to position the pin, then use this location.</p><div class="station-location-map" role="region" aria-label="Choose station location"></div><p class="station-map-coordinates" role="status"></p><button type="button" class="station-location-apply">Use this location</button></div>';
    adminFields.querySelector('[name="longitude_e6"]').closest('label').after(controls);
    const locate = controls.querySelector('.station-locate');
    const toggle = controls.querySelector('.station-select-map');
    const status = controls.querySelector('.station-location-status');
    const panel = controls.querySelector('#station-map-selector');
    const coordinates = controls.querySelector('.station-map-coordinates');
    let active = true;
    let request = 0;
    let map;
    let marker;
    const valid = () => active && adminDialog.open && !adminPending;
    const normalize = point => ({ lat: Math.max(-90, Math.min(90, point.lat)), lng: ((point.lng + 180) % 360 + 360) % 360 - 180 });
    function fill(point) {
      const { lat, lng } = normalize(point);
      for (const [name, value] of [['latitude_e6', Math.round((lat + 90) * 1e6)], ['longitude_e6', Math.round((lng + 180) * 1e6)]]) {
        const input = adminForm.elements.namedItem(name);
        input.value = String(value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      status.textContent = 'Location set: ' + lat.toFixed(6) + ', ' + lng.toFixed(6);
      if (map) map.setView([lat, lng], 16);
    }
    locate.addEventListener('click', () => {
      if (!valid()) return;
      if (!navigator.geolocation) {
        status.textContent = 'Current location is unavailable in this browser. Choose on the map or enter coordinates.';
        return;
      }
      const currentRequest = ++request;
      locate.disabled = true;
      locate.textContent = 'Locating…';
      status.textContent = '';
      navigator.geolocation.getCurrentPosition(position => {
        if (valid() && request === currentRequest) fill({ lat: position.coords.latitude, lng: position.coords.longitude });
        if (active) { locate.disabled = false; locate.textContent = 'Use current location'; }
      }, error => {
        if (valid() && request === currentRequest) status.textContent = error.code === 1
          ? 'Location access was denied. Allow location access or choose on the map.'
          : error.code === 3 ? 'Location request timed out. Try again or choose on the map.' : 'Could not determine your location. Try again or choose on the map.';
        if (active) { locate.disabled = false; locate.textContent = 'Use current location'; }
      }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    });
    toggle.addEventListener('click', async () => {
      if (!valid()) return;
      if (!panel.hidden) {
        panel.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
        return;
      }
      toggle.disabled = true;
      status.textContent = 'Loading map…';
      try {
        await loadStationMapAssets();
        if (!valid()) return;
        panel.hidden = false;
        toggle.setAttribute('aria-expanded', 'true');
        status.textContent = '';
        const latValue = adminForm.elements.namedItem('latitude_e6').value;
        const lngValue = adminForm.elements.namedItem('longitude_e6').value;
        const lat = Number(latValue) / 1e6 - 90;
        const lng = Number(lngValue) / 1e6 - 180;
        const hasLocation = latValue.trim() !== '' && lngValue.trim() !== '' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
        if (!map) {
          map = L.map(controls.querySelector('.station-location-map'), { scrollWheelZoom: false });
          L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          }).on('tileerror', () => { status.textContent = 'Map tiles could not load. Check your connection or enter coordinates manually.'; }).addTo(map);
          marker = L.circleMarker([0, 0], { radius: 8, color: '#243c32', fillColor: '#557866', fillOpacity: 1 }).addTo(map);
          map.on('move', () => {
            marker.setLatLng(map.getCenter());
            const point = normalize(map.getCenter());
            coordinates.textContent = point.lat.toFixed(6) + ', ' + point.lng.toFixed(6);
          });
          map.on('click', event => map.panTo(event.latlng));
          // Keep Enter on the map from submitting the station form.
          map.getContainer().addEventListener('keydown', event => { if (event.key === 'Enter') event.preventDefault(); });
        }
        map.invalidateSize();
        map.setView(hasLocation ? [lat, lng] : [20, 0], hasLocation ? 16 : 2);
        map.getContainer().focus();
      } catch (error) {
        if (valid()) status.textContent = error.message;
      } finally {
        if (active) toggle.disabled = false;
      }
    });
    controls.querySelector('.station-location-apply').addEventListener('click', () => {
      if (!valid() || !map) return;
      ++request;
      fill(map.getCenter());
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      toggle.focus();
    });
    disposeStationLocation = () => { active = false; ++request; if (map) map.remove(); };
  }
  adminDialog.addEventListener('close', () => disposeStationLocation());
`;
