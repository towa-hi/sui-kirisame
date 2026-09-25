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

app.route("/api/admin", adminRoutes(sui));
app.route("/api/station", adminRoutes(sui, "station"));
app.route("/api/supply", supplyRoutes());

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

serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`Kirisame dapp listening on http://localhost:${info.port}`);
});
