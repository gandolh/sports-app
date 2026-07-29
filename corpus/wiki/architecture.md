---
summary: The three npm workspaces, the dependency direction across them, and the pure-core/imperative-shell boundary inside the client.
updated: 2026-07-29
---

# Architecture

**Three npm workspaces — `client`, `server`, `shared`.** Inside the client the organising
idea is a **pure core with an imperative shell**: everything that decides *what you should
do* is a pure function over plain data, and everything that touches a browser API is
pushed to the edge.

That boundary is enforced by [`../../eslint.config.js`](../../eslint.config.js), not by
convention — `client/src/domain/**` cannot import the shell, touch a browser global, call
`new Date()` / `Date.now()`, or call `Math.random()`. Treat it as infrastructure.

**v2 note.** The core got much smaller. With no adaptation there is no rule table to
simulate and no derived state to repair, so `domain/` is now content data plus one
interpolation. The boundary still matters — it is what makes the schedule testable
without a browser — but it is guarding far less.

## Layout — three npm workspaces

*Restructured 2026-07-29. `shared/` exists to kill a duplication the build was papering
over: the username rule lived in both the service and the client codec, kept honest by a
test asserting the two regexes matched.*

```
shared/                    THE WIRE CONTRACT. No node:, no DOM — both runtimes import it.
  types.ts                 Pattern · Variant · SessionResult · StateDoc · schemaVersion
  username.ts              the one username rule, formerly duplicated in two places
  api.ts                   request/response shapes + schemas for the four endpoints

client/                    the PWA
  src/domain/              PURE. Imports shared/ and nothing else from the repo.
    ladders.ts             the five ladders as typed content data, per-rung caps
    schedule.ts            prescribe() · recordSession() · toSessionResult() · rungIndexAt()
    milestones.ts          milestones reached + cumulative work, for /account
  src/persistence/         the StateDoc lifecycle, keyed by username
    codec.ts  store.ts  session.ts  sync.ts
  src/session/             the imperative shell around a live workout
    useSession.ts  timer.ts  wakeLock.ts
  src/ui/
    routes/                TanStack Router: / · /week · /account · /login
    components/  figures/  ExerciseFigure.tsx
  src/main.tsx

server/                    Fastify. Same REST contract, schema-validated from shared/.
  src/routes/              /api/state · /api/login · /api/health
  src/db.ts                node:sqlite snapshot rows, one stream per username
```

**`shared/` holds data shapes and validation, never behaviour.** The ladders, the schedule
and the milestones stay in the client — they are logic the server has no business knowing,
and putting them in `shared/` would make the service depend on training content it never
reads.

## Dependency direction

```
ui  ──►  session  ──►  domain  ──►  shared  ◄──  server
 │                        ▲
 └──►  persistence  ──────┘
```

`shared/` is the only thing both runtimes may import, and it imports nothing. Nothing else
points back the other way. Specifically:

- **`shared/` may not import `node:` anything, touch the DOM, or contain behaviour.** It is
  a browser bundle's dependency and a Node service's dependency at the same time.
- `domain/` may not import `persistence/`, `session/`, `ui/`, or any browser API, and
  may not read the clock — a session's timestamp is **passed in**.
- `persistence/` knows the shape of `StateDoc` but nothing about React.
- `session/` is the only place `wakeLock` and any timer is touched, each behind a
  capability check with a no-op fallback.
- **`ui/` may not read a timestamp from history.** No dates anywhere is a product
  invariant with a mechanical test, not a styling preference.

## Data flow through one session

```
StateDoc ──prescribe(state, variant)──►  Prescription
                                              │
                                        the player pages
                                              │  (Next taps only — nothing measured)
                                              ▼
                                         SessionResult
                                              │
StateDoc' ◄──recordSession()──────────────────┘
   │
   ├──► store.save()      local, immediately, keyed by username
   └──► sync.push()       fire-and-forget, failure is non-fatal
```

`recordSession` is the only function that advances the rotation position and the
per-pattern counters. It contains no conditionals — see
[progression-engine.md](progression-engine.md).

## The player, mechanically

One page per exercise. The page holds the figure, the target number, and three dots
(two on the daily core/posture block). Tapping Next fills a dot; the last tap advances
to the next exercise. On a hold, a start button runs an **orientative** countdown ring
which never gates anything — Next is always live, because the app trusts the user.

Rest between sets is simply however long you take before tapping. There is no rest
timer, because a rest timer would be the app measuring something.

## Offline posture

Nothing on the session-critical path may require network. The service worker precaches
the app shell; `sync.push()` is fire-and-forget and a failure is logged, never
surfaced as a blocking error. **`/login` must work offline** — the username is stored
locally and the password is never checked, so there is nothing to verify against a
server.

## Multi-user, weakly

A username keys its own state document, locally and in SQLite. The password is
accepted and discarded in the request handler; nothing stores or compares it. See
[decisions.md](decisions.md#multi-user-with-passwords-that-are-never-checked) — this
is not a security boundary and no feature may treat it as one.

## What does not exist, on purpose

No charting library (charts are gone — a fixed schedule is a straight line), no state
management library (one document plus one reducer), no simulation harness (nothing
adapts, so there is no emergent behaviour to simulate), no rest timer, no audio cues,
no backend beyond a file cabinet, no code graph (see [`../routing.md`](../routing.md)).
