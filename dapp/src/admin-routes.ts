import { Hono } from 'hono';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Transaction, type TransactionArgument } from '@mysten/sui/transactions';
import { isValidSuiAddress, normalizeSuiAddress, isValidTransactionDigest } from '@mysten/sui/utils';
import { adminActions } from './admin.js';
import { stationActions } from './station.js';
const packageId = process.env.KIRISAME_PACKAGE_ID || '0x19dcc66da70db7639e20d056e45a739eb6e1756c29d0838cf69e9a56133a8001';
const originalId = process.env.KIRISAME_ORIGINAL_PACKAGE_ID || packageId;
export function adminRoutes(sui: SuiGrpcClient, role: 'admin' | 'station' = 'admin') {
  const actions = role === 'station' ? stationActions : adminActions;
  const routes = new Hono();
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
      // Station forms supply the capability explicitly so operators can choose
      // among multiple stations. Move validates its type, ownership and station.
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
      const result = await sui.waitForTransaction({ digest, timeout: 20000, signal: AbortSignal.timeout(22000) });
      if (result.$kind === 'FailedTransaction' || !result.Transaction.status.success) return c.json({ error: 'The transaction failed on chain. Check its details before retrying.', digest }, 422);
      return c.json({ digest, success: true });
    } catch { return c.json({ error: 'Confirmation is still unavailable. Check the transaction before retrying.', digest }, 504); }
  });
  return routes;
}
