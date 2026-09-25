import { originalId } from './deployment.js';
import { Hono } from 'hono';
import { bcs } from '@mysten/sui/bcs';
import { ObjectError } from '@mysten/sui/client';
import type { SuiGrpcClient } from '@mysten/sui/grpc';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import QRCode from 'qrcode';

// Field order mirrors move/kirisame/sources/kirisame.move.
export const umbrellaBcs = bcs.struct('Umbrella', {
  id: bcs.Address, supplier: bcs.Address, color: bcs.u8(),
  state: bcs.enum('UmbrellaState', { Created: null, Docked: null, Held: null, Quarantined: null, Sold: null, Retired: null }),
  current_station_id: bcs.option(bcs.Address), checkout_station_id: bcs.option(bcs.Address), holder: bcs.option(bcs.Address),
  checkout_time_ms: bcs.u64(), inspection_deadline_ms: bcs.u64(), purchase_price: bcs.u64(), fee_per_ms: bcs.u64(), condition_bond: bcs.u64(),
  active_escrow: bcs.u64(), pending_condition: bcs.u64(), pending_condition_owner: bcs.option(bcs.Address),
  last_condition_amount: bcs.u64(), last_condition_cycle: bcs.u64(),
  last_condition_status: bcs.enum('ConditionStatus', { Pending: null, Paid: null, Forfeited: null, AwaitingReview: null, RefundApproved: null }),
  checkout_payout_address: bcs.option(bcs.Address), admin_payout_address: bcs.option(bcs.Address), owner_count: bcs.u64(),
});

export function umbrellaRoutes(sui: Pick<SuiGrpcClient, 'getObject'>) {
  const routes = new Hono();
  routes.get('/:id/qr', async c => {
    const id = c.req.param('id');
    if (!/^0x[0-9a-fA-F]{64}$/.test(id)) return c.json({ error: 'Invalid umbrella ID.' }, 400);
    // The browser supplies its public origin so reverse proxies cannot produce HTTP labels.
    const origin = c.req.query('origin') ?? new URL(c.req.url).origin;
    try {
      const base = new URL(origin);
      if (!['https:', 'http:'].includes(base.protocol) || base.origin !== origin || origin.length > 256) throw new Error('Invalid origin');
      const link = new URL('/', base);
      link.searchParams.set('umbrella', id.toLowerCase());
      const svg = await QRCode.toString(link.href, { type: 'svg', errorCorrectionLevel: 'M', margin: 4, width: 320 });
      c.header('Content-Type', 'image/svg+xml');
      c.header('Content-Disposition', `inline; filename="umbrella-${id.toLowerCase()}.svg"`);
      return c.body(svg);
    } catch { return c.json({ error: 'Unable to generate the umbrella QR code.' }, 400); }
  });
  routes.get('/:id', async c => {
    c.header('Cache-Control', 'no-store');
    const id = c.req.param('id');
    if (!/^0x[0-9a-fA-F]{64}$/.test(id)) return c.json({ error: 'Scan a code containing a full Sui umbrella object ID.' }, 400);
    try {
      const { object } = await sui.getObject({ objectId: normalizeSuiAddress(id), include: { content: true }, signal: AbortSignal.timeout(10000) });
      if (object.type !== `${normalizeSuiAddress(originalId)}::umbrella::Umbrella`) {
        return c.json({ error: 'This object is not an umbrella from the configured Kirisame testnet deployment.' }, 422);
      }
      const data = umbrellaBcs.parse(object.content);
      return c.json({
        objectId: object.objectId, network: 'testnet',
        color: ['Vinyl', 'Black', 'White'][data.color] ?? 'Unknown', state: data.state.$kind,
        supplier: data.supplier, station: data.current_station_id, holder: data.holder,
        purchasePrice: data.purchase_price, conditionBond: data.condition_bond,
        feePerMs: data.fee_per_ms, ownerCount: data.owner_count,
        conditionStatus: data.last_condition_status.$kind,
      });
    } catch (error) {
      if (error instanceof ObjectError && ['notFound', 'deleted'].includes(error.reason)) {
        return c.json({ error: 'Umbrella not found on Sui testnet. Check the code and try again.' }, 404);
      }
      return c.json({ error: 'Unable to load umbrella details. Please try again.' }, 502);
    }
  });
  return routes;
}
