---
summary: Module layout, dependency direction, and the pure-core/imperative-shell boundary — plus what v2's fixed schedule removed from it.
updated: 2026-07-29
---

# Architecture

A single Vite + React + TypeScript package. The organising idea is a **pure core with
an imperative shell**: everything that decides *what you should do* is a pure function
over plain data, and everything that touches a browser API is pushed to the edge.

That boundary is enforced by [`../../eslint.config.js`](../../eslint.config.js), not by
convention — `src/domain/**` cannot import the shell, touch a browser global, call
`new Date()` / `Date.now()`, or call `Math.random()`. Treat it as infrastructure.

**v2 note.** The core got much smaller. With no adaptation there is no rule table to
simulate and no derived state to repair, so `domain/` is now content data plus one
interpolation. The boundary still matters — it is what makes the schedule testable
without a browser — but it is guarding far less.

## Layout

```
src/
  domain/                  PURE. Imports nothing from src/. No browser APIs, no clock.
    types.ts               Pattern · Rung · Ladder · StateDoc · SessionResult · Variant
    ladders.ts             the five ladders as typed content data, per-rung caps
    schedule.ts            prescribe() · recordSession() · rungAt() · targetAt()
    milestones.ts          milestones reached + cumulative work, for /account
    __tests__/

  persistence/             owns the StateDoc lifecycle, keyed by username
    codec.ts               parse/serialise + schemaVersion + migrations (v1→v2→v3)
    store.ts               local read/write, navigator.storage.persist()
    sync.ts                PUT/GET the state document against the SQLite service
    session.ts             which username this browser is acting as

  session/                 the imperative shell around a live workout
    useSession.ts          player state machine (which exercise, which set)
    timer.ts               timestamp-based countdown; never trusts setInterval
    wakeLock.ts            navigator.wakeLock acquire/release

  ui/
    routes/                TanStack Router: / · /week · /account · /login
    ExerciseFigure.tsx     animated figure; tempo driven by the rung's modifier data
    figures/               five SVG poses + per-rung overlays + the animation driver

  main.tsx

server/                    zero-dependency node:sqlite state service, multi-user
  state-server.mjs         GET/PUT /api/state · POST /api/login · GET /api/health
  db.mjs                   snapshot rows, one stream per username
```

## Dependency direction

```
ui  ──►  session  ──►  domain
 │                        ▲
 └──►  persistence  ──────┘
```

Nothing points back the other way. Specifically:

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
