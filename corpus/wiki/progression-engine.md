---
summary: How the app decides today's prescription — double progression, the rep cap, the modifier lever, and the exact advance rules.
updated: 2026-07-29
---

# Progression engine

The intellectual core. Pure functions over plain data, living in `src/domain/`.
Given the state document, it produces today's prescription; given a completed
session, it produces the next state. Nothing else in the app advances a rung.

## The two functions

```
nextSession(state)            → Prescription     // what to do today
applySession(state, result)   → StateDoc         // the only rung/cycle mutator
```

Both are deterministic and clock-free — the caller passes any timestamp in. That
is what lets the simulation harness run hundreds of synthetic sessions instantly.

## The cycle

**Revised 2026-07-29 — a 7-position cycle with two cardio days.**

```
A — Push     (push ladder + postural pull)
B — Legs     (squat ladder + hinge ladder)
C — Core     (core ladder + postural pull)
D — Cardio   (5 × 60s hard / 90s easy, lower-body movement)
→ A, B, C, D, A, B, D  … then repeat
```

Cardio lands twice a week. That drops each strength pattern from ~7 to ~5.6 direct
sets/week — still inside the 5–9 "working" band ([training-science.md](training-science.md)).
Two, not three, because three would push strength to ~4.7 sets/week *and* exceed the
impact-volume ceiling the injury literature supports.

Cardio movements must be **lower-body** (high knees, fast bodyweight squats). Two of the
three strength days are upper-body/trunk, so burpees and mountain climbers would collide
with Day A and Day C. Cardio days are placed to sit as far from Day B as the cycle allows.

**Cycle position advances only when a session is completed.** It is an integer
counter, not a date. There is no calendar arithmetic anywhere in the engine, and
therefore no possible notion of a missed day. This is a locked decision — see
[decisions.md](decisions.md#the-cycle-advances-on-training-never-on-the-calendar).

## Double progression

Each ladder tracks a `rungIndex` and a current target. Rungs are
**movement + modifier**, never a different exercise.

**Revised 2026-07-29: there is no effort input anywhere in the app.** No post-set
rating, no pre-session difficulty picker, one level only. The engine's sole input is
*did you complete the prescribed work*.

```
Within a rung:   3×5 → 3×6 → … → 3×12        (time-based ladders: 20s → 45s)
Advance a rung:  3×12 completed, twice        → next rung, reset to 3×5
Hold:            missed target, 1st or 2nd    → repeat the same prescription
Regress:         missed target, 3rd running   → drop one rung, target = its targetMax
```

At the top of the rep range the lever switches from *reps* to *modifier* — tempo,
pause, range, leverage, unilateral. Reps do not climb past 12 because past ~12–15
bodyweight reps the adaptation drifts from strength to endurance, and there is no
load to add.

## `isCompleted` — one predicate, load-bearing

```
isCompleted(result) = every set hit its target value
```

The entire advance rule hangs off this, so it lives as a single named function with
its own tests rather than being inlined at call sites.

The `easy`-rated fast-track and the "all reps done but rated hard → hold" case are
both **gone**, along with the `Effort` input they read.

**Correction, 2026-07-29 — an earlier version of this page claimed the removal *solved*
the over-prescription problem. It did not.** Measured after the change: **633 of 2400
pattern-sessions (26.4%)**, marginally worse than the 605 before it. Two things were
wrong in the earlier reasoning:

1. **The effort signal was never the cause.** The 16/2400 figure that made it look like
   the decisive lever was actually bought by the *hold* the signal enabled — "every rep
   done but rated hard → repeat" stopped the climb one step short of failure. Deleting the
   input deleted that brake, so the climb now runs into the wall every cycle.
2. **It is not a time-ladder pathology.** The same capability curve on rep ladders gives
   502/3600 (13.9%). Time ladders are ~2× worse for a purely arithmetic reason — a 5s step
   across 20–45s overshoots proportionally more than a 1-rep step across 5–12 — not because
   of anything about isometrics or effort reporting.

Two things genuinely did improve, which is why the trade is still defensible: the
over-prescription is now only ever a **duration, never a movement** (`advancesAboveCapability`
and post-calibration overshoot are both 0, and the engine backs off three sessions later),
and there is no longer an unreliable signal for it to be a property of.

## Known problem — the engine has no interior fixed point

**Measured 2026-07-29.** Deleting "completed but rated hard → hold" removed the engine's
only interior fixed point, so **a static-capability user no longer settles — it oscillates
over two adjacent rungs.** Across 8 seeds with zero noise the tail band is identical every
time: push `[5,6]`, squat `[5,6]`, core `[3,4]`, pull `[3,4]`. Hinge `[5]` is the one real
fixed point, and only because it owns the top of its ladder.

It oscillates rather than wanders — band width never exceeds 2 — but it costs 0–37.5% of
tail sessions to a missed target. The loop is: climb to the top of a rung, advance, fail
three times, deload back, re-climb in two sessions, advance again, fail again.

This is the direct cost of having no effort input, and it is unresolved. The obvious fix
needs no user input: **hysteresis.** Track deloads per rung and raise the advancement bar
each time the same rung is failed, so the ladder converges because the requirement rises
until the user genuinely meets it.

## Calibration is descending, not ascending

Removing effort also removed the fast-track, which was the only calibration mechanism.
An onboarding quiz, a post-set rating, and a pre-session picker have each been
explicitly rejected. So calibration now runs **downhill**:

- **Every ladder starts mid-ladder**, at a rung a returning beginner plausibly *can* do,
  not at rung 1.
- If that is too hard you miss sets, and the 3-miss regress rule walks you down
  automatically. **A missed set is already zero-input information** — no tap, no
  question, no quiz.
- From there the target climbs **one step per session**, gradually.

Starting rungs are capped per ladder so nothing injury-risky (nordic negatives, pistols)
can ever be an entry point.

## Input the engine receives — SUPERSEDED, see above

*The effort tap described below no longer exists. Kept only to explain why the input set
is as small as it is.*

Per set: target reps, actual reps. Per exercise: one effort rating on the **last
set only** (`easy | ok | hard`). That is the complete input — roughly eight taps a
session, which is the budget mid-workout ergonomics allow.

The engine must never assume completion. If "Done" were the only signal, it would
believe every set was hit and march the user up the ladder into movements they
cannot do.

## Time-based ladders and the target step

Core and postural pull are held, not repped. They substitute seconds for reps and
otherwise run the identical rules.

**Decided at the wave-3 gate (2026-07-29): time ladders step by 5 seconds, not 1.**

```
targetStep(unit)     →  unit === 'seconds' ? 5 : 1
stepsPerRung(unit)   →  unit === 'seconds' ? 6 : 8

reps     5 6 7 8 9 10 11 12          8 targets per rung
seconds  20 25 30 35 40 45           6 targets per rung
```

A one-second step would mean **26 sessions to clear a single rung of planks**, and it
would silently break `progressIndex`, whose original `× 8` was the rep span. Both
values derive from `unit`, so neither `types.ts` nor `ladders.ts` needs a new field.

## Progress index

```
progressIndex = rungIndex × stepsPerRung(unit) + (target − targetMin) / targetStep(unit)
```

Monotonic by construction, and comparable within a pattern (not across patterns —
each is its own chart line). Raw reps must never be charted: advancing a rung resets
the target to the bottom of the range, so a rep chart sawtooths and shows regression
exactly when the user got stronger.

## Superseded — fast-track over-advance on the core ladder

The fast-track no longer exists (no effort input), so this risk is moot as written.
Its successor is *Known problem — the engine has no interior fixed point* above, and
the over-prescription figure it worried about is documented in the correction above.
