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
