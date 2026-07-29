# Task 22 — Fastify, with the REST contract unchanged

## Context

The service becomes **Fastify** (user's call, 2026-07-29), and **the REST contract does not
change at all** — same paths, same methods, same status codes, same bodies. The client
already speaks plain REST through four `fetch` calls and must not need a single edit.

Read [wiki/technical-decisions.md](../../wiki/technical-decisions.md#the-api-is-fastify-and-the-rest-contract-is-unchanged),
which also records what this costs: **the service gains a dependency tree, so deploying
stops being a file copy and gains an install step.** That was the real value of the
zero-dependency choice, not code aesthetics. It was traded knowingly.

Depends on **brief 21** (workspaces + `shared/`).

## What makes this brief safe

**The 73 existing server tests are the contract.** They were written against the wire
behaviour, not the implementation, and their load-bearing assertions were mutation-tested by
the author of brief 17. They must keep passing against Fastify **without being rewritten to
match whatever you built.** If a test fails, the default assumption is that you changed
behaviour, not that the test was wrong. Changing one requires naming it and justifying it.

That includes, and especially: **the five tests asserting the password is never stored,
logged, echoed or compared** — one of which reads `app.db`, its WAL and its SHM as raw bytes
after a checkpoint, with a positive control so it cannot pass vacuously. Fastify logs
requests by default. **Configure the logger so a request body can never reach it**, and make
sure that test still has teeth.

## Files you OWN

```
server/                      the HTTP layer, rewritten on Fastify
server/src/db.ts             the node:sqlite store — PORTED, not redesigned
server/__tests__/            keep the assertions; adapt only the harness
shared/api.ts                the endpoint schemas, if brief 21 left them stubbed
```

## Files you must NOT touch

`client/**` — **if the client needs any change, this brief has failed its premise.** Report
BLOCKED and say exactly what diverged. `shared/types.ts` and `shared/username.ts` are brief
21's; you may add schemas in `shared/api.ts` but not alter the shapes.

## The contract, unchanged

Secret: `x-sync-secret` header on every route except `/api/health`, checked **before** any
validation.

| Method | Path | Success | Errors |
|---|---|---|---|
| `GET`/`HEAD` | `/api/health` | `200 {"status":"ok"}` — exactly that one key | `405` + `Allow: GET, HEAD` |
| `POST` | `/api/login` | `200 {"username":"alice"}` | `400`, `401`, `405`, `413`, `415` |
| `GET` | `/api/state?user=alice` | `200` + document bytes **verbatim**, headers `X-Snapshot-Id`, `X-Snapshot-Created-At` | `400`, `401`, `404`, `405` |
| `PUT` | `/api/state?user=alice` | `200 {id, createdAt, username, historyLength, schemaVersion, bytes, pruned, retained}` | `400`, `401`, `405`, `413` (4 MiB), `415` |

Five behaviours that are easy to lose in a framework migration and are all load-bearing:

1. **`GET /api/state` returns the stored bytes verbatim**, not a re-serialised object.
   Fastify will happily parse and re-stringify JSON for you; that would silently change
   byte-for-byte round-tripping, which the client's crash-safe save depends on.
2. **The secret check runs before validation**, so a wrong secret gets `401` and never a
   `400` that leaks whether a username exists.
3. **`PUT` rejects a mismatch** between `?user=` and the document's own `username` with
   **`400`, not `409`**, and stores nothing.
4. **Usernames are rejected, not case-folded.** Folding makes the stream key disagree with
   the document's own `username`, which is precisely what rule 3 refuses.
5. **Exact path matching**, so `/api/state?x=1` cannot slip past.

## Validation

Use Fastify's schema validation rather than the hand-rolled checks, driven from `shared/` so
**the same definition that guards the server also types the client**. That is the point of
having a `shared/` workspace at all.

`shared/` may not import `node:*` or anything DOM (brief 21 enforces this with an ESLint
rule), so whatever you choose must be runtime-agnostic. **TypeBox is the recommended
choice** — it is tiny, it is Fastify's documented type provider, and it produces JSON Schema
and a TypeScript type from one declaration. Zod with a type provider is a defensible
alternative. Hand-written JSON Schema with separately maintained types is **not** — that
recreates the duplication brief 21 just deleted.

**Keep `PUT`'s document check shallow.** It validates exactly three things — numeric
`schemaVersion`, a valid `username`, `Array.isArray(history)` — because the client codec owns
the canonical shape and the service must not become a second source of truth for it. A
schema that validates the whole `StateDoc` would be a regression, not an improvement, and it
would reject documents from a future schema version that the service is supposed to store
blindly. There is already a test that a `schemaVersion: 4` document round-trips.

## Storage

`server/src/db.ts` is a **port, not a redesign**. Keep: WAL, `synchronous = FULL`, snapshot
rows keyed by username, retention ~20 **per user**, pruning **by `id` within a username**
(never by `created_at` — NTP can move a clock backwards), and the idempotent
`PRAGMA table_info` guard around the `ALTER TABLE`. `node:sqlite` stays; nothing about
Fastify touches storage.

## Acceptance

- `npm run check` green from the root, **all tests passing**, with the 73 server assertions
  intact. Name any you changed and justify it.
- **The password tests still have teeth.** Show that Fastify's request logging cannot reach a
  body: add a login with a sentinel password, then search the database files *and* captured
  logs for it, with the positive controls still in place.
- A test asserts `GET /api/state` returns **byte-identical** stored content — put a document
  with unusual-but-valid JSON formatting through `PUT` then `GET` and compare bytes.
- A test asserts a wrong secret yields `401` even when the username is invalid, proving the
  ordering.
- `npm audit` clean after adding Fastify; all versions exactly pinned.
- The service starts with one command and the client dev proxy still reaches it.
- **Report the deploy consequence concretely**: what now has to happen on a server that
  previously only needed the files copied. That goes in the deploy brief, and it is the cost
  this migration was accepted knowing about.
