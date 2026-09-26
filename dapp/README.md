# Kirisame dapp

A Node server using Hono and TypeScript, following the old repository's station server setup.

Requires Node.js 20 or newer. From this directory:

```sh
npm ci
npm run dev
```

Open http://localhost:3001. The development server restarts when source files change.
Use `PORT=3002 npm run dev` to choose another port.

- `GET /` serves the main page.
- `GET /health` returns `{ "ok": true }`.
- `npm start` runs the compiled production server (run `npm run build` first).
- `npm run typecheck` checks TypeScript.
- `npm run build` compiles to `dist/`; run the compiled server with `node dist/index.js`.

Edit `src/page.ts` for the page and `src/index.ts` for routes.

## Deployment

GitHub Actions builds and smoke-checks the production server on pull requests and
pushes to `master`. Render hosts the Node process and manages public HTTPS.
The runtime is pinned in `.node-version` for both CI and Render.

One-time setup after these files are merged into `master`:

1. Sign in to https://dashboard.render.com and connect your GitHub account.
2. Choose **New > Blueprint**, select `towa-hi/sui-kirisame`, and use `master`.
3. Render reads the root `render.yaml`. Create the free `kirisame-dapp` service.
4. Wait for the initial deploy, then open the HTTPS URL shown on the service page.

Subsequent pushes to `master` deploy automatically after GitHub CI passes.
No deploy hook or GitHub secret is needed: Render reads GitHub check results
through the connected GitHub account. Ensure Auto-Deploy is **After CI Checks Pass**.
The initial Blueprint creation deploys immediately; verify CI before creating it.

The free service sleeps after 15 minutes without traffic, so its first request
after sleeping takes longer. A paid instance can be selected later for continuous uptime.
Render assigns the public hostname; a custom domain is optional.

To reproduce the production checks locally:

```sh
npm ci --include=dev
npm run build
npm prune --omit=dev
npm run smoke
npm ci
```

The last command restores development dependencies.

## Admin transactions

The Admin tab exposes all six contract admin functions. The server validates
parameters and discovers the connected wallet's `AdminCap`, then returns an
unsigned transaction. Slush requests approval and submits it on Sui testnet.
The app checks the transaction result before showing a six-second completion
toast. Rejections and failures keep the form values; uncertain confirmations
include a transaction link so the outcome can be checked before retrying.

The default package is the testnet deployment in `move/kirisame/Published.toml`.
Set `KIRISAME_PACKAGE_ID` to change the call target. For an upgraded package,
set `KIRISAME_ORIGINAL_PACKAGE_ID` to the original package defining `AdminCap`.
No server signing key is needed. The wallet must own the AdminCap and have gas.
Coordinate inputs accept the contract's encoded unsigned E6 values.

Run `npm test` for transaction construction, validation, capability, and result
handling tests. Tests use a mocked chain client and never submit transactions.

## Create umbrella

In **User → Supply**, choose Vinyl, Black, or White from the color dropdown,
then select **Create umbrella**. Slush approves the testnet transaction, which
posts the contract's 0.03 SUI condition bond plus network gas. Any connected
wallet can create an umbrella; no AdminCap is required. The umbrella starts in
`Created` and must be physically delivered to a station for docking.

`POST /api/supply/create` validates the sender and color and returns an unsigned
`user_create_umbrella` transaction. Its default package matches the current
`move/kirisame/Published.toml`; `KIRISAME_PACKAGE_ID` overrides it. The form keeps
the selected color after failure and includes a transaction link when a digest
is available. Success is shown only after chain confirmation.

## Scan umbrella

In **User → Purchase**, **Scan umbrella** opens a camera modal, preferring the rear camera. QR codes and supported 1D/2D barcodes are decoded locally with a bundled ZXing reader; camera images are not uploaded. Once decoded, the camera stops and the app looks up the object on Sui testnet. No wallet connection is needed.

Labels can contain a full `0x` + 64 hexadecimal-character object ID, a `https://suiscan.xyz/testnet/object/<id>` link, or a same-origin app URL with `?umbrella=<id>`. Arbitrary product numbers have no mapping to Sui objects. A manual ID entry and **Scan again** are available for retries or unsupported cameras. Camera access requires HTTPS (or localhost) and browser permission.

`GET /api/umbrellas/:id` checks the object's full package/module/type before decoding its BCS contents. The modal displays color, state, purchase price, condition bond, hourly usage fee, current station/holder, supplier, checkout count, condition-fund status, and an explorer link. The lookup uses the current published package by default, or `KIRISAME_ORIGINAL_PACKAGE_ID` / `KIRISAME_PACKAGE_ID` overrides. Keep the BCS layout in `src/umbrella-routes.ts` synchronized with contract upgrades.

Tests cover object validation, lookup failures, precise amounts, duplicate scans, camera denial, and cleanup when closing during camera permission or lookup. Physical label scanning in the target phone/Slush browser still needs device testing.

## Admin inventory

The Admin tab contains separate keyboard-accessible, scrollable station and umbrella
card lists. Each list loads 50 objects at a time, with Refresh and Load more controls.
Cards include object links, lifecycle status, station inventory/location, and umbrella
custody, checkout count, and escrow/condition balances. No wallet is needed to read
inventory. Confirmed admin, station, and supply transactions trigger a refresh.

`GET /api/inventory/stations` and `GET /api/inventory/umbrellas` accept an optional
`cursor` query parameter and return `{ items, nextCursor }`. They query the configured
original package through Sui's testnet GraphQL indexer; newly created or updated objects
may take time to appear. `KIRISAME_GRAPHQL_URL` overrides the default testnet endpoint.
The shared deployment settings in `src/deployment.ts` apply to inventory, scans, and
transaction construction. Keep the Station and Umbrella BCS layouts in sync with Move.

### Docking by QR code

In **Station → Dock umbrella**, connect a wallet holding a StationCap for an active
station, then scan the umbrella label. The confirmation form fills the umbrella
and station IDs automatically; wallets owning multiple active stations can choose
the receiving station. The capability and expected owner count need no manual input.
The server verifies station ownership and reads the latest owner count when preparing
the transaction. Move still enforces ownership, inspection timing, and buyback rules.
Camera denial supports manual umbrella ID entry. Physical camera scanning still
requires testing on the target device.
