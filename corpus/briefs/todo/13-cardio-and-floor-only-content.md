# Task 13 — Cardio content, floor-only content fixes, and the extras pool

## Context

Three content changes fall out of decisions taken after brief 03 shipped. Read
[decisions.md](../../wiki/decisions.md) (*Cardio gets its own day*, *Zero equipment means
floor and bodyweight only, in one room*) and
[training-science.md](../../wiki/training-science.md) for the evidence behind every number
below. **Do not re-derive the science; it is already reviewed.**

Depends on **brief 12**, which makes `CYCLE` seven positions and gives `CycleDaySpec` a
cardio flag. This brief fills in what a cardio day *contains*.

## Files you OWN

```
src/domain/ladders.ts        cardio content, floor-only fixes, extras pool
src/domain/cardio.ts         if the shape doesn't fit a Ladder — your call, justify it
src/domain/__tests__/ladders.test.ts
```

## Files you must NOT touch

`types.ts`, `engine.ts`, `progress.ts`, `src/persistence/**`, `src/ui/**`, `server/**`.

## 1. Cardio content

**5 rounds of 60s hard / 90s easy**, ~13 min including warmup and cooldown. This is the
shape of the one trial matching these constraints (equipment-free, unsupervised, in-home:
+3.05–3.45 mL/kg/min VO2peak, 100% adherence, no adverse events).

Three constraints that are **not** free parameters:

- **60-second intervals, not 20.** Short-interval HIIT beats nothing but loses to longer
  intervals — 4×4min gave 6.5% VO2max against 3.3% for 8×20s. Do not "optimise" this into
  a Tabata.
- **Lower-body movements only.** Two of the three strength days are upper-body/trunk, so
  burpees and mountain climbers collide with both Day A and Day C. Defaults are
  **high knees** and **fast bodyweight squats**; squat jumps are opt-in only, and never
  adjacent to Day B.
- **Prescribe by breathlessness, never by rep count.** "Cannot speak more than a few
  words", or RPE 8–9. **Intensity is the active ingredient, not reps or speed** — a
  high-rep set on an easy movement ends when the muscle quits, not when the
  cardiovascular system is taxed. Tabata's own author published a note that copying 20/10
  intervals while dropping the intensity requirement produces no VO2max gain. A rep target
  here would let the user self-pace down to nothing, which is exactly the failure mode.

Progression, in order: rounds 4 → 5 → 6, then work 60 → 75 → 90s, then recovery 90 → 60s,
then a higher-intensity movement. **Never by making the movement slower or higher-rep.**

Cap impact work at 2×/week, which the cycle already enforces — this is also the
injury-volume ceiling, not just a programming preference.

**A cardio day trains no ladder**, so it does not use the double-progression engine. If it
does not fit the `Ladder` type cleanly, give it its own shape and say why in a comment
rather than contorting it.

## 2. Floor-only content fixes

"One room, floor only" is now a hard constraint, and two shipped ladders violate it:

- **Hinge rungs 5–6 anchor the heels under a couch** for nordic negatives. Replace with the
  **sliding leg curl** (supine, heels on towels on a smooth floor, hips bridged, extend and
  flex the knees). This is not a downgrade — it biases **biceps femoris**, which the nordic
  does not, and it needs nothing but a floor. Ladder: *double-leg bridge → single-leg bridge,
  heel far from hips → bilateral sliding curl → eccentric-only bilateral → single-leg slide.*
- **Push early rungs use a chair** for the incline. Replace with **wall** and **knee**
  variants, which the ladder already partly has. Keep the easy end genuinely easy — brief
  12's descending calibration needs somewhere to land.

Preserve every cue convention brief 03 established: every rung states its tempo explicitly
including "steady, no pause"; a pause names both duration and location in words; every rung
carries a stop-the-set signal; a cross-reference never replaces an absolute instruction.
Rung ids are **immutable once shipped** — if a replacement changes the movement, it gets a
**new** id rather than reusing the old one, because old ids are referenced by persisted
history.

## 3. Extras pool — "extra exercises if needed"

Optional add-ons that hang off the **end** of a finished session, never in front of it.
Prioritised, floor-only, each filling a named gap:

| # | Movement | Gap it fills |
|---|---|---|
| 1 | **Prone trunk extension** (floor; arms overhead to lengthen the lever) | Spinal erectors — the **best-evidenced posture lever**, currently absent entirely |
| 2 | **Sliding leg curl** (towels) | Hamstrings, biceps femoris |
| 3 | **Pike push-up** | Lateral/anterior deltoid, overhead pattern |
| 4 | **Single-leg calf raise** (flat floor) | Plantar flexors — currently zero stimulus |
| 5 | **Towel biceps curl against your own leg** | Elbow flexors — otherwise zero |
| 6 | **Copenhagen plank**, short-lever knee version on the floor | Adductors |
| 7 | **Prone towel-slide pull-down** | Partial lat substitute |
| 8 | **Deep squat hold + thoracic rotation** | Mobility. Last deliberately — weakest evidence |

Progress extras by time or reps within the same modifier logic; they do **not** need full
ladders.

**Honesty requirements in the copy, and these are not optional:**
- #7 and any self-resisted pull work have **no training literature at all.** Mechanistically
  plausible, entirely unquantified. Copy must never imply they replace a pull.
- The app must state plainly that **no pulling strength is trainable** in this setup, and
  that lats, elbow flexors and grip get essentially nothing. Prone Y-T-W raises are real
  mid-trapezius work and do **nothing** for the lats.
- Do not present posture work as a health outcome. Evidence that exercise changes resting
  scapular position is **absent**, and posture-to-pain causation is unestablished and
  age-confounded. Appearance and comfort are honest; health is not.

## Acceptance

- `npm run typecheck`, `npm run lint`, `npm test` clean.
- Tests assert: cardio prescribes by time and **never** by rep count; the interval is 60s;
  cardio movements are all lower-body; no ladder or extra references furniture, stairs or
  any object beyond a towel and the floor (grep the cue text for `chair`, `couch`, `sofa`,
  `bed`, `stair`, `door`, `table`).
- Tests assert rung id uniqueness still holds, and that replaced movements got **new** ids.
- A test asserts the pull ladder still carries its postural marker and that no pull rung
  name borrows row or pull-up vocabulary.
- Print the full content set as a readable table and re-run brief 03's discriminability
  gate on the changed rungs: read adjacent rungs back to back and confirm the cues alone
  tell you what to do differently. **Report your honest verdict.**
