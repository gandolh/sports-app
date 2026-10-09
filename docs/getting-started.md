# Getting started

The full local setup. The [main README](../README.md) has the short version.

## Prerequisites

- Node 22.18 or later (`engines` in `package.json`). npm warns that jsdom, which only the tests use, wants 22.22.2+ or 24.15+; the tests still pass on 24.14.1.
- For signing in and for sync, the estate's Ward running locally on <http://localhost:8792>. It is started from `infrastructure/local` in the `wzd_auth` repo. Without it the app still serves, but `/login` has nowhere to send you.

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
| `WARD_PUBLIC_ORIGIN` | dev server, state service | Ward's origin; the dev server proxies `/ward` and `/ward-api` to it | `http://localhost:8792` for the local Ward |
| `WARD_API_BASE_PATH` | state service | Where Ward's API lives under that origin | `/ward-api` |
| `WARD_APP_KEY` | state service | The service's own key for asking Ward about a session. A secret | Ward's local `seed.mjs` writes it into `.env`; for another Ward, its console's "Service keys" page |
| `SPORTS_APP_BASE` | dev server, build | The sub-path the app is served from | `/sports-app/`, the same path as the deploy |

The state service has more variables (port, host, database file, body limit). They are listed in [server/README.md](../server/README.md#environment-variables).

## 3. Run

```bash
npm run dev
```

Vite prints `Local: http://localhost:5173/sports-app/`. Open it. The dev server proxies `/api` to the state service on `127.0.0.1:8787` and `/ward`, `/ward-api` to `WARD_PUBLIC_ORIGIN`, so the app, the service and sign-in share one origin as they do in the deploy.

The state service is optional for using the app. Start it when you want sync:

```bash
npm run server
```

It prints `[state] listening on http://127.0.0.1:8787` and the database path, after Node's `ExperimentalWarning` about SQLite, which is expected. `GET /api/health` answers `{"status":"ok"}`; `/api/state` answers `401` without a Ward session. The database defaults to `db/app.db` (gitignored). To try things against a throwaway one:

```bash
SPORTS_APP_DB=/tmp/sports-app-scratch.db npm run server
```

If you move the service off port 8787 with `SPORTS_APP_PORT`, change the `/api` proxy target in `client/vite.config.ts` to match. Routes, the database and sync behaviour: [server/README.md](../server/README.md).

## 4. Test, lint, typecheck, build

```bash
npm test             # vitest, client and server together (1144 tests on 2026-10-09)
npm run typecheck
npm run lint         # eslint, including the rules that keep client/src/domain pure
npm run check        # all three
npm run build        # the PWA into client/dist
```

`npm run build` uses base `/` unless `SPORTS_APP_BASE` is set in the shell. The deploy sets `SPORTS_APP_BASE=/sports-app/`. Deploys run from the separate vps-deploy repo, not from here.

The docs site is its own workspace in `docs/`; its scripts are in `docs/package.json`.

## Common problems

### Signing in loops

As of 2026-10-09, `/login` sends you to Ward, Ward sends you back, and the app sends you to `/login` again. Every screen needs a username in `localStorage`, and nothing in the app writes it after Ward's sign-in, because `setCurrentUsername` in `client/src/persistence/session.ts` has no caller. The deployed build has the same gap. It reads and clears that key but never writes it.

Until that is fixed, set a username by hand to use the app locally. Open any file the dev server serves without a redirect, such as <http://localhost:5173/sports-app/icons/icon-192.png>, and run this in the browser console:

```js
localStorage.setItem('sports-app.session.v3', 'demo')
```

Then open <http://localhost:5173/sports-app/>. The name must be 1 to 32 characters: a lowercase letter or digit, then lowercase letters, digits, `.`, `-` or `_`. Training, the plan, progress and the account screen all work. Don't expect sync to. The service needs a Ward session, and it refuses a document whose username is not that session's subject.

### Port 8787 is taken

Another project may hold it. Run the service with `SPORTS_APP_PORT=<port>` and change the proxy target in `client/vite.config.ts` to the same port.
