import { packageId, originalId } from './deployment.js';
import { Hono } from 'hono';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Transaction, type TransactionArgument } from '@mysten/sui/transactions';
import { isValidSuiAddress, normalizeSuiAddress, isValidTransactionDigest } from '@mysten/sui/utils';
import { adminActions } from './admin.js';
import { stationActions } from './station.js';
import { ownedStations } from './station-access.js';
import { umbrellaBcs } from './umbrella-routes.js';
export function adminRoutes(sui: SuiGrpcClient, role: 'admin' | 'station' = 'admin') {
  const actions = role === 'station' ? stationActions : adminActions;
  const routes = new Hono();
  if (role === 'station') routes.get('/owned/:owner', async c => {
    c.header('Cache-Control', 'no-store');
    const owner = c.req.param('owner');
    if (!isValidSuiAddress(owner)) return c.json({ error: 'Invalid wallet address.' }, 400);
    try { return c.json({ stations: await ownedStations(sui, owner) }); }
    catch { return c.json({ error: 'Unable to load your stations. Reconnect your wallet to retry.' }, 502); }
  });
  routes.post('/:action', async c => {
    c.header('Cache-Control', 'no-store');
    const action = actions.find(item => item.id === c.req.param('action'));
    if (!action) return c.json({ error: `Unknown ${role} function.` }, 404);
    let body;
    try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid request.' }, 400); }
    if (!body || typeof body.sender !== 'string' || !isValidSuiAddress(body.sender) || !body.parameters || typeof body.parameters !== 'object') return c.json({ error: 'A connected Sui account and parameters are required.' }, 400);
    const values: Record<string, string | boolean> = {};
    for (const field of action.fields) {
      const value = body.parameters[field.name];
      const max = 'max' in field ? String(field.max) : '18446744073709551615';
      const valid = field.kind === 'boolean' ? typeof value === 'boolean' : typeof value === 'string' && (field.kind === 'object' ? /^0x[0-9a-fA-F]{1,64}$/.test(value) : field.kind === 'integer' ? /^[0-9]{1,20}$/.test(value) && BigInt(value) <= BigInt(max) : value.trim().length > 0 && value.length <= 256);
      if (!valid) return c.json({ error: `Invalid ${field.label.toLowerCase()}.` }, 400);
      values[field.name] = value;
    }
    try {
      const tx = new Transaction();
      tx.setSender(body.sender);
      const args: TransactionArgument[] = [];
      if (role === 'admin') {
        const { objects } = await sui.listOwnedObjects({ owner: body.sender, type: `${originalId}::umbrella::AdminCap`, limit: 1, signal: AbortSignal.timeout(10000) });
        if (!objects.length) return c.json({ error: 'This wallet does not own the Kirisame AdminCap on testnet.' }, 403);
        args.push(tx.object(objects[0].objectId));
      }
      if (action.id === 'station_dock_umbrella') {
        const stations = await ownedStations(sui, body.sender);
        const station = stations.find(item => item.station === normalizeSuiAddress(String(values.station)) && item.cap === normalizeSuiAddress(String(values.cap)));
        if (!station) return c.json({ error: 'This wallet does not own an active station matching this request.' }, 403);
        const { object } = await sui.getObject({ objectId: normalizeSuiAddress(String(values.umbrella)), include: { content: true }, signal: AbortSignal.timeout(10000) });
        if (object.type !== `${normalizeSuiAddress(originalId)}::umbrella::Umbrella`) return c.json({ error: 'This object is not a Kirisame umbrella.' }, 422);
        values.expected_owner_count = umbrellaBcs.parse(object.content).owner_count;
      }
      // Move also enforces capability ownership, station matching and lifecycle rules.
      for (const field of action.fields) {
        const value = values[field.name];
        args.push(field.name === 'payout_address' ? tx.pure.address(normalizeSuiAddress(String(value))) : field.kind === 'object' ? tx.object(normalizeSuiAddress(String(value))) : field.kind === 'integer' ? tx.pure.u64(String(value)) : field.kind === 'boolean' ? tx.pure.bool(Boolean(value)) : tx.pure.string(String(value)));
      }
      if (role === 'station' || action.id === 'admin_settle_pending_payments') args.push(tx.object('0x6'));
      tx.moveCall({ target: `${packageId}::umbrella::${action.id}`, arguments: args });
      return c.json({ transaction: await tx.toJSON(), network: 'sui:testnet' });
    } catch { return c.json({ error: 'Unable to prepare the transaction. Please try again.' }, 502); }
  });
  routes.get('/transactions/:digest', async c => {
    c.header('Cache-Control', 'no-store');
    const digest = c.req.param('digest');
    if (!isValidTransactionDigest(digest)) return c.json({ error: 'Invalid transaction digest.' }, 400);
    try {
      const result = await sui.waitForTransaction({ digest, include: { effects: true, objectTypes: true }, timeout: 20000, signal: AbortSignal.timeout(22000) });
      if (result.$kind === 'FailedTransaction' || !result.Transaction.status.success) return c.json({ error: 'The transaction failed on chain. Check its details before retrying.', digest }, 422);
      const umbrellaIds = (result.Transaction.effects?.changedObjects ?? [])
        .filter(object => object.idOperation === 'Created' && result.Transaction.objectTypes?.[object.objectId] === `${normalizeSuiAddress(originalId)}::umbrella::Umbrella`)
        .map(object => object.objectId);
      return c.json({ digest, success: true, umbrellaIds });
    } catch { return c.json({ error: 'Confirmation is still unavailable. Check the transaction before retrying.', digest }, 504); }
  });
  return routes;
}
