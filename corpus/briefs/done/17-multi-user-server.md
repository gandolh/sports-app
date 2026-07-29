# Task 17 — Multi-user state service and the login that checks nothing

## Context

v2 added accounts: a username keys its own state document, and **a password field
exists whose value is accepted and immediately discarded**. Read
[wiki/technical-decisions.md](../../wiki/technical-decisions.md#authentication-is-a-nameplate-not-a-boundary)
before writing a line of this.

The two things that make this brief unusual, and which you must not "fix":

1. **The password is never stored and never compared.** Not hashed-and-compared, not
   stored-for-later, not logged. It is read off the request and dropped. Storing an
   unchecked password buys nothing and collects real passwords that people reuse
   elsewhere — that is the entire reasoning, and it is a locked decision.
2. **This is not a security boundary.** Anyone who knows a username can read that
   person's training history. That is accepted for training data on a personal
   deployment. Do not add a token, a session cookie, rate limiting, or a "secure"
   feeling that isn't real. **Do** make the honesty visible: the login screen's copy
   (brief 19) says the password isn't checked, and your handler's comments say why.

The existing service is deliberately **zero-dependency** — `node:sqlite`, `node:http`,
nothing else. Adding a package is not on the table.

## Files you OWN

```
server/db.mjs                        snapshot rows keyed by username
server/state-server.mjs              GET/PUT /api/state, POST /api/login, GET /api/health
server/__tests__/state-server.test.mjs
server/__tests__/db.test.mjs         NEW if the store logic warrants its own file
```

## Files you must NOT touch

`src/**` — brief 16 owns the client side. If the wire shape needs to change, **you
decide it and say so in your report**; brief 16 adapts to you.

## 1. Schema change

The `snapshots` table currently holds one stream:

```sql
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL,
  sessions_completed INTEGER NOT NULL, schema_version INTEGER NOT NULL,
  doc_json TEXT NOT NULL);
```

Add `username TEXT NOT NULL` and an index that makes "newest snapshot for this user"
cheap. Two things to get right:

- **Migrate an existing database rather than requiring a fresh one.** There may already
  be real training history in `db/app.db`. `ALTER TABLE ... ADD COLUMN` with a
  documented default for pre-existing rows, guarded so it runs once and is idempotent.
  A service that only works on an empty database is not finished.
- **Retention is now per user.** The cap is ~20 snapshots *each*, and the prune must not
  let a busy user evict a quiet one's history. Prune by `id` within a username, never by
  `created_at` — NTP can move a clock backwards, and a snapshot pruned by timestamp is
  gone for good.

Keep WAL and `synchronous = FULL`. Keep the "why snapshot rows, not normalised tables"
comment accurate after your change.

## 2. Endpoints

```
GET  /api/health          liveness. No auth, no database read, no information leaked.
POST /api/login           { username, password } → { username }. Password discarded.
GET  /api/state?user=…    newest snapshot for that user, or 404 when there are none.
PUT  /api/state           store verbatim for the document's username, prune to the cap.
```

- **Validate the username, strictly.** It reaches SQL (parameterised — keep it that
  way) and it reaches the client. Define an explicit allowlist pattern and a length cap,
  reject everything else with a clear 400. An unbounded username is a denial-of-service
  and a display-breaking hazard even without being an injection one.
- **`PUT` keeps validating shallowly and storing verbatim.** The codec owns the
  canonical shape; the server must not become a second source of truth for it. But it
  must check that the document's own `username` matches the one it is being stored
  under, and reject a mismatch — otherwise a client bug silently writes into someone
  else's stream.
- The existing shared-secret check, where a deployment sets one, stays: `timingSafeEqual`
  over SHA-256 digests, which is constant-time even for wrong-length input. That secret
  protects the *deployment*, not the accounts, and the distinction belongs in a comment.
- Exact path comparison stays, so `/api/state?x=1` cannot slip past it.

## 3. What must not appear anywhere

Grep your own output before you finish. The password must not be in: the database, a log
line, an error message, a response body, or an in-memory structure that outlives the
request handler. **Write a test that asserts this** — a handler that receives a
distinctive password string and then a search of the database file and captured logs for
that string.

## Acceptance

- `npx vitest run server` clean; the service still starts with **zero dependencies**.
- A test migrates a **pre-existing single-user database** to the multi-user schema and
  asserts the old rows are still readable and attributed to the documented default user.
- Tests assert: per-user isolation on read and write; a busy user cannot evict a quiet
  user's snapshots; pruning is by `id`; retention holds at ~20 per user.
- Tests assert username validation rejects over-long, empty, and out-of-alphabet
  usernames with 400, and that a `PUT` whose document username disagrees with its target
  is rejected.
- **The password-never-persisted test described in §3**, which is the one test in this
  brief that would be embarrassing to be missing.
- A test asserts `/api/health` reads no database and leaks nothing.
- **Report the wire shape you chose** (query param vs body vs header for the username)
  so brief 16 can match it.

---

## Outcome — 2026-07-29

**Done**, 73 tests, still zero dependencies. The password is accepted and discarded, held by
five tests including one that reads `app.db`, its WAL and its SHM as raw bytes after a
checkpoint — each search carrying a positive control so it cannot pass vacuously. The
implementer mutation-tested the load-bearing assertions rather than trusting a green run.

`?user=` is required on `PUT` as well as `GET`, which the brief had not asked for: a mismatch
check needs an independently stated target to compare against. Usernames are rejected rather
than case-folded, because folding would make the stream key disagree with the document's own
`username` — which is exactly what `PUT` refuses.

The implementer noted its instinct was to add a per-user secret, and flagged it instead of
acting on it. That is the correct handling of a locked decision.
