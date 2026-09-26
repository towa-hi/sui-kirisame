import { bcs } from '@mysten/sui/bcs';
import type { SuiGrpcClient } from '@mysten/sui/grpc';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { originalId } from './deployment.js';
import { stationBcs } from './inventory-routes.js';

export const stationCapBcs = bcs.struct('StationCap', { id: bcs.Address, station: bcs.Address });

export async function ownedStations(sui: SuiGrpcClient, owner: string) {
  const stations = [];
  let cursor: string | null | undefined;
  do {
    const page = await sui.listOwnedObjects({ owner, type: `${originalId}::umbrella::StationCap`, include: { content: true }, cursor, limit: 50, signal: AbortSignal.timeout(10000) });
    for (const cap of page.objects) {
      const data = stationCapBcs.parse(cap.content);
      const { object } = await sui.getObject({ objectId: data.station, include: { content: true }, signal: AbortSignal.timeout(10000) });
      if (object.type !== `${normalizeSuiAddress(originalId)}::umbrella::Station`) continue;
      const station = stationBcs.parse(object.content);
      if (station.status.$kind === 'Active') stations.push({ cap: cap.objectId, station: object.objectId, name: station.display_name });
    }
    if (!page.hasNextPage) break;
    if (!page.cursor || page.cursor === cursor) throw new Error('Invalid station pagination');
    cursor = page.cursor;
  } while (true);
  return stations;
}
