---
summary: How the app decides today's prescription — the fixed 6-week-per-rung schedule, why it needs no input, and the interpolation that makes state a single integer per pattern.
updated: 2026-10-07
---

# Progression — the fixed schedule

**Rewritten 2026-07-29 (v2).** The adaptive engine is gone. Nothing measures, nothing
adapts, and the prescription is a pure function of *how many sessions of that pattern
you have completed*. See [decisions.md](decisions.md#the-governing-decision--the-app-measures-nothing)
for why.

## The two functions

```
prescribe(state, variant)      → Prescription   // what to do today
recordSession(state, result)   → StateDoc       // increments counters, appends history
```

`recordSession` does not decide anything. It advances `cyclePosition` by one,
increments the session counter for each pattern the session trained, and appends the
record. There is no rule table, no branch, and nothing that can be wrong about it.

Both are deterministic and clock-free — the caller passes any timestamp in.

## The law

**A rung takes about six weeks, on every ladder.** Everything else derives:

```
step = span ÷ (sessions of that pattern in ~6 weeks)
```

| Ladder | Sessions/week | Sessions per rung | Typical span | Resulting step |
|---|---|---|---|---|
| Push · squat · hinge | 2.3 | **14** | 5→12 reps | +1 rep per 2 sessions |
| Core | 7 | **42** | 20→60s | +1s per session |
| Posture (pull) | 7 | **42** | 10→30s | +1s per 2 sessions |

The user specified those three steps independently, before the law was derived. It
reproduces all three, which is why it is stated as one rule rather than three
constants — and why per-rung caps of different sizes need no new tuning.

## Deriving the prescription — interpolation, not accumulation

Each rung carries **its own** `targetMin` / `targetMax`, because the evidence-based
caps differ per exercise: a front plank runs 20→60s, a tuck L-sit 10→30s. Rather than
give each rung a step, interpolate across its span over the ladder's fixed
sessions-per-rung:

```
rungIndex        = min(startRungIndex + ⌊sessionsDone / sessionsPerRung⌋, topRungIndex)
sessionsIntoRung = sessionsDone mod sessionsPerRung
fraction         = sessionsIntoRung / sessionsPerRung
target           = round(targetMin + fraction × (targetMax − targetMin))
```

Three properties fall out of this rather than needing to be implemented:

1. **Every rung takes the same number of sessions** regardless of how wide its span
   is. That *is* the law, expressed directly.
2. **The top of the ladder cycles.** Once `rungIndex` clamps to the top, the modulo
   keeps running, so the target sweeps min→max→min indefinitely. No special case.
3. **A rung's caps can be re-tuned without invalidating anyone's position**, because
   nothing accumulated depends on the old numbers.

## State is one integer per pattern

```ts
interface StateDoc {
  schemaVersion: 5
  cyclePosition: number                       // integer index into ROTATION
  sessionsDone: Record<Pattern, number>       // ← the whole of the mutable state
  history: readonly SessionResult[]
  settings: Settings
}
```

`rungIndex`, `target`, and the rung's name and cues are **all derived**. There is no
`LadderState`, no `cleanAtMax`, no `missedStreak`, and no cached value that can drift
from the thing it caches. The class of bug that produced the wave-3 fixture defect —
stored state unreachable by replaying history — is now inexpressible.

**Why store the counters when they are derivable from `cyclePosition`?** Because the
rotation is deterministic, `sessionsDone.push` is exactly `⌈cyclePosition / 3⌉`. It is
stored anyway: if the rotation ever changes, derived counters would silently
reinterpret every existing user's position mid-programme. One integer per pattern is
cheap insurance against a content change rewriting history.

### Inserting a rung moves people, so it needs a migration

The counter is turned into a rung by **array index**. Insert a rung at index k and the
same counter names the rung below the one it used to: everyone at or above k silently
drops back one exercise. Brief 28 inserted three rungs (push 3a, hinge 4a, squat 5a;
see [programme.md](programme.md#the-three-in-between-rungs)), so schema v5 carries a
one-off step in `client/src/persistence/codec.ts`: a v4 counter at or above an
insertion gains `sessionsPerRung` (14). Same rung, same point in it, same target.
Counters below an insertion do not move. History needs nothing, because each record
stores its `rungId`. The step reads frozen v4 numbers rather than `ladders.ts`, and the
service stores documents without migrating them, so it runs exactly once.

The consequence worth knowing: on a migrated document `sessionsDone` is a **position**,
not a tally. It can sit 14 above the sessions actually trained. Retiring a rung from
the middle would need the same treatment in reverse.

## The rotation

```
Push day     push        + core + posture      ~12 min
Legs day     squat hinge + core + posture      ~16 min
Cardio day   intervals   + core + posture      ~14 min
```

Three positions, and **the position is an integer counter, not a date.** There is no
calendar arithmetic anywhere in the domain, so "a missed day" is not an expressible
concept. Cardio always follows legs and never precedes it — see
[decisions.md](decisions.md#the-week--push--legs--cardio-plus-a-daily-core-and-posture-block).

Strength patterns run 3 sets; the daily core and posture block runs 2, to keep
sessions near 12 minutes.

## The variant — a load dial, not a signal

```
easy    target − 2 reps  /  − 5 seconds     (floored at the rung's targetMin, min 3)
medium  target                              (the schedule's own number)
hard    target + 2 reps  /  + 5 seconds     (capped at the rung's targetMax)
```

`hard` is a **no-op at the cap**, which is deliberate: the 12-rep ceiling exists
because past ~12–15 bodyweight reps the adaptation drifts to endurance, and the
variant must not be a way around it.

**The pick never touches `sessionsDone`.** An easy day costs no progress and banks no
debt. That independence is the reason a bad day is free, and it is the property most
worth a test.

## What the app does with a completed session

Nothing conditional. `isCompleted` does not exist; neither does `actualValue`. Tapping
Next through the last exercise records:

```ts
interface SessionResult {
  completedAt: IsoTimestamp    // stored, never rendered
  position: number             // which rotation slot
  variant: 'easy' | 'medium' | 'hard'
  exercises: { pattern, rungId, sets: number, targetValue: number }[]
}
```

`variant` is the only genuinely variable field in the whole document, which is why
the account page is built from milestones and cumulative work rather than from a
chart — see [decisions.md](decisions.md#four-screens-and-only-one-of-them-is-the-training-flow).

## Deleted in v2, and what replaced it

| Gone | Why |
|---|---|
| the advance / hold / regress rule table | nothing is measured, so nothing branches |
| `cleanAtMax`, `missedStreak`, `LadderState` | replaced by one integer per pattern |
| `SetResult.actualValue` | the app never learns what actually happened |
| `deriveLadderStates` (the repair tool) | there is no derived state left to repair |
| the `easy` fast-track, the effort tap | removed in v1's own revision; see decisions |
| descending calibration | there is no calibration — the schedule is the same for everyone |
| `progressIndex` and the chart series | a fixed schedule plots as a straight line |
| the 21-session replay fixture and its proof | the property it proved no longer exists |

Three open questions closed with them: the fast-track over-advance (moot), rung
discriminability (the animated figure's clock now differs per rung), and the absence
of an interior fixed point (nothing converges because nothing adapts). See
[open-questions.md](open-questions.md).

## The cost, recorded rather than argued away

The schedule is sometimes too easy and sometimes too hard, and the app cannot tell
which. Concretely: early in a rung the target sits well short of failure, which is
where low-load hypertrophy actually comes from
([training-science.md](training-science.md)); late in a rung it may sit past it.

The per-session variant is the mitigation, and it is a better one than it looks — the
adaptive engine never had access to proximity-to-failure either, only to reps
completed. **The judgement moved to the one party who can assess it.**

The unmitigated cost is safety: the schedule reaches genuinely risky rungs on a clock
rather than on readiness. That is an accepted risk with a named owner —
[adherence.md](adherence.md#accepted-risk--the-schedule-prescribes-risky-rungs-on-time-not-on-readiness)
(moved out of `decisions.md` on 2026-07-30).
