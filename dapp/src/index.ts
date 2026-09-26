import { InventoryStore } from './inventory-store.js';
import { InventorySync } from './inventory-sync.js';
import { originalId, packageId } from './deployment.js';
import { resolve } from 'node:path';
import { inventoryRoutes } from './inventory-routes.js';
import { purchaseRoutes } from './purchase-routes.js';
import { readFile } from 'node:fs/promises';
import { umbrellaRoutes } from './umbrella-routes.js';
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { isValidSuiAddress } from "@mysten/sui/utils";
import { adminRoutes } from "./admin-routes.js";
import { page } from "./page.js";

import { supplyRoutes } from "./supply-routes.js";

const app = new Hono();
const sui = new SuiGrpcClient({ network: "testnet", baseUrl: "https://fullnode.testnet.sui.io:443" });

app.get("/api/balance/:address", async (c) => {
  const owner = c.req.param("address");
  c.header("Cache-Control", "no-store");
  if (!isValidSuiAddress(owner)) return c.json({ error: "Invalid Sui address" }, 400);
  try {
    const { balance } = await sui.getBalance({ owner, signal: AbortSignal.timeout(10000) });
    return c.json({ balance: balance.balance, network: "testnet" });
  } catch {
    return c.json({ error: "Unable to load SUI balance. Please try again." }, 502);
  }
});

const inventory = process.env.KIRISAME_INVENTORY_SYNC === 'false' ? undefined
  : new InventoryStore(process.env.KIRISAME_INVENTORY_DB || resolve('data/inventory.sqlite'));
const syncAbort = new AbortController();
const syncTask = inventory ? new InventorySync(inventory,
  process.env.KIRISAME_GRAPHQL_URL || 'https://graphql.testnet.sui.io/graphql', originalId, packageId,
  fetch, process.env.KIRISAME_GRAPHQL_SUBSCRIPTIONS_URL).run(syncAbort.signal) : Promise.resolve();
app.route("/api/inventory", inventoryRoutes(fetch, inventory));
app.route("/api/admin", adminRoutes(sui));
app.route("/api/station", adminRoutes(sui, "station"));
app.route("/api/supply", supplyRoutes());
app.route('/api/purchase', purchaseRoutes(sui));

app.route('/api/umbrellas', umbrellaRoutes(sui));
app.get('/assets/barcode-reader.js', async c => {
  const script = await readFile(new URL('../node_modules/@zxing/browser/umd/zxing-browser.min.js', import.meta.url), 'utf8');
  c.header('Content-Type', 'text/javascript; charset=utf-8');
  return c.body(script);
});

app.get("/", (c) => c.html(page));
app.get("/health", (c) => c.json({ ok: true }));

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const server = serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`Kirisame dapp listening on http://localhost:${info.port}`);
});

for (const event of ['SIGTERM', 'SIGINT'] as const) {
  process.once(event, () => {
    syncAbort.abort();
    server.close();
    void syncTask.finally(() => inventory?.close());
  });
}
