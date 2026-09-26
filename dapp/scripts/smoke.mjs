import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout } from "node:timers/promises";

const port = "13001";
const server = spawn(process.execPath, ["dist/index.js"], {
  cwd: new URL("../", import.meta.url),
  env: { ...process.env, PORT: port, KIRISAME_INVENTORY_SYNC: 'false', NODE_ENV: "production" },
  stdio: ["ignore", "pipe", "inherit"],
});
const exited = new Promise((resolve) => server.once("exit", resolve));

try {
  await new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => reject(new Error("Server startup timed out")), 10000);
    server.once("error", (error) => { clearTimeout(timer); reject(error); });
    server.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited during startup: ${code}`));
    });
    server.stdout.once("data", () => { clearTimeout(timer); resolve(); });
  });

  const page = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(5000) });
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type"), /text\/html/);
  assert.match(await page.text(), /<title>Kirisame<\/title>/);

  const decoder = await fetch(`http://127.0.0.1:${port}/assets/barcode-reader.js`);
  assert.equal(decoder.status, 200);
  assert.match(decoder.headers.get('content-type'), /javascript/);
  assert.match(await decoder.text(), /ZXingBrowser/);

  const health = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(5000) });
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true });
  console.log("Production smoke check passed: main page and health endpoint.");
} finally {
  server.kill("SIGTERM");
  await Promise.race([exited, setTimeout(2000, undefined, { ref: false }).then(() => server.kill("SIGKILL"))]);
}
