---
summary: Module layout, dependency direction, and the pure-core/imperative-shell boundary that keeps the engine testable.
updated: 2026-07-29
---

# Architecture

A single Vite + React + TypeScript package. The organising idea is a **pure core
with an imperative shell**: everything that decides *what you should do* is a pure
function over plain data, and everything that touches a browser API is pushed to
the edge.

That boundary is the whole reason the engine is trustworthy. `domain/` has no
imports from anywhere else in `src/`, so the progression rules can be simulated
across hundreds of synthetic sessions in milliseconds with no DOM, no storage, and
no clock.

## Planned layout

```
src/
  domain/                  PURE. Imports nothing from src/. No browser APIs, no Date.now().
    types.ts               Pattern · Rung · Ladder · StateDoc · SessionResult · SetResult
    ladders.ts             the five ladders as typed content data
    engine.ts              nextSession() · applySession() · isClean()
    progress.ts            progressIndex() and chart series derivation
    __tests__/             unit tests + the simulation harness

  persistence/             owns the StateDoc lifecycle
    codec.ts               parse/serialise + schemaVersion + migrations
    store.ts               local read/write, navigator.storage.persist()
    sync.ts                PUT/GET the state document against the SQLite service

  session/                 the imperative shell around a live workout
    useSession.ts          player state machine (idle → work → rest → done)
    timer.ts               timestamp-based elapsed; never trusts setInterval
    wakeLock.ts            navigator.wakeLock acquire/release
    audio.ts               WebAudio beep (primary) + speechSynthesis (best-effort)

  ui/
    App.tsx  HomeScreen  PlayerScreen  ProgressScreen  SettingsScreen
    ExerciseFigure.tsx     renders a placeholder box until a figure exists
    figures/               SVG pose pairs + per-rung overlays

  main.tsx
```

## Dependency direction

```
ui  ──►  session  ──►  domain
 │                        ▲
 └──►  persistence  ──────┘
```

Nothing points back the other way. Specifically:

- `domain/` may not import `persistence/`, `session/`, `ui/`, or any browser API.
- `domain/` may not read the clock. A session's timestamp is **passed in** by the
  caller. This keeps the engine deterministic and its tests reproducible.
- `persistence/` knows the shape of `StateDoc` but nothing about React.
- `session/` is the only place `wakeLock`, `speechSynthesis`, and `WebAudio` are
  touched, each behind a capability check with a no-op fallback.

## Data flow through one session

```
StateDoc  ──engine.nextSession()──►  Prescription
                                          │
                                    PlayerScreen
                                          │  (Done taps, rep adjustments, effort)
                                          ▼
                                     SessionResult
                                          │
StateDoc' ◄──engine.applySession()────────┘
   │
   ├──► store.save()      local, immediately
   └──► sync.push()       fire-and-forget, failure is non-fatal
```

`applySession` is the only function that advances cycle position and ladder rungs.
Everything else reads.

## Offline posture

Nothing on the session-critical path may require network. The service worker
precaches the app shell; `sync.push()` is fire-and-forget and a failure is logged,
never surfaced as a blocking error. The one deliberate exception in the design was
an external "show me" video link — **that exception is gone**, since figures are
now hand-authored and bundled.

## What does not exist, on purpose

No router library (a handful of screens, one piece of state), no charting library
(see [decisions.md](decisions.md#charts-are-hand-rolled-svg-and-never-plot-raw-reps)),
no state management library (the StateDoc plus one reducer), no backend beyond a
file cabinet, no code graph (see [`../routing.md`](../routing.md)).
