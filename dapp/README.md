# Kirisame dapp

A Node server using Hono and TypeScript, following the old repository's station server setup.

Requires Node.js 22.22.0 or newer (uses the built-in SQLite module). From this directory:

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
Running `move/kirisame/publish-and-init.sh` automatically updates the defaults in
`dapp/src/deployment.ts` after a successful publish (requires Python 3.11+).
It also refreshes the root README's deployment link, then creates `Toranomon Station`
and `EthGlobal Station`, both owned by `station`. Each receives one Black and one
Vinyl umbrella supplied by `alice-supplier`, with both umbrellas docked automatically.
Initialization is included in the shell script and uses the local `mono`, `station`,
and `alice-supplier` signing accounts. Both stations use the existing approximate
Toranomon demo coordinates. Transaction logs and a result JSON are saved in a printed
temporary directory; inspect them before retrying if initialization fails partway.
The app footer reads the
configured package ID directly, so it follows deployment updates and environment
overrides without the script editing the page.
Rebuild and restart the app to use the new defaults, or commit the updated
deployment files and redeploy the hosted app.
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

New QR labels encode `https://my.slush.app/browse/` followed by `encodeURIComponent(appUrl)` to open the umbrella in Slush. The entire destination, including `?umbrella=<id>`, stays inside the single browse route parameter rather than becoming Slush's own query string. See [Slush deep linking](https://sdk.mystenlabs.com/slush-wallet/deep-linking). When scanned inside Kirisame, the same label supplies only the object ID for a local API lookup; the scanner never navigates to or fetches the scanned URL.

Labels can also contain a full `0x` + 64 hexadecimal-character object ID, a `https://suiscan.xyz/testnet/object/<id>` link, or an HTTP(S) app URL with `?umbrella=<id>`. Existing labels work across app hosts, and Slush wrappers accept both literal and URL-encoded app URLs. Arbitrary product numbers have no mapping to Sui objects. A manual ID entry and **Scan again** are available for retries or unsupported cameras. Camera access requires HTTPS (or localhost) and browser permission.

`GET /api/umbrellas/:id` checks the object's full package/module/type before decoding its BCS contents. The modal displays color, state, purchase price, condition bond, hourly usage fee, current station/holder, supplier, checkout count, condition-fund status, and an explorer link. The lookup uses the current published package by default, or `KIRISAME_ORIGINAL_PACKAGE_ID` / `KIRISAME_PACKAGE_ID` overrides. Keep the BCS layout in `src/umbrella-routes.ts` synchronized with contract upgrades.

Tests cover object validation, lookup failures, precise amounts, duplicate scans, camera denial, and cleanup when closing during camera permission or lookup. Physical label scanning in the target phone/Slush browser still needs device testing.

An umbrella from a different package deployment cannot be docked into the configured deployment's stations. Extracting its ID correctly does not change its Move type. Use an umbrella created by the configured deployment, or use its original deployment with a matching station and capability.

## Admin inventory

The Admin tab contains separate keyboard-accessible, scrollable station and umbrella
card lists. Each list loads 50 objects at a time, with Refresh and Load more controls.
Cards include object links, lifecycle status, station inventory/location, and umbrella
custody, checkout count, and escrow/condition balances. No wallet is needed to read
inventory. Confirmed admin, station, and supply transactions trigger a refresh.

`GET /api/inventory/stations` and `GET /api/inventory/umbrellas` retain the same
`cursor` parameter and `{ items, nextCursor }` response. The frontend is unchanged.
The server now maintains a rebuildable SQLite inventory read model:

- Bootstrap both object types at the same GraphQL checkpoint, including every page.
- Discover published package versions and subscribe to each `::umbrella` transaction
  feed over POST/SSE at `/graphql/subscriptions`. No contract events are required.
- Decode exact transaction output BCS with the existing serializers. Apply all relevant
  object-change pages and the package's resume cursor in one SQLite transaction.
- Use object versions and deletion tombstones to tolerate duplicate delivery and
  out-of-order arrivals across package streams without reverting newer state.
- Resume recent databases from saved cursors, and rebuild from a fresh snapshot after
  extended downtime, deployment changes, or repeated failures. Refresh the snapshot
  and package list every 20 minutes to keep recovery within recent data retention.

While startup or reconnect catch-up is in progress, new inventory requests use the
original GraphQL query. Existing upstream pagination cursors continue using GraphQL;
local pagination cursors stay local and return the existing 502 error if sync is not
ready. Local cursors use object-ID ordering; pages reflect current indexed state,
so a multi-page browse is not a frozen snapshot. Purchases, scans, capability checks,
and transaction preparation continue reading Sui directly. The database is eventually
consistent with Sui; only each local database update is atomic.

Configuration:

| Variable | Default / purpose |
| --- | --- |
| `KIRISAME_INVENTORY_DB` | `data/inventory.sqlite` relative to the server working directory |
| `KIRISAME_INVENTORY_SYNC` | Set to `false` to use only the original GraphQL inventory path |
| `KIRISAME_GRAPHQL_URL` | `https://graphql.testnet.sui.io/graphql` |
| `KIRISAME_GRAPHQL_SUBSCRIPTIONS_URL` | GraphQL URL with `/subscriptions` appended; override for providers with a different route |

The existing free Render service has ephemeral storage and can sleep. Its SQLite file
is a disposable cache: loss of the file causes a fresh chain snapshot, with GraphQL
serving inventory during recovery. For durable storage, point the database path at a
persistent disk on a compatible hosting plan. Run one server process per database file;
separate replicas should use separate caches. This implementation is an inventory read
model, not a durable audit log or a worker for irreversible side effects.

The shared deployment settings in `src/deployment.ts` apply to inventory, scans, and
transaction construction. Package versions are rediscovered on reconnect and during
periodic rebuilds; restart after an upgrade to pick up new versions immediately.
Keep the Station and Umbrella BCS layouts in sync with Move. Readiness and retries are
logged; `/health` keeps its existing liveness response. Unit tests cover rollback,
replay, restart persistence, pagination, SSE framing, and the unchanged API responses.

### Docking by QR code

In **Station → Dock umbrella**, connect a wallet holding a StationCap for an active
station, then scan the umbrella label. The confirmation form fills the umbrella
and station IDs automatically; wallets owning multiple active stations can choose
the receiving station. The capability and expected owner count need no manual input.
The server verifies station ownership and reads the latest owner count when preparing
the transaction. Move still enforces ownership, inspection timing, and buyback rules.
Camera denial supports manual umbrella ID entry. Physical camera scanning still
requires testing on the target device.


## Umbrella names and deployment

Umbrellas now store a supplier-provided `name: String` immediately after `supplier`
in the on-chain object. `user_create_umbrella` takes `(bond, color, name, ctx)`;
names must contain 1–256 UTF-8 bytes. Cards display `Name (Color)`.

This layout and function signature use the **fresh testnet publication** recorded
in `Published.toml`. The checked-in client defaults point to that publication.
For a different deployment, set `KIRISAME_PACKAGE_ID` and, for an upgraded package,
`KIRISAME_ORIGINAL_PACKAGE_ID` to its original publication. Otherwise the original
ID defaults to the call target. Inventory rebuilds automatically when the deployment
changes. Existing objects remain in their original deployment and are not migrated.

Blank supplier names are assigned `Supplier Umbrella #1`, advancing until the
name is unused in the database. SQLite records names from every indexed umbrella,
including retired ones, and retains them through deletion and inventory rebuilds.
Name allocation is transactional; prepared transactions reserve their names so
concurrent creations do not get the same default. Cancelled transactions can leave
gaps. Custom names may repeat. The suggested placeholder is advisory; the final
name is selected when preparing the signed creation transaction.

Default naming requires inventory sync to be ready; an explicit custom name still
works with sync disabled. Keep `KIRISAME_INVENTORY_DB` on persistent storage and
share the same database among processes that allocate names. Separate databases
cannot coordinate reservations. The contract stores the selected name but does not
enforce global uniqueness for transactions submitted outside this app.

## Fresh contract layout cleanup

The fresh publication also removes the unused `fee_per_ms`, `checkout_station_id`,
and `checkout_time_ms` fields from Umbrella. The inspection deadline remains the
source for timing. Condition history and per-umbrella financial terms remain stored.
Station now stores `authorized_cap` directly, replacing the legacy dynamic-field
fallback. Station discovery excludes revoked capabilities using this field.
The client BCS schemas match these new layouts and do not decode the old deployment.
Use the fresh-publication configuration described above before running this client.
