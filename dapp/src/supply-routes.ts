import { packageId } from './deployment.js';
import { Hono } from 'hono';
import { Transaction } from '@mysten/sui/transactions';
import { isValidSuiAddress } from '@mysten/sui/utils';

// Current deployment: move/kirisame/Published.toml.
export const conditionBond = 30_000_000;

export function supplyRoutes() {
  const routes = new Hono();
  routes.post('/create', async c => {
    c.header('Cache-Control', 'no-store');
    let body;
    try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid request.' }, 400); }
    if (!body || typeof body.sender !== 'string' || !isValidSuiAddress(body.sender)) {
      return c.json({ error: 'A connected Sui account is required.' }, 400);
    }
    if (!Number.isInteger(body.color) || body.color < 0 || body.color > 2) {
      return c.json({ error: 'Choose Vinyl, Black, or White.' }, 400);
    }
    const tx = new Transaction();
    tx.setSender(body.sender);
    const [bond] = tx.splitCoins(tx.gas, [tx.pure.u64(conditionBond)]);
    tx.moveCall({
      target: `${packageId}::umbrella::user_create_umbrella`,
      arguments: [bond, tx.pure.u8(body.color)],
    });
    return c.json({ transaction: await tx.toJSON(), network: 'sui:testnet' });
  });
  return routes;
}
