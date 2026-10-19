# Getting started

The full local setup. The [main README](../README.md) has the short version.

## Prerequisites

- Node 22.18 or later (`engines` in `package.json`). npm warns that jsdom, which only the tests use, wants 22.22.2+ or 24.15+; the tests still pass on 24.14.1.
- Optionally, the estate's Ward running locally on <http://localhost:8792>, for the "Sign in with Ward" button. It is started from `infrastructure/local` in the `wzd_auth` repo. Without it, sign in with a local account (`npm run seed`, below); the Ward button then says Ward is unreachable.

## 1. Install

```bash
npm install
```

One install covers all four workspaces: `client`, `server`, `shared` and `docs`.

## 2. Configure

```bash
cp .env.example .env
```

`npm run dev` and `npm run server` both read the repo-root `.env`. A variable already set in the shell wins over the file. `.env` is gitignored.

| Variable | Used by | Purpose | Where the value comes from |
|---|---|---|---|
| `WARD_OIDC_ISSUER`, `WARD_OIDC_CLIENT_ID`, `WARD_OIDC_CLIENT_KEY`, `WARD_OIDC_REDIRECT_URI`, `WARD_OIDC_POST_LOGOUT_REDIRECT_URI` | state service | "Sign in with Ward", optional. The client key is a secret | Ward's local `seed.mjs` registers the app and writes all five into `.env`. Leave them out and the app has local accounts only |
| `SPORTS_APP_API_PREFIX` | state service, build | What the browser puts in front of `/api`: empty here, `/sports-app-api` in the deploy | Leave empty locally |
| `SPORTS_APP_BASE` | dev server, build | The sub-path the app is served from | `/sports-app/`, the same path as the deploy |

Create an account to sign in with: `npm run seed` asks for a username and a password. The state service has more variables (port, host, database file, body limit). They are listed in [server/README.md](../server/README.md#environment-variables).

## 3. Run

```bash
npm run dev
```

Vite prints `Local: http://localhost:5173/sports-app/`. The dev server proxies `/api` to the state service on `127.0.0.1:8787`, so the app and the service share one origin as they do in the deploy. "Sign in with Ward" sends the browser to Ward's own origin and back to `/api/auth/ward/callback`.

Start the state service too, in a second terminal. Signing in needs it, because the accounts live there:

```bash
npm run server
```

It prints `[state] listening on http://127.0.0.1:8787` and the database path, after Node's `ExperimentalWarning` about SQLite, which is expected. `GET /api/health` answers `{"status":"ok"}`; `/api/state` answers `401` without a session.

Open the app and sign in with the account `npm run seed` made. A fresh browser goes to `/login`, signs in once, and lands on today's session. After that the browser remembers who you are, so the app opens with the service stopped or the network off. Only sync needs the service.

The database defaults to `db/app.db` (gitignored). To try things against a throwaway one:

```bash
SPORTS_APP_DB=/tmp/sports-app-scratch.db npm run server
```

If you move the service off port 8787 with `SPORTS_APP_PORT`, change the `/api` proxy target in `client/vite.config.ts` to match. Routes, the database and sync behaviour: [server/README.md](../server/README.md).

## 4. Test, lint, typecheck, build

```bash
npm test             # vitest, client and server together (1202 tests on 2026-10-19)
npm run typecheck
npm run lint         # eslint, including the rules that keep client/src/domain pure
npm run check        # all three
npm run build        # the PWA into client/dist
```

`npm run build` uses base `/` unless `SPORTS_APP_BASE` is set in the shell. The deploy sets `SPORTS_APP_BASE=/sports-app/`. Deploys run from the separate vps-deploy repo, not from here.

The docs site is its own workspace in `docs/`; its scripts are in `docs/package.json`.

## Common problems

### Port 8787 is taken

Another project may hold it. Run the service with `SPORTS_APP_PORT=<port>` and change the proxy target in `client/vite.config.ts` to the same port.
