# Task 04 — Progression engine + simulation harness

## Context

**The highest-value brief in the project.** If this is wrong, nothing downstream
matters: the app will confidently prescribe work that is too easy (boring, you quit)
or too hard (you fail, you quit), and because the prescription looks authoritative
you will not immediately realise the engine is the problem.

The rules are fully specified in
[progression-engine.md](../../wiki/progression-engine.md) — read it first, and read
[decisions.md](../../wiki/decisions.md) for what must *not* be built (no LLM
planning, no adaptive autoregulation, no calendar arithmetic anywhere).

Pure functions only. `src/domain/` may not import a browser API and **may not read
the clock** — every timestamp arrives as a parameter. That constraint is what makes
the simulation harness below possible, so do not work around it.

## Files you OWN

```
src/domain/engine.ts
src/domain/progress.ts
src/domain/__tests__/engine.test.ts
src/domain/__tests__/simulate.ts          the harness
src/domain/__tests__/simulate.test.ts     assertions over simulated runs
```

## Files you must NOT touch

`types.ts` (brief 02), `ladders.ts` (brief 03), anything outside `src/domain/`.

## What to do

1. **`isClean(result: ExerciseResult): boolean`** — every set hit its target **and**
   last-set effort ≠ `'hard'`. Its own function, its own tests. The entire advance
   rule hangs off this predicate.
2. **`nextSession(state: StateDoc): Prescription`** — resolve the `CycleDay` from
   `cyclePosition`, then for each pattern that day trains, emit the rung and target.
   Include the previous session's actuals for that rung so the UI can render
   *"Last time: 3×7"*.
3. **`applySession(state: StateDoc, result: SessionResult): StateDoc`** — the only
   function that mutates rungs or cycle position. Returns a new document; never
   mutates its input. Apply, per pattern:
   ```
   target < max  AND clean          → target + 1
   target = max  AND clean, 2nd time → rungIndex + 1, target = min
   target = max  AND effort 'easy'   → rungIndex + 1, target = min   (immediate, repeatable)
   not clean, 2nd consecutive        → hold (unchanged prescription)
   not clean, 3rd consecutive        → rungIndex − 1, target = min
   ```
   Then `sessionsCompleted + 1` and `cyclePosition + 1`. **Cycle position advances
   on completion, never on a date** — there must be no date arithmetic in this file.
4. Clamp both ends: `rungIndex` never exceeds the last rung and never drops below 0.
   At the top of a ladder with a clean top target, hold and surface a
   `ladderMaxed` flag rather than silently doing nothing — the user deserves to know
   they've run out of ladder.
5. **`deriveLadderStates(history)`** — fold history into ladder states. Whether this
   is authoritative or a repair tool is decided in brief 02's header comment; follow
   that decision. Either way it exists, because it makes a corrupted counter
   repairable by replay.
6. **`targetStep(unit)` and `stepsPerRung(unit)`** — decided at the wave-3 gate
   (see [progression-engine.md](../../wiki/progression-engine.md)):
   ```
   targetStep(unit)    → unit === 'seconds' ? 5 : 1
   stepsPerRung(unit)  → unit === 'seconds' ? 6 : 8
   reps     5 6 7 8 9 10 11 12     seconds  20 25 30 35 40 45
   ```
   Time ladders step by **5 seconds, not 1** — a one-second step would mean 26
   sessions to clear one rung of planks. Both derive from `unit`; do **not** add a
   field to `types.ts` or `ladders.ts`. Every target bump in step 3 uses
   `targetStep`, not `+ 1`.
7. **`progressIndex(rungIndex, target, ladder)`** in `progress.ts` →
   `rungIndex × stepsPerRung(unit) + (target − targetMin) / targetStep(unit)`.
   Plus a series-derivation function turning `history` into per-pattern
   `{ sessionsCompleted, progressIndex }[]`. **Never expose a raw-reps series** — a
   rep chart sawtooths on rung advance and shows regression exactly when the user
   got stronger.
7. **Build the simulation harness.** A synthetic user with a configurable "true
   capability" per pattern; it answers each prescription realistically (hits the
   target if within capability, rates effort by headroom, fails otherwise), and
   capability creeps up slowly over simulated sessions. Run 200+ sessions and assert
   the engine's aggregate behaviour, not just single transitions.

## Acceptance

- **The replay property, and this is the headline test:**
  ```
  midProgramHistory.reduce(applySession, midProgramStart)  deep-equals  midProgram
  ```
  Both are exported from `src/domain/__tests__/fixtures.ts`. The fixture was
  repaired at the wave-3 gate specifically so this holds — if it fails, work out
  which side is wrong before changing either, and **say so rather than adjusting the
  fixture to match your engine.** The fixture encodes five deliberately different
  trajectories (fast-track, clean-at-max, a two-deep missed streak, a sub-max `easy`
  bump, and a time-ladder fast-track), so this single assertion covers most of the
  rule table.
- `npm test` passes; unit tests cover every rule branch in step 3 including both
  clamps and the exact 2nd/3rd-consecutive boundaries.
- `applySession` is verified non-mutating (deep-freeze the input in a test).
- A test asserts every rung id appearing in `midProgramHistory` resolves in
  `LADDERS` (brief 03 left this for you).
- **Simulation assertions:**
  - A user whose true capability is rung 5 reaches rung ~5 within ~10 sessions via
    the fast-track, and **does not overshoot past it**.
  - A user with static capability converges to a stable rung and stays there — no
    oscillation between advance and regress.
  - `progressIndex` is non-decreasing across any run where capability is
    non-decreasing. This is the property that makes the chart honest.
  - No run ever produces a `rungIndex` outside a ladder's bounds.
- **Probe open question 1 explicitly** ([open-questions.md](../../wiki/open-questions.md)):
  simulate the time-based core ladder with a capability curve that plateaus abruptly
  (holds feel easy, then suddenly don't) and report whether the `easy` fast-track
  over-advances. **Report the finding — do not silently change the rule.** If it
  over-advances, the answer goes in the outcome note and the user decides.

---

## Outcome — 2026-07-29

Shipped in two rounds. **112 tests** (engine 83, simulate 29). Tree green.

### Round 1

**The replay property holds** — asserted two ways, with neither side edited. Two stronger
corollaries: `deriveLadderStates(midProgramHistory)` equals `midProgram.ladders`, and
across 32 runs / 9600 sessions the forward mutator and the replay repair tool agree.
**Zero overshoot in every run**, including pathological users.

**Deviation accepted:** `missedTarget` (drives the hold/regress streak) was split from
`isClean` (drives advancement). Under the brief's looser wording there is no fixed point
anywhere in the rule table — a user at their ceiling completing *every prescribed rep*
but rating `hard` would be deloaded a full rung every three sessions forever. SPEC says
"missed target", so the split matches it. The third case is now explicit: **every rep
done but rated `hard` → hold**, which is the engine's only fixed point.

**The finding that mattered most was not the one it was sent to probe.** Calibration took
**41 push-sessions to reach rung 5** — roughly four months on a daily cycle — because the
fast-track only fired *at* `targetMax`, so a rung still cost seven +1 bumps first. The
fast-track saved exactly one session per rung. SPEC's "self-calibrates in ~3 sessions"
was wrong by an order of magnitude.

### Round 2 — three user rulings implemented

1. **Fast-track from any target.** Sessions to rung 5: **41 → 6.**
2. **No fast-track on time-based ladders** — one predicate,
   `allowsFastTrack(ladder) = ladder.unit !== 'seconds'`, asserted `easy ≡ ok` at 20s,
   30s and 45s.
3. **Deload to the lower rung's `targetMax`.** Drops are now 2 or 8 index steps where the
   old rule cost 9 and 15, and the re-climb is one clean session.

**Extension the agent had to make, correctly flagged as its own choice:** at rung 0 there
is no lower rung to take a `targetMax` from, so a deload steps the target down once,
floored at `targetMin`.

**Convergence and zero-overshoot both survive** the aggressive fast-track — 0 regressions
for a static-capability user, strictly increasing trajectories, and the last 25 sessions
repeating one prescription. The run set is pinned at 833 advances / 268 deloads so it
cannot quietly stop exercising the rules.

**Cost of ruling 1, stated honestly:** a capable user's push ladder overshoots to rung 8,
takes 3 deloads, and settles at rung 5 — the same place the 41-session crawl ended. 35
sessions of under-stimulation traded for three deload cycles.

**Ruling 3 made the time-ladder over-advance worse: 457 → 605 of 2400 (25.2%).** The deep
deload had been an accidental brake — 6–8 sessions of easy re-climbing after every failed
advance. A shallow deload re-climbs in 1–2, so the ladder completes far more
advance-fail-deload cycles. Ruling 2 removed the fast-track but not the mechanism. The
effort signal remains the only lever that moves it: **605 → 16 with a warning band.**

### Fixture

`midProgramHistory` is **byte-identical** — hand-authored input was not rewritten to make
an engine pass. Only `squat` and `pull` end states moved, exactly as predicted, and each
value now carries its session number and the rule that fired.

**Knock-on nobody foresaw:** ruling 1 advances squat at session 2, so sessions 5 and 8
log work at a rung the engine had already left. Replay is still exact (`applySession`
reads state, not the log), but that history could no longer be *produced* by the engine.
Left in place and documented, and it now pins the `applySession`-vs-`deriveLadderStates`
distinction precisely.

### For brief 09

- A rung-0 deload lowers `progressIndex` with **no `rungIndex` change** (7 occurrences).
  An advance annotation keyed on `rungIndex` alone misses it — it must read the target too.
- **New under ruling 1:** most advances no longer drop the raw target at all, so a
  raw-value chart now shows a user moving to a harder movement as making *no progress*
  rather than as regressing.
