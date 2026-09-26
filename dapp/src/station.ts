const fields = [
  { name: 'cap', label: 'Station capability ID', kind: 'object' },
  { name: 'station', label: 'Station ID', kind: 'object' },
  { name: 'umbrella', label: 'Umbrella ID', kind: 'object' },
  { name: 'expected_owner_count', label: 'Expected owner count', kind: 'integer' },
];

export const stationActions = [
  { id: 'station_dock_umbrella', title: 'Dock umbrella', description: 'Scan the umbrella QR code to confirm physical receipt of a new umbrella or a return after inspection ends. After one day of usage, a return finalizes ownership instead: the umbrella leaves the system and is permanently yours.', fields },
  { id: 'station_quarantine_umbrella', title: 'Quarantine umbrella', description: 'Confirm rejection during the inspection period, refund the buyer, and hold the umbrella for admin review.', fields },
];

export const stationMarkup = /* html */ `
  <div class="admin-heading"><h1>Station functions</h1><p id="station-mode">Testnet · Connect your wallet to use station functions. You must own the matching StationCap.</p></div>
  <div class="admin-actions">${stationActions.map(action => `<button type="button" class="admin-action station-action" disabled data-action="${action.id}"><strong>${action.title}</strong><span>${action.description}</span><span class="action-arrow" aria-hidden="true">↗</span></button>`).join('')}</div>
`;
