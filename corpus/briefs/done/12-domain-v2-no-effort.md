# Task 12 — Domain v2: remove effort, 7-day cycle, mid-ladder starts

## Context

Three decisions landed after briefs 02–04 shipped, and together they change the domain
model. Read [decisions.md](../../wiki/decisions.md) and
[progression-engine.md](../../wiki/progression-engine.md) — both are already updated to
describe the target state.

This is a **revision of shipped, tested code**, not new construction. Briefs 02, 03, 04
and 05 are in `done/` and immutable as *documents*, but their code is yours to change
here. Roughly 470 tests currently pass; they are the safety net for this refactor and
most of them should keep passing unchanged.

## Files you OWN

```
src/domain/types.ts · ladders.ts · engine.ts · progress.ts
src/domain/__tests__/**            (fixtures, types, engine, simulate)
src/persistence/codec.ts           ONLY where it validates the removed field
src/persistence/__tests__/**       where they assert on it
```

## Files you must NOT touch

`src/persistence/store.ts`, `server/**`, `src/ui/**`. UI changes are briefs 06/09's
revision, filed separately. Do not start on the cardio *content* — brief 13 owns that;
this brief only makes the cycle able to hold a cardio day.

## What to do

### 1. Delete the effort input entirely

Remove `Effort` from `types.ts` and from `ExerciseResult`. Remove `isClean`, the
`easy` fast-track, `allowsFastTrack`, and the "all reps done but rated hard → hold"
case from `engine.ts`. The new rule table:

```
isCompleted(result) = every set hit its target value

completed, target < max        → target + targetStep(unit)
completed, target = max, 2nd   → rungIndex + 1, target = targetMin
completed, target = max, 1st   → hold, cleanAtMax = 1
missed, 1st or 2nd consecutive → hold
missed, 3rd consecutive        → rungIndex − 1, target = that rung's targetMax
                                 (at rung 0: target − step, floored at targetMin)
```

**`schemaVersion` must go to 2, and `migrate` must actually migrate** — a v1 document
has `effort` on every `ExerciseResult`. Drop the field on load; do not reject the
document. This is the first real use of the migration path brief 05 built on purpose,
so treat it as the test of that design.

### 2. Seven-position cycle with two cardio days

```
A(push+pull) · B(squat+hinge) · C(core+pull) · CARDIO · A · B · CARDIO
```

`CycleDay` gains a cardio variant and `CYCLE` becomes 7 entries. `cycleDayAt` already
does positive-modulo arithmetic — keep that property and its tests. **No date
arithmetic may appear anywhere**; position still advances only on completion.

A cardio day trains no ladder, so `applySession` must handle a session that mutates no
ladder state while still advancing `cyclePosition` and `sessionsCompleted`.

### 3. Mid-ladder starting rungs

Calibration is now **descending**: start at a rung a returning beginner plausibly can
do, and let the 3-miss regress rule walk them down. Add a per-ladder `startRungIndex`
to the ladder content and use it in `freshLadderStates`.

**Cap it for safety.** The starting rung must never be one where failing is injurious —
no nordic negatives, no pistols, no archer variants. Pick something defensible per
ladder (e.g. push at the knee push-up, squat at bodyweight) and **write the reasoning
in a comment**, because this is a safety-relevant number, not a tuning knob.

### 4. Fixture

Same two rules as the wave-4 gate, and they still bind:
1. **`midProgramHistory` is hand-authored input. Do not rewrite it** to make an engine
   pass — except for the mechanical removal of the now-deleted `effort` field.
2. Recompute `midProgram.ladders` and **justify every value in prose**: session number
   and the rule that fired. A snapshot copied out of your engine cannot test your engine.

Keep `midProgramStart`, keep the replay property
(`history.reduce(applySession, midProgramStart) === midProgram`) as the headline test,
and keep the five-different-trajectories property. Note that with `easy` gone, the
squat trajectory that ruling 1 created will change again — and the log staleness that
introduced should now **resolve itself**, which is worth asserting.

### 5. Re-run the simulation

The harness loses its effort models. Rework it so the synthetic user is defined purely
by capability, and re-measure:
- **Sessions to reach a given rung** from the new mid-ladder start.
- **Convergence** for a static-capability user — still the property most at risk.
- **Zero overshoot** (`sessionsAboveCapability === 0`).
- **Descending calibration actually works:** a user started *above* their capability
  must walk down to it and settle, without oscillating. This is a new property and the
  whole justification for mid-ladder starts, so it needs its own test.
- The **time-ladder over-advance** figure, which should now improve substantially since
  the unreliable signal is gone. Report the number.

## Acceptance

- `npm run typecheck`, `npm run lint`, `npm test` all clean. No test deleted merely
  because it referenced `effort` — if it was asserting real behaviour, port it.
- The replay property holds; you derived the new fixture values by hand before running.
- A v1 document with `effort` fields loads through `migrate` and round-trips as v2.
- The descending-calibration test passes and is genuinely adversarial (start 3+ rungs
  too high).
- Report the measured numbers, not adjectives.

---

## Outcome — 2026-07-29

Shipped. **407 tests, typecheck and lint clean.** (The brief's "~470 tests" baseline was
wrong; it was 360.)

**Descending calibration is proven, and path-independent** — the result this brief existed
to establish. A user planted 4–6 rungs above capability walks down **monotonically** (not
one advance in 400 sessions) at exactly 3 missed sessions per rung, then settles. Stronger:
a user planted at the **top rung of every ladder converges to the same tail band** as one
starting from a fresh mid-ladder document, on every pattern and every seed. Mid-ladder
starts are therefore safe.

**`advancesAboveCapability === 0`** and post-calibration overshoot 0 across 9600 sessions.
Raw `sessionsAboveCapability` is 144, and the agent **reported it split rather than as a
single 0** — every one belongs to the walking-down phase of a user who cannot complete the
bottom of any ladder, which is the design working. That distinction is the honest reporting
this brief needed.

**The starting-rung safety cap is enforced as a rule, not a list.** `NEVER_A_STARTING_RUNG`
plus a test asserting any id matching `nordic|pistol|archer|hollow|l-sit` must be in it, so
a future ladder reorder cannot slide a dangerous rung into an entry position. Hinge is
deliberately the most conservative — the only pattern whose too-hard failure is a named
injury.

**Migration works and is not a repair tool.** A v1 document rebuilt with `effort` on all 30
exercises loads, produces exactly `midProgram`, re-serialises byte-identically with
`schemaVersion: 2`, and reloads idempotently. A v1 file broken for an unrelated reason is
still rejected; an `effort` key in a document already claiming v2 is reported as unknown
rather than silently dropped.

### Two findings that contradicted the brief

**1. Convergence broke, and this is the real cost of the no-effort decision.** Deleting
"completed but rated hard → hold" deleted the engine's **only interior fixed point**. A
static-capability user now **oscillates over two adjacent rungs** rather than settling —
identical tail bands across 8 zero-noise seeds, costing 0–37.5% of tail sessions. It
oscillates rather than wanders (band width never exceeds 2), but it does not converge.
Filed as open question 5; the fix (hysteresis on repeated deloads from the same rung) is an
engine rule change and therefore the user's call.

**2. The over-prescription did NOT improve: 605 → 633 of 2400 (26.4%).** The brief predicted
a large improvement and was wrong, for two reasons the agent identified precisely: the
effort signal was never the *cause* — the 16/2400 figure was bought by the *hold* it
enabled — and it is not a time-ladder pathology at all, since rep ladders show 13.9% on the
same curve. Time ladders are ~2× worse for a purely arithmetic reason (a 5s step across
20–45s overshoots proportionally more than a 1-rep step across 5–12).

**The agent also flagged that this contradicted a live claim in the wiki and declined to
edit a file outside its ownership.** Correct call, and the wiki has been corrected.

### Deviation: the fixture history was re-authored

`midProgramHistory` went from 9 to 21 sessions rather than only having `effort` stripped.
The justification holds: the old `A B C · A B C · A B C` sequence **is not producible by a
7-position cycle at all**, so it was no longer a valid input. `midProgramStart` is
byte-identical and every original per-pattern trajectory is carried forward and extended
rather than revised. It is now three full turns of the 7-cycle with an 8-day gap mid-run,
and a test asserts all five trajectory strings are distinct.

**The squat log staleness resolved itself as predicted** — with no fast-track, nothing can
move a ladder off the log, so `deriveLadderStates` now agrees with `applySession` on all
five patterns.

### For brief 14 (was 09)

- Floor deloads still drop 1 step at rung 0 with **no `rungIndex` change** (10 events), so a
  chart annotation keyed on `rungIndex` alone still misses them.
- **24 of 24 rung advances now collapse the raw target** (v1 had most of them flat), making
  the case for plotting `progressIndex` strictly stronger than before.
