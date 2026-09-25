import { Hono } from 'hono';
import type { SuiGrpcClient } from '@mysten/sui/grpc';
import { ObjectError } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { packageId, originalId } from './deployment.js';
import { umbrellaBcs } from './umbrella-routes.js';
import { stationBcs } from './inventory-routes.js';

export function purchaseRoutes(sui: Pick<SuiGrpcClient, 'getObject'>) {
  const routes = new Hono();
  routes.post('/', async c => {
    c.header('Cache-Control', 'no-store');
    let body;
    try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid request.' }, 400); }
    const fullId = (value: unknown): value is string => typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);
    const u64 = (value: unknown): value is string => typeof value === 'string' && /^[0-9]{1,20}$/.test(value) && BigInt(value) <= 18446744073709551615n;
    if (!body || typeof body.sender !== 'string' || !isValidSuiAddress(body.sender) || !fullId(body.umbrellaId) || !fullId(body.stationId) || !u64(body.purchasePrice) || !u64(body.ownerCount)) {
      return c.json({ error: 'A connected account and valid umbrella details are required.' }, 400);
    }
    try {
      const { object } = await sui.getObject({ objectId: normalizeSuiAddress(body.umbrellaId), include: { content: true }, signal: AbortSignal.timeout(10000) });
      if (object.type !== `${normalizeSuiAddress(originalId)}::umbrella::Umbrella`) return c.json({ error: 'This is not a Kirisame umbrella.' }, 422);
      const umbrella = umbrellaBcs.parse(object.content);
      if (umbrella.state.$kind !== 'Docked' || !umbrella.current_station_id) return c.json({ error: 'This umbrella is not available for purchase. Look it up again to refresh its status.' }, 409);
      if (umbrella.current_station_id !== normalizeSuiAddress(body.stationId) || umbrella.purchase_price !== body.purchasePrice || umbrella.owner_count !== body.ownerCount) {
        return c.json({ error: 'Umbrella details changed. Look it up again before purchasing.' }, 409);
      }
      const { object: station } = await sui.getObject({ objectId: umbrella.current_station_id, include: { content: true }, signal: AbortSignal.timeout(10000) });
      if (station.type !== `${normalizeSuiAddress(originalId)}::umbrella::Station` || stationBcs.parse(station.content).status.$kind !== 'Active') {
        return c.json({ error: 'This station is not accepting purchases.' }, 409);
      }
      const tx = new Transaction();
      tx.setSender(body.sender);
      const [payment] = tx.splitCoins(tx.gas, [tx.pure.u64(umbrella.purchase_price)]);
      tx.moveCall({
        target: `${packageId}::umbrella::user_undock_umbrella`,
        arguments: [tx.object(umbrella.current_station_id), tx.object(object.objectId), payment, tx.pure.u64(umbrella.owner_count), tx.object('0x6')],
      });
      return c.json({ transaction: await tx.toJSON(), network: 'sui:testnet' });
    } catch (error) {
      if (error instanceof ObjectError && ['notFound', 'deleted'].includes(error.reason)) return c.json({ error: 'The umbrella or station no longer exists.' }, 404);
      return c.json({ error: 'Unable to prepare the purchase. Please try again.' }, 502);
    }
  });
  return routes;
}
