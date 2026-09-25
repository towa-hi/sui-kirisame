import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { placeholder } from "./placeholder.js";

const app = new Hono();

app.get("/", (c) => c.html(placeholder));
app.get("/health", (c) => c.json({ ok: true }));

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`Kirisame dapp listening on http://localhost:${info.port}`);
});
