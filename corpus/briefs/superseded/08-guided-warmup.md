# Task 08 — Guided warmup

## Context

Two minutes at the front of every session: **6 movements × 20 seconds**, one fixed
sequence, **no progression**. That last point is the important one — the warmup is
deliberately *not* part of the progression engine. It never advances, never
regresses, and never appears in `history`. Keeping it out of the engine keeps the
engine's job small and its data clean.

Read the *Session shape* section of [`SPEC.md`](../../../SPEC.md).

## Files you OWN

```
src/domain/warmup.ts               the fixed sequence as data
src/ui/WarmupScreen.tsx
src/domain/__tests__/warmup.test.ts
```

Plus wiring in `src/session/useSession.ts` to prepend a `warmup` state.

## Files you must NOT touch

`engine.ts`, `ladders.ts`, `types.ts`'s `StateDoc` shape. The warmup must not enter
the state document's `history` and must not touch `cyclePosition`.

## What to do

1. **`warmup.ts`** — six movements, each with a name, 20-second duration, and 1–2
   cues. Cover the joints the session actually loads: wrists (they take the load in
   every push rung and are the most common early complaint), shoulders, thoracic
   spine, hips, ankles, and one whole-body raise in heart rate. Keep it standing and
   floor-only, zero equipment.
2. Optionally allow a **per-cycle-day variant** so leg day warms hips and ankles
   more, push day warms wrists and shoulders more. Nice, not required — a single
   universal sequence is acceptable and simpler. Do not build a warmup *engine*.
3. **`WarmupScreen.tsx`** — auto-advancing 20-second blocks with a countdown, the
   movement name and cues large, and **`Skip warmup`** always visible. Some days you
   have already been moving; forcing the warmup is exactly the friction that makes
   people stop opening the app.
4. Reuse brief 07's audio for block transitions if available — a beep at each
   changeover means you don't watch the screen. Behind the same capability checks; no
   hard dependency.
5. Prepend a `warmup` state in `useSession.ts` before the first `work` state.
   Skipping it must go straight to the first set with no side effects.
6. Persist a **"skip warmup by default"** preference. If the user skips it three
   sessions running, that is data — respect it rather than re-asking forever.

## Acceptance

- `npm test` passes. Tests assert: exactly six movements totalling 120 seconds; every
  movement has ≥1 cue; the warmup produces **no** `SessionResult` entry and does not
  change `cyclePosition` or `sessionsCompleted`.
- Manual: the warmup auto-advances through all six blocks without any taps.
- Manual: `Skip warmup` from the first block lands on set 1 of exercise 1 with the
  session otherwise intact.
- A session run with the warmup and one run without produce **identical** state
  mutations.

---

## SUPERSEDED 2026-07-29 — the v2 grill

Dropped. The v2 app opens straight onto the first exercise — the user listed the app's
contents in the second grill without a warmup, and confirmed the reading. No successor
brief.
