import { bcs } from '@mysten/sui/bcs';
import { fromBase64 } from '@mysten/sui/utils';
import { umbrellaBcs } from './umbrella-routes.js';

// Field order follows Station in move/kirisame/sources/kirisame.move.
export const stationBcs = bcs.struct('Station', {
  id: bcs.Address, display_name: bcs.string(), location_name: bcs.string(),
  latitude_e6: bcs.u64(), longitude_e6: bcs.u64(), payout_address: bcs.Address,
  maintenance_reserve: bcs.Address, admin_payout_address: bcs.Address,
  status: bcs.enum('StationStatus', { Active: null, Removing: null, Removed: null }),
  docked_count: bcs.u64(), authorized_cap: bcs.Address,
});

export type InventoryKind = 'stations' | 'umbrellas';
export type InventoryNode = { address: string; asMoveObject?: { contents?: { bcs?: string } } };
export function inventoryItem(kind: InventoryKind, node: InventoryNode) {
  const encoded = node.asMoveObject?.contents?.bcs;
  if (!encoded) throw new Error('Missing object contents');
  const bytes = fromBase64(encoded);
  if (kind === 'stations') {
    const data = stationBcs.parse(bytes);
    return { objectId: node.address, name: data.display_name, location: data.location_name,
      latitude: Number(data.latitude_e6) / 1e6 - 90, longitude: Number(data.longitude_e6) / 1e6 - 180,
      status: data.status.$kind, dockedCount: data.docked_count, payoutAddress: data.payout_address };
  }
  const data = umbrellaBcs.parse(bytes);
  return { objectId: node.address, name: data.name, color: ['Vinyl', 'Black', 'White'][data.color] ?? 'Unknown',
    status: data.state.$kind, station: data.current_station_id, holder: data.holder, supplier: data.supplier,
    ownerCount: data.owner_count, purchasePrice: data.purchase_price, conditionBond: data.condition_bond,
    activeEscrow: data.active_escrow, pendingCondition: data.pending_condition, conditionStatus: data.last_condition_status.$kind };
}
