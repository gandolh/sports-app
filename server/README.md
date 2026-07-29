# The state service

A **zero-dependency** Node service that holds a copy of each user's state document in
SQLite. It is the durability half of the persistence design: browser storage keeps the
app fast and offline, this keeps the history alive when the phone is lost or the browser
evicts its storage, and it gives phone↔desktop sync as a side effect.

Deliberately not a backend in the usual sense. No users table, no sessions, no ORM, no
migration runner — one table holding whole-document JSON snapshots keyed by username,
four routes, and a shared secret.

## Login checks nothing, and says so

`POST /api/login` takes `{ username, password }`, **never reads the password**, and
answers `{ username }`. Not hashed-and-compared, not stored for later, not logged. There
is deliberately no expression in `server/state-server.mjs` that evaluates `.password` —
there is a test asserting that about the source — because storing an unchecked password
buys nothing and collects real passwords that people reuse elsewhere.

**This is not a security boundary and does not pretend to be one.** Anyone who knows a
username can read that person's training history. That is accepted for training data on a
personal deployment. There is no token, no session cookie, and no rate limiting — each
one would manufacture a feeling of security the design does not provide, and a user who
believed it would make worse decisions than one who knows the truth. The login screen
says so in as many words.

The shared secret is a different thing: it protects the **deployment** — whether this
process will talk to you at all — not the accounts inside it.

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

| Route                       | Auth | Behaviour                                                                 |
| --------------------------- | ---- | ------------------------------------------------------------------------- |
| `GET /api/health`           | no   | `{"status":"ok"}`. Liveness only — no database read, no information.       |
| `POST /api/login`           | yes  | `{ username, password }` → `{ username }`. The password is never read.     |
| `GET /api/state?user=NAME`  | yes  | That user's newest snapshot bytes, or `404` when they have none.           |
| `PUT /api/state?user=NAME`  | yes  | Validate shallowly, store the body verbatim, prune that user to the cap.   |

Anything else is a `404`. No static files, no directory listing, no fallback handler.

The secret goes in the **`x-sync-secret`** header — never in the URL, which would end
up in proxy logs and browser history. The **username** does go in the URL, because it is
a nameplate rather than a secret.

**Usernames** are 1–32 characters: a lowercase letter or digit, then lowercase letters,
digits, `.`, `-`, `_`. Anything else is a `400` that states the rule without echoing the
value. Uppercase is *rejected*, not folded to lowercase: the username also lives inside
the document, which is hand-editable, so silently rewriting it on the way in would make
the stream key disagree with the document's own `username` — which is exactly the
mismatch `PUT` refuses.

`PUT` requires `Content-Type: application/json` and a body that is a JSON object with a
numeric `schemaVersion`, a valid `username`, and an array `history` — and the document's
`username` must equal `?user=`. Everything else about the shape is the codec's business:
`src/persistence/codec.ts` is the single source of truth, and a second, drifting
validator here would eventually reject a document the app considers good, turning the
safety net into a way to lose a workout. A rejected `PUT` returns `400` and leaves the
database untouched.

Comparing `?user=` against the document's own `username` is the one check that needs
both. Without an independently stated target there is nothing to compare, and a client
bug that sent the wrong document would silently overwrite someone else's stream.

`PUT` answers `200` with `{ id, createdAt, username, historyLength, schemaVersion,
bytes, pruned, retained }`. `retained` is *that user's* row count, not the table's — a
count of every row would tell each user how much the others train.

## The database

One table, in `db/app.db`. `db/` is **gitignored** — it holds real training history.

```sql
CREATE TABLE snapshots (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at         TEXT    NOT NULL,   -- ISO, server clock
  sessions_completed INTEGER NOT NULL,   -- history.length of the stored document
  schema_version     INTEGER NOT NULL,
  doc_json           TEXT    NOT NULL,   -- the request body, verbatim
  username           TEXT    NOT NULL DEFAULT 'local'
);
CREATE INDEX snapshots_by_user_id ON snapshots (username, id DESC);
```

`journal_mode = WAL`, `synchronous = FULL`. This writes about once per workout, so
durability beats throughput by orders of magnitude: the cost is one fsync a day and the
thing being protected is the only remaining copy of months of training.

`sessions_completed` keeps its name and now holds `history.length`. The v3 document
dropped the `sessionsCompleted` field the column used to be populated from; the length of
the history *is* the number of sessions completed, so the column still means what it
says, and renaming it would rewrite a table full of real training history to buy nothing.

The newest row by `id` **within a username** is that user's current state. `id` rather
than `created_at`, because `created_at` comes from the server clock and can go backwards
across an NTP correction — "newest" has to be a fact about insertion order, and a
snapshot pruned because a clock jumped is not recoverable.

Read a document with no tooling beyond `sqlite3`:

```sh
sqlite3 db/app.db "SELECT doc_json FROM snapshots WHERE username = 'alice' ORDER BY id DESC LIMIT 1"
sqlite3 db/app.db 'SELECT DISTINCT username FROM snapshots'
```

### Upgrading a database that predates usernames

Handled on startup, in place, once. `PRAGMA table_info` is asked whether `username` is
already there and `ALTER TABLE snapshots ADD COLUMN username TEXT NOT NULL DEFAULT
'local'` runs only when it is not — so every start converges on the same schema with no
migration bookkeeping to keep honest, and a database migrated from the old shape has the
identical schema to a fresh one (which is why `username` is declared last: `ALTER TABLE`
can only append).

Pre-existing rows are attributed to **`local`**, because the old table held one stream
and recorded nothing about whose it was — there is no owner to recover, only one to
choose. The migrated history is reachable straight away at `GET /api/state?user=local`,
and the service says so once at startup. To claim it under a real name:

```sh
sqlite3 db/app.db "UPDATE snapshots SET username = 'alice' WHERE username = 'local'"
```

That leaves the *documents* saying `"schemaVersion": 2` with no `username` field inside
them, which is fine to read — the service stores and returns bytes and does not interpret
them — but a `PUT` from a v3 client will store a v3 document alongside them.

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

### Retention is ~20 snapshots per user, and that is a limit rather than a knob

Every snapshot embeds the **entire** history, so snapshot size grows linearly with
sessions completed and total database size grows **quadratically** with
retention × sessions — and linearly again with the number of users. At three years of
daily training one snapshot is roughly a megabyte: 20 snapshots is ~20 MB per person, and
1000 would be multiple gigabytes for one person's push-up log. Twenty is deep enough to
undo a bad import or a hand-edit gone wrong and shallow enough that the quadratic term
never becomes the story. Raising it is a capacity decision, not a configuration tweak —
there is a test asserting the value so that changing it is deliberate.

The cap is **per username**, and the prune is scoped with `WHERE username = ?` on both the
`DELETE` and its "which ids do I keep" subquery. That is what stops somebody who trains
daily from evicting the history of somebody who trains monthly; a global cap would do
exactly that, silently, and the evicted rows would be gone for good. There are tests for
it at both the store and the HTTP layer.

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
- **A remote-ahead conflict prompts; it never resolves itself.** Comparison is on the
  number of completed sessions — `history.length` from v3 on, which is what the service's
  `sessions_completed` column and the `historyLength` field of a `PUT` receipt both hold.
  Local ahead or equal → last-write-wins is
  correct, since a stream belongs to one person training on one device at a time and the
  remote holds a prefix. Remote ahead → both
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

Two files, both against a **real temporary SQLite file** rather than a mock:

- `__tests__/state-server.test.mjs` drives the service over a real HTTP socket. `GET`
  before any `PUT` returns 404, a wrong or missing secret returns 401, `PUT` then `GET`
  round-trips byte-identically, a malformed body is rejected with the newest row
  unchanged, one user cannot read or overwrite another, a username outside the allowlist
  is a 400, `/api/health` is served from a store that throws on every method, and **a
  distinctive password sent to `/api/login` is searched for in the database files on disk
  and in every captured log line.**
- `__tests__/db.test.mjs` covers what HTTP cannot reach: a database built with the *old*
  single-stream DDL is migrated and its rows stay readable, re-opening it migrates nothing
  and leaves the same schema as a fresh database, a busy user cannot evict a quiet one,
  and pruning keeps the right rows even when `created_at` goes **backwards** mid-stream.

Nothing in either file imports from `src/`. The service is version-agnostic — it copies
`schemaVersion` into a column and never interprets it — so the fixtures are hand-written
v3 bodies. Building them from the codec would couple a zero-dependency `.mjs` service to
the bundle's TypeScript and would break these tests on a client schema bump that cannot
affect the server.
