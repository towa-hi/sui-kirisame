import type { InventoryStore } from './inventory-store.js';
import { packageId } from './deployment.js';
import { Hono } from 'hono';
import { Transaction } from '@mysten/sui/transactions';
import { isValidSuiAddress } from '@mysten/sui/utils';

// Current deployment: move/kirisame/Published.toml.
export const conditionBond = 30_000_000;

export function supplyRoutes(store?: InventoryStore) {
  const routes = new Hono();
  routes.get('/default-name', c => {
    c.header('Cache-Control', 'no-store');
    if (!store?.ready) return c.json({ error: 'Umbrella inventory is catching up.' }, 503);
    return c.json({ name: store.nextUmbrellaName() });
  });
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
    if (body.name !== undefined && (typeof body.name !== 'string' || new TextEncoder().encode(body.name.trim()).length > 256)) {
      return c.json({ error: 'Enter a name of at most 256 UTF-8 bytes.' }, 400);
    }
    const requestedName = body.name?.trim() ?? '';
    if (!requestedName && !store?.ready) return c.json({ error: 'Umbrella inventory is catching up. Please retry shortly.' }, 503);
    const name = store ? store.reserveUmbrellaName(requestedName) : requestedName;
    const tx = new Transaction();
    tx.setSender(body.sender);
    const [bond] = tx.splitCoins(tx.gas, [tx.pure.u64(conditionBond)]);
    tx.moveCall({
      target: `${packageId}::umbrella::user_create_umbrella`,
      arguments: [bond, tx.pure.u8(body.color), tx.pure.string(name)],
    });
    return c.json({ transaction: await tx.toJSON(), network: 'sui:testnet', name });
  });
  return routes;
}
