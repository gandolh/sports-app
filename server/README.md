# The state service

A **Fastify** service that holds a copy of each user's state document in SQLite. Its
dependencies are `fastify`, and `@sports-app/shared` for the wire contract — the username
rule, the document types, and the TypeBox schemas the routes validate against.

Brief 22 replaced hand-rolled `node:http` routing with Fastify and **changed nothing on
the wire**: same paths, methods, status codes, headers and bodies, so the client needed no
edit. The 73 pre-existing tests in `__tests__/` are what makes that checkable rather than
hopeful — they were written against the wire, not the implementation.

It is the durability half of the persistence design: browser storage keeps the app fast
and offline, this keeps the history alive when the phone is lost or the browser evicts
its storage, and it gives phone↔desktop sync as a side effect.

Deliberately not a backend in the usual sense. No ORM, no migration runner of its own —
one table holding whole-document JSON snapshots keyed by the signed-in account's username,
the sign-in routes of the vendored auth library, and two routes of its own. Accounts live
in `auth_*` tables of the same SQLite file, owned by the library (`vendor/ward/`).

It is the `server` workspace of a three-workspace repo (`client` · `server` ·
`shared`). It did not move when the workspaces were introduced, so `db/` is still a
sibling directory at the repo root and still gitignored. Run it with `npm run server`
from the root, or `npm start` from here.

## Who the caller is: an account on this service

The app owns its accounts. `wardAuth`, the vendored library's Fastify plugin, is registered
first and guards **every** route except `GET /api/health` and its own sign-in routes. A
request needs a live session in the `sports_app_session` cookie, which the library sets
after a password sign-in or after "Sign in with Ward". Local sign-in never calls Ward, so
the service keeps working while Ward is down.

The signed-in user's **username is the stream key**. Nothing on the request says whose
document is wanted, and a `?user=` is ignored, so a caller reads and writes only their own
history. A person who signs in with Ward and was suffixed because their Ward name was taken
(`alice-2`) gets that stream: it follows the local account, never the Ward name.

| Situation                                              | Answer                                      |
| ------------------------------------------------------ | ------------------------------------------- |
| No session, or an expired one                          | `401 {"error":"unauthorized"}`              |
| A Ward-originated session while Ward cannot answer     | `401`, `reason: "ward_unavailable"`         |
| A Ward session Ward has ended (sign-out, revoke)       | `401`, `reason: "ward_session_ended"`       |
| A username the document schema cannot hold             | `401`, `reason: "unsupported_username"`     |
| A browser `POST` from another origin                   | `403 {"error":"cross_site"}`                |

A Ward-originated session is checked against Ward at most every 30 seconds, so a revoke at
Ward ends it within 30 seconds; a local session is never checked. The session is checked
before anything else, so a caller without one gets a `401` and never a `400` that would
describe the document — and the same `401` for a path that does not exist.

`ward.mjs` is the configuration and the app's own rules; the library does the rest. Its
README is the contract: `../shared-library/README.md` in Ward's repo, vendored at
`vendor/ward/README.md` with the version.

**Creating accounts.** There is no register route. `npm run seed` creates one (it asks for
a username and a password, or reads `SPORTS_APP_SEED_USERNAME` and
`SPORTS_APP_SEED_PASSWORD`; never put them in a file). It never resets an existing
account's password or role, so it is safe to run on every deploy. A first Ward sign-in also
creates an account, if Ward holds a grant for that person. A person who already has an
account links Ward from `/account`; nothing is ever matched by username.

**Existing history.** Snapshots are keyed by username. A stream keyed by a Ward subject (32
hex, which is what the key was before accounts) gets a linked account of the same name at
startup, so that person's next Ward sign-in finds it; their displayed name stays the hex
string until renamed by hand. A stream keyed by a name is read again as soon as an account
with that exact username exists (`npm run seed`). At startup the service names any such
stream that has no account yet.

## Requirements

Node **≥ 22.18**. Not 22: the service imports `@sports-app/shared/*.ts` directly and relies
on Node's unflagged type stripping to load it, so there is no build step for the service —
but the version that does the stripping is the floor.

**There is now an install step.** Until brief 22 the service used only Node builtins plus a
types-and-one-regex package, so deploying it was `rsync` and `pm2 restart`. Fastify has a
dependency tree, so a server needs `npm ci --omit=dev` (or a shipped `node_modules`) before
`node state-server.mjs` will start. That is the cost the Fastify decision was taken knowing
about — see `corpus/wiki/technical-decisions.md § "The API is Fastify"` — and it is the one
thing about this service a deploy has to learn.

Storage is unaffected: `node:sqlite` is built in, so there is still no native
`better-sqlite3` build — nothing to compile, nothing to rebuild after a Node upgrade. Node
prints

```
ExperimentalWarning: SQLite is an experimental feature and might change at any time
```

on startup. **That warning is expected and is not a reason to add a dependency.**

## Running it

```sh
cp .env.example .env   # at the repo root, once
npm run server
```

`npm run server` loads the repo-root `.env` (Node's `--env-file-if-exists`). Anything set
in the shell wins over the file. Locally the `WARD_OIDC_*` values point at Ward's
container in `../wzd_auth/infrastructure/local`, whose `seed.mjs` registers sports-app as
an OpenID Connect client and writes them into `.env`. Without `WARD_OIDC_ISSUER` the service
runs with local accounts only, and the sign-in page has no Ward button.

**Two prefixes, and why.** Fastify sees `/api/...` everywhere. What the *browser* puts in
front of it differs: nothing in development (the dev server proxies `/api`), and
`SPORTS_APP_API_PREFIX` in the deploy, where a reverse proxy strips it. The session
cookie's `Path` is `<prefix>/api` and Ward's redirect URI is
`<prefix>/api/auth/ward/callback`; **both come from configuration and change together**, per
environment. The library refuses to start if the redirect URI's path does not sit under the
cookie's path, so a mismatch is a failed boot, not a silent sign-in that does nothing. The
client build reads the same variable (`vite.config.ts`).

In development, `npm run dev` serves the app at `http://localhost:5173/sports-app/` and
proxies `/api` to `http://127.0.0.1:8787`, so the app and the service share an origin, there
is no CORS to configure, and Ward's callback needs no proxy rule of its own. There is no
`/ward` proxy: the browser goes to Ward's own origin. Leave **Service address** empty in
Settings and it will use the proxy. If you change `SPORTS_APP_PORT`, change the proxy target
in `vite.config.ts` to match.

## Environment variables

| Variable                              | Default            | Notes                                                                 |
| ------------------------------------- | ------------------ | --------------------------------------------------------------------- |
| `SPORTS_APP_PUBLIC_ORIGIN`            | from the redirect URI | The browser's address for the app, no path. Required unless `WARD_OIDC_REDIRECT_URI` is set. Decides `Secure` cookies and the cross-site check. |
| `SPORTS_APP_API_PREFIX`               | *(empty)*          | What the browser puts in front of `/api`: empty in development, `/sports-app-api` in the deploy. Also read by the client build. |
| `SPORTS_APP_BASE`                     | `/sports-app/`     | Where the client is served from; the sign-in and settings pages the callback lands on. |
| `WARD_OIDC_ISSUER`                    | *(unset)*          | Ward's issuer, ending in `/oidc`. Unset means local accounts only.    |
| `WARD_OIDC_CLIENT_ID`                 | *(none)*           | Required when the issuer is set. The app's slug at Ward.              |
| `WARD_OIDC_CLIENT_KEY`                | *(none)*           | Required when the issuer is set. The app's private key. **A secret.** |
| `WARD_OIDC_REDIRECT_URI`              | *(none)*           | Required when the issuer is set. `<prefix>/api/auth/ward/callback` as the browser reaches it. |
| `WARD_OIDC_POST_LOGOUT_REDIRECT_URI`  | *(unset)*          | Where Ward returns after "log out of Ward too".                       |
| `SPORTS_APP_HOST`                     | `127.0.0.1`        | Loopback by default so running it cannot expose your history.         |
| `SPORTS_APP_PORT`                     | `8787`             |                                                                       |
| `SPORTS_APP_DB`                       | `<repo>/db/app.db` | Created on startup, with its parent directory.                        |
| `SPORTS_APP_MAX_BODY_BYTES`           | `4194304` (4 MiB)  | Request body cap.                                                     |
| `SPORTS_APP_QUIET`                    | unset              | `1` silences the request log.                                         |

The client key appears in **no committed file**. It never reaches the browser: it
authenticates the *service* to Ward, and is a different thing from the session cookie that
authenticates a *person* to the service. The old `WARD_PUBLIC_ORIGIN`, `WARD_API_BASE_PATH`
and `WARD_APP_KEY` are not read.

## Routes

| Route                  | Auth    | Behaviour                                                                 |
| ---------------------- | ------- | ------------------------------------------------------------------------- |
| `GET /api/health`      | no      | `{"status":"ok"}`. Liveness only — no database read, no information.       |
| `GET /api/state`       | session | The caller's newest snapshot bytes, or `404` when they have none.          |
| `PUT /api/state`       | session | Validate shallowly, store the body verbatim, prune the caller to the cap.  |
| `GET /api/auth/session`| public  | Who the cookie belongs to (`user: null` when nobody), and whether Ward is on. What the client asks to learn who it is. |
| `POST /api/auth/login`, `logout`, `password`, `ward/*` | mixed | The library's routes; see `vendor/ward/README.md`. There is no `register`. |

Anything else is a `404` for a signed-in caller (and a `401` for anyone else). No static files, no
directory listing, no fallback handler. An unsupported method on `/api/state` is a `405`
with an `Allow` header, but only for a caller with a session: without one it is the same
`401` as every other request to `/api/state`, so the `Allow` header goes only to someone
signed in.

**Usernames** are defined once, in `shared/username.ts`, and imported by this service
and by the client — there is no second copy here to drift from. They are 1–32
characters: a lowercase letter or digit, then lowercase letters,
digits, `.`, `-`, `_`. Anything else is a `400` that states the rule without echoing the
value. Uppercase is *rejected*, not folded to lowercase: the username also lives inside
the document, which is hand-editable, so silently rewriting it on the way in would make
the stream key disagree with the document's own `username` — which is exactly the
mismatch `PUT` refuses.

**Validation is schema-driven, from `shared/api.ts`.** The wire shapes are TypeBox
declarations in the shared workspace, so one declaration produces both the runtime guard
here and the TypeScript type the client can use. Fastify's AJV reads them for response
serialisation; the `PUT` body is checked here against the same declaration, because it has
to stay a raw string — a parsed-and-re-serialised document is not the document that was
sent.

`PUT` requires `Content-Type: application/json` and a body that is a JSON object with a
numeric `schemaVersion`, a valid `username`, and an array `history` — and the document's
`username` must equal the session's username. Everything else about the shape is the codec's business:
`client/src/persistence/codec.ts` is the single source of truth, and a second, drifting
validator here would eventually reject a document the app considers good, turning the
safety net into a way to lose a workout. A rejected `PUT` returns `400` and leaves the
database untouched.

A document whose `username` is not the caller's username is a `400` and stores nothing.
It used to compare two values the client supplied, `?user=` and the document's own name,
which caught a client bug but not a hostile caller. One side is now the session, so the
same check refuses a write into somebody else's stream. A document written before the
accounts, under a name that is not this account's, is the ordinary way to hit it.

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
choose. The service says so once at startup. The stream key is the caller's username, so to
read that history again, reattribute it to the username of the account it belongs to
(create the account first with `npm run seed`):

```sh
sqlite3 db/app.db "UPDATE snapshots SET username = '<username>' WHERE username = 'local'"
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

`client/src/persistence/sync.ts`. Two things about it are load-bearing:

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

### An old secret may still be in exported files

`settings.sync.secret` is a leftover. The service stopped accepting a shared secret when
identity moved to Ward, and the client stopped sending one — but the **field is still in
the document schema**, so a document configured before the cutover still carries whatever
was typed into it, and an export still contains that string. It authenticates nothing
now.

Removing the field is a schema version bump, deliberately not folded into the auth
change. Until then: an old export is worth treating as a credential only insofar as that
secret was reused somewhere else, and the Settings screen says the stored value is inert.

## Tests

```sh
npx vitest run server
```

Three test files, all against a **real temporary SQLite file** rather than a mock. Ward is
the one thing faked, and only in `auth.test.mjs`: a `fetch` handed to `createWardClient`
answers discovery and the 30-second session check. The other files sign in through real
sessions minted by the library (`__tests__/auth-fixture.mjs`), so the guard is never stubbed.

- `__tests__/state-server.test.mjs` drives the service over a real HTTP socket. `GET`
  before any `PUT` returns 404, a missing or unrecognised session returns 401 before
  anything is validated, each session gets its own stream and a
  `?user=` naming somebody else is ignored, `PUT` then `GET` round-trips byte-identically,
  a malformed body is rejected with the newest row unchanged, `/api/health` is served from
  a store that throws on every method, the old login path is a 404, and **a distinctive
  password sent there is searched for in the database files on disk and in every
  captured log line.**
- `__tests__/auth.test.mjs` covers getting a session and what the app does with it: local
  sign-in over HTTP, the guard on every route, `GET /api/auth/session` (the call that ended
  the sign-in loop), the stream following the *local* username, the Ward routes being wired
  (the start URL, the cookie path and redirect URI moving together), a Ward session failing
  closed with `ward_unavailable` while a local one keeps working, the configuration, and the
  seed.
- `__tests__/db.test.mjs` covers what HTTP cannot reach: a database built with the *old*
  single-stream DDL is migrated and its rows stay readable, re-opening it migrates nothing
  and leaves the same schema as a fresh database, a busy user cannot evict a quiet one,
  and pruning keeps the right rows even when `created_at` goes **backwards** mid-stream.

Nothing in either file imports from the client. The service is version-agnostic — it
copies `schemaVersion` into a column and never interprets it — so the fixtures are
hand-written v3 bodies. Building them from the codec would couple the service to the
bundle's TypeScript and would break these tests on a client schema bump that cannot
affect the server.

They do import `@sports-app/shared/username.ts`, which is a different thing: the
username rule is a *contract* both ends must apply identically, not a client
implementation detail. It used to be written out twice — once here, once in the codec —
with a test comparing the two regexes; brief 21 replaced both copies with one
definition and deleted that test as meaningless.
