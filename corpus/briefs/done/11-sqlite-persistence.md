# Task 11 — SQLite persistence service

## Context

The durability half of brief 05. Local storage keeps the app fast and offline; this
brief keeps the history alive when the phone is lost or the browser evicts its
storage, and gives phone↔desktop sync as a side effect.

Deliberately **not** a backend in the usual sense: a small zero-dependency Node
service owns a SQLite database in a gitignored `db/` folder, and the client `PUT`s and
`GET`s the same JSON document brief 05 already produces. No users table, no auth flow,
no sessions, no SQL migrations. Last-write-wins is *correct* rather than lazy — there
is exactly one user, so a genuine concurrent write is near-impossible. See
[decisions.md](../../wiki/decisions.md#durability-a-sqlite-service-holding-json-snapshot-rows).

**Use Node's built-in `node:sqlite`** (`DatabaseSync`). Verified working on the local
Node 24. That keeps the service at **zero dependencies** — no `better-sqlite3` native
build, nothing to compile, nothing to pin. It prints an experimental warning; that is
acceptable and must not be "fixed" by adding a dependency.

## Files you OWN

```
server/state-server.mjs      the HTTP service
server/db.mjs                schema, queries, retention
server/README.md             how to run it locally, env vars
server/__tests__/            or a test script wired into npm test
src/persistence/sync.ts
src/persistence/__tests__/sync.test.ts
```

Plus **narrow, additive** changes to: `package.json` (a `server` script), `vite.config.ts`
(a dev proxy for `/api`), and sync status + secret fields in `src/ui/SettingsScreen.tsx`.

## Files you must NOT touch

`src/domain/**` (another agent is working there right now), `src/persistence/codec.ts`,
`src/persistence/store.ts`. Sync **consumes** the codec — it does not define its own
format. Do not restructure anything in `src/ui/` beyond the settings fields.

## What to do

### 1. `server/db.mjs` — snapshot rows, not normalised tables

```sql
CREATE TABLE IF NOT EXISTS snapshots (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at         TEXT    NOT NULL,   -- ISO, server clock
  sessions_completed INTEGER NOT NULL,
  schema_version     INTEGER NOT NULL,
  doc_json           TEXT    NOT NULL
);
```

Latest row by `id` is the current state. Set `journal_mode = WAL` and
`synchronous = FULL` — this writes once per workout, so durability beats throughput.

Storing whole-document snapshots rather than `sessions`/`sets`/`ladders` tables is a
locked decision: the codec already owns validation and the canonical shape, and
`schemaVersion` lives inside the JSON, so normalising would create a second source of
truth for shape and duplicate all of brief 05's validation.

**Retention: keep the most recent ~20 snapshots**, and put the reason in a comment.
Each snapshot embeds the full history, so snapshot size grows linearly with sessions
and total database size grows **quadratically** with retention × sessions. At three
years of daily training a snapshot is roughly a megabyte; 20 is ~20 MB and 1000 would
be gigabytes. This is a correctness-of-scale limit, not a tuning knob.

### 2. `server/state-server.mjs`

- `GET /api/state` → newest snapshot's `doc_json`, or 404 when there are none.
- `PUT /api/state` → parse as JSON, require a numeric `schemaVersion` and a
  non-negative integer `sessionsCompleted`, then insert a row and prune. Reject
  anything else with 400 and leave the database untouched.
- `GET /api/health` → cheap liveness, no auth.
- Auth: a shared secret in a header, compared with **`crypto.timingSafeEqual`** on
  equal-length buffers, read from an env var. 401 otherwise. **No secret in the repo.**
- Body size cap. `Content-Type: application/json`. No other routes, no directory
  listing, no static file serving.
- Bind to `127.0.0.1` by default so it is not exposed by accident; make host/port
  configurable by env.
- Create `db/` on startup if absent.

### 3. `src/persistence/sync.ts`

- `push(doc)` — serialise via the codec and `PUT`. **Fire-and-forget: a failure is
  logged, never surfaced as a blocking error, and never allowed to fail a workout.**
  Nothing on the session-critical path may require network
  ([architecture.md](../../wiki/architecture.md)).
- **Do not gate on `navigator.onLine`.** Brief 01 observed it reporting `true` while
  the network was demonstrably offline. Attempt the request and catch.
- **Gate `push` on brief 05's `isReadOnly()`** — pushing while the local document is
  unreadable would upload something the app never validated.
- `pull()` — `GET` and `parse` (pass `{ ladders: LADDERS }` for bounds checking).
  Used explicitly from Settings, and on app start when local storage is empty (the
  new-device case).
- Conflict handling: compare `sessionsCompleted`. Silent last-write-wins is fine when
  local is ahead or equal. When the **remote is ahead**, do not overwrite in either
  direction — surface both numbers in Settings and let the user choose. Discarding
  sessions the user knows they did is the one unacceptable outcome.
- Write pulled documents through `store.save(doc)` so they get verify-before-promote.
  If local is corrupt, `save` refuses — pull-and-replace must pass
  `allowOverwriteCorrupt: true` after explicit confirmation, exactly like import.
- Store base URL and secret in `settings.sync` (already on `StateDoc`). Treat the
  secret as **write-only in the UI**: masked, replaceable, never displayed.
- Call `push(doc)` after a successful session save. One push per completed session is
  the entire cadence — no polling, no timers, no background sync.

### 4. Dev ergonomics

An `npm run server` script, and a Vite dev-server proxy so `/api` reaches the service
in development without CORS. Note in `server/README.md` that the secret is present in
exported JSON files when sync is configured — brief 05's export UI should warn about
that.

## Acceptance

- `npm test` passes. Client tests cover: `push` swallowing a network failure without
  throwing; `push` refusing while read-only; `pull` rejecting a malformed body via the
  codec; and the remote-ahead comparison producing a prompt rather than an overwrite.
- Server tested against a **real temporary SQLite file**, not a mock: `GET` before any
  `PUT` returns 404; a wrong or missing secret returns 401; `PUT` then `GET`
  round-trips **byte-identically** (brief 05's `serialise` is byte-stable, so this must
  hold exactly); a malformed body is rejected and the newest row is unchanged;
  retention prunes to the cap and always keeps the newest.
- A test asserts the database file lands under `db/` and that `db/` is gitignored.
- With the service unreachable, a full session completes normally with no visible error
  and local state is intact.
- The secret appears in no committed file. Grep the diff to confirm.
- `npm run typecheck` and `npm run lint` clean.

---

## Outcome — 2026-07-29

Shipped. 28 server tests + 32 sync + 10 sync-UI. Zero dependencies via `node:sqlite`.

**Byte-identical round-trip verified against a real database file**, not a mock: a real
`DatabaseSync` on a `mkdtempSync` path driven over a real HTTP socket. Crucially the
adversarial case proves the assertion isn't vacuous — a payload with tab indentation,
out-of-order keys, `5.50`, and escaped unicode round-trips exactly *and* the test
asserts `JSON.stringify(JSON.parse(sent)) !== sent`. A third test reopens the file with
a fresh handle to prove durability rather than an in-process cache.

**Retention prunes by `id`, not `created_at`** — the server clock can move backwards
across an NTP correction, and "newest" must be a fact about insertion order. Good catch;
this is the kind of thing that silently deletes the newest snapshot once a year.

**Rejection changes nothing:** 11 malformed bodies each 400, then the newest row's id
and JSON are compared against the pre-rejection snapshot.

**Deviations, all good calls:**
1. **`timingSafeEqual` on SHA-256 digests** rather than raw secret bytes. Digests are
   always 32 bytes, so the comparison is constant-time even for a wrong-length input —
   whereas a `length !==` guard leaks the secret's length through timing.
2. **`applyRemote` gained `preserveSync`.** `settings.sync` lives inside the document, so
   a naive pull would replace *this* device's service address and secret with the other
   device's — the phone may use a LAN address where the desktop uses localhost, so
   adopting the remote copy would break sync as a side effect of using it.
3. **Shallow server-side validation only**, with a comment explaining why: a second
   validator would eventually reject a document the codec considers good, turning the
   safety net into a way to lose a workout.
4. One additive `server/**/*.mjs` Node-globals block in `eslint.config.js` (no `globals`
   package — that would break zero-dependency).

**Verified live end-to-end** against the real service on a scratch port: byte-identical
push→pull, a remote-ahead conflict producing a prompt with the remote unchanged, 401 on
a wrong secret, and `reason: 'network'` (no throw) against a dead port.

**Not wired yet:** `push` has no call site because `App.tsx` is still brief 06's
placeholder. `saveAndPush` exists as the single correct call site with ordering
documented, and the "service unreachable → session completes normally" criterion is
asserted through it.
