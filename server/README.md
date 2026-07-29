# The state service

A ~350-line, **zero-dependency** Node service that holds a copy of the app's state
document in SQLite. It is the durability half of the persistence design: browser
storage keeps the app fast and offline, this keeps the history alive when the phone is
lost or the browser evicts its storage, and it gives phone↔desktop sync as a side
effect.

Deliberately not a backend in the usual sense. No users table, no login, no sessions,
no ORM, no SQL migrations — one table holding whole-document JSON snapshots, three
routes, and a shared secret.

## Requirements

Node **≥ 22** (this uses the built-in `node:sqlite`, which is why there is nothing to
install). Node prints

```
ExperimentalWarning: SQLite is an experimental feature and might change at any time
```

on startup. **That warning is expected and is not a reason to add a dependency.**
Avoiding a native `better-sqlite3` build — nothing to compile, nothing to pin, nothing
to rebuild after a Node upgrade — is worth one line of stderr.

## Running it

```sh
# Generate a secret once and keep it somewhere safe (a password manager).
node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'

SPORTS_APP_SYNC_SECRET=<that value> npm run server
```

The service refuses to start without a secret. There is no default and no fallback: a
service with a built-in secret looks authenticated and is not.

In development, `npm run dev` proxies `/api` to `http://127.0.0.1:8787`, so the app and
the service share an origin and there is no CORS to configure. Leave **Service
address** empty in Settings and it will use the proxy. If you change
`SPORTS_APP_PORT`, change the proxy target in `vite.config.ts` to match.

## Environment variables

| Variable                     | Default            | Notes                                                              |
| ---------------------------- | ------------------ | ------------------------------------------------------------------ |
| `SPORTS_APP_SYNC_SECRET`     | *(none)*           | **Required.** Compared with `crypto.timingSafeEqual`. Never commit it. |
| `SPORTS_APP_HOST`            | `127.0.0.1`        | Loopback by default so running it cannot expose your history.       |
| `SPORTS_APP_PORT`            | `8787`             |                                                                    |
| `SPORTS_APP_DB`              | `<repo>/db/app.db` | Created on startup, with its parent directory.                      |
| `SPORTS_APP_MAX_BODY_BYTES`  | `4194304` (4 MiB)  | Request body cap.                                                   |
| `SPORTS_APP_QUIET`           | unset              | `1` silences the request log.                                       |

The secret appears in **no committed file**. It is passed in the environment, and the
app stores its own copy in browser storage inside the state document.

## Routes

| Route             | Auth | Behaviour                                                            |
| ----------------- | ---- | -------------------------------------------------------------------- |
| `GET /api/health` | no   | `{"status":"ok"}`. Liveness only — no database read, no information.  |
| `GET /api/state`  | yes  | The newest snapshot's bytes, or `404` when nothing has been stored.   |
| `PUT /api/state`  | yes  | Validate shallowly, store the body verbatim, prune to the cap.        |

Anything else is a `404`. No static files, no directory listing, no fallback handler.

The secret goes in the **`x-sync-secret`** header — never in the URL, which would end
up in proxy logs and browser history.

`PUT` requires `Content-Type: application/json` and a body that is a JSON object with a
numeric `schemaVersion` and a non-negative integer `sessionsCompleted`. That is the
whole of the server's validation, on purpose: `src/persistence/codec.ts` is the single
source of truth for the document's shape, and a second, drifting validator here would
eventually reject a document the app considers good — turning the safety net into a way
to lose a workout. A rejected `PUT` returns `400` and leaves the database untouched.

## The database

One table, in `db/app.db`. `db/` is **gitignored** — it holds real training history.

```sql
CREATE TABLE snapshots (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at         TEXT    NOT NULL,   -- ISO, server clock
  sessions_completed INTEGER NOT NULL,
  schema_version     INTEGER NOT NULL,
  doc_json           TEXT    NOT NULL    -- the request body, verbatim
);
```

`journal_mode = WAL`, `synchronous = FULL`. This writes about once per workout, so
durability beats throughput by orders of magnitude: the cost is one fsync a day and the
thing being protected is the only remaining copy of months of training.

The newest row by `id` is the current state. `id` rather than `created_at`, because
`created_at` comes from the server clock and can go backwards across an NTP correction
— "newest" has to be a fact about insertion order.

Read the current document with no tooling beyond `sqlite3`:

```sh
sqlite3 db/app.db 'SELECT doc_json FROM snapshots ORDER BY id DESC LIMIT 1'
```

### Whole-document snapshots, not normalised tables

A locked decision (`corpus/wiki/decisions.md`). The codec already owns validation and
the canonical shape, and `schemaVersion` lives *inside* the JSON, so a
`sessions`/`sets`/`ladders` schema here would be a second source of truth for shape and
would duplicate every rule the codec enforces — including the ones it deliberately does
*not* enforce, which a foreign key would silently start enforcing. Snapshot rows also
give free version history and keep the document extractable with one query.

The trade-off, stated: no SQL queryability over individual sessions. That costs nothing
— the charts screen reads the in-memory document. If it ever matters, derive tables
*from* the snapshots rather than replacing them.

### Retention is ~20 snapshots, and that is a limit rather than a knob

Every snapshot embeds the **entire** history, so snapshot size grows linearly with
sessions completed and total database size grows **quadratically** with
retention × sessions. At three years of daily training one snapshot is roughly a
megabyte: 20 snapshots is ~20 MB, and 1000 would be multiple gigabytes for one
person's push-up log. Twenty is deep enough to undo a bad import or a hand-edit gone
wrong and shallow enough that the quadratic term never becomes the story. Raising it is
a capacity decision, not a configuration tweak — there is a test asserting the value so
that changing it is deliberate.

## Sync behaviour on the client

`src/persistence/sync.ts`. Two things about it are load-bearing:

- **`push` is fire-and-forget and cannot fail a workout.** It runs *after* the local
  save has already succeeded, never throws or rejects, and logs failures rather than
  surfacing them. One push per completed session is the entire cadence — no polling, no
  timers, no retry queue, no background sync. It is also skipped while the store is
  read-only, so a document the app could not parse is never uploaded over the last good
  snapshot.
- **`saveAndPush(doc)` is the session-path call site.** It writes locally first,
  synchronously, and pushes only if that save succeeded — a document the store refused
  is a document that did not verify — and it does not await the upload. Callers get the
  `SaveResult` unchanged: the outcome of finishing a workout is the outcome of the local
  save, and whether the upload worked is not part of it.
- **A remote-ahead conflict prompts; it never resolves itself.** Comparison is on
  `sessionsCompleted`, which is monotonic. Local ahead or equal → last-write-wins is
  correct, since there is one user and the remote holds a prefix. Remote ahead → both
  counts are shown in Settings and **nothing is written in either direction** until the
  user picks. `navigator.onLine` is never consulted: brief 01 observed it reporting
  `true` while the network was demonstrably offline.

### The secret ends up in exported files

`settings.sync` lives inside the state document, so **an exported JSON file contains the
shared secret** once sync is configured. The Settings screen says so next to the sync
fields. Treat an export as a credential, and rotate the secret (restart the service with
a new `SPORTS_APP_SYNC_SECRET`, then update it in Settings) if an export leaks.

## Tests

```sh
npx vitest run server
```

They run against a **real temporary SQLite file**, not a mock, over a real HTTP socket:
`GET` before any `PUT` returns 404, a wrong or missing secret returns 401, `PUT` then
`GET` round-trips byte-identically, a malformed body is rejected with the newest row
unchanged, and retention prunes to the cap while always keeping the newest.
