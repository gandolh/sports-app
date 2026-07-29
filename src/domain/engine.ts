/**
 * The progression engine. Three exported entry points matter:
 *
 *   nextSession(state)           → Prescription    what to do today
 *   applySession(state, result)  → StateDoc        the ONLY rung/cycle mutator
 *   deriveLadderStates(history)  → LadderState[]   an explicitly-invoked repair tool
 *
 * Pure, deterministic, clock-free. Every timestamp arrives inside a
 * `SessionResult`; nothing here reads a clock, a browser API or a random number.
 * That is enforced by `eslint.config.js`, and it is what makes
 * `__tests__/simulate.ts` able to replay hundreds of synthetic sessions.
 *
 * ── `applySession` never reads `history` ────────────────────────────────────
 *
 * `state.ladders` is authoritative on read (see the header of `types.ts`).
 * `applySession` decides everything from `state.ladders` plus the incoming
 * `SessionResult`; it appends to `history` but never consults it. That is what
 * makes a hand-edited `rungIndex` take effect on the very next session.
 *
 * ── One predicate, load-bearing ─────────────────────────────────────────────
 *
 * **There is no effort input anywhere in the app** (locked 2026-07-29,
 * corpus/wiki/decisions.md). No post-set rating, no pre-session difficulty
 * picker. So the engine has exactly one question to ask of a logged exercise:
 *
 *   isCompleted(result)  every set hit its target value
 *
 * Advancement keys only on that. `missedTarget` is now its exact negation and is
 * kept as a separate name because `missedStreak` reads in those terms, not
 * because the two questions can differ any more.
 *
 * What went with the effort input, and why each is not missed:
 *
 *   - `isClean` / the `Effort` type — the input they read no longer exists.
 *   - the `easy` fast-track (both wave-4 rulings 1 and 2, and `allowsFastTrack`)
 *     — it was the only calibration mechanism, and it has been replaced by
 *     **descending calibration**: ladders start mid-ladder
 *     (`Ladder.startRungIndex`) and the 3-miss regress rule walks the user down.
 *   - "all reps done but rated `hard` → hold" — this was the engine's only
 *     interior fixed point. Deleting it is the honest cost of the decision: a
 *     static-capability user no longer parks on one prescription forever, they
 *     oscillate over a two-rung band around their ceiling. That is measured
 *     rather than asserted away, in `__tests__/simulate.test.ts`.
 *
 * The 25% hold over-advance the simulation found is therefore fixed by
 * *deleting* the unreliable isometric effort signal rather than by refining it.
 *
 * ── The target step ─────────────────────────────────────────────────────────
 *
 * Decided at the wave-3 gate: rep ladders step by 1 (5→12, eight targets per
 * rung), time ladders by 5 (20→45, six targets per rung). Both derive from
 * `Ladder.unit`, so neither `types.ts` nor `ladders.ts` carries a new field.
 *
 * ── The one wave-4 ruling that survives ─────────────────────────────────────
 *
 * **A deload drops to the lower rung's `targetMax`, not its `targetMin`.**
 * Resetting to the bottom of the rung below undid work the user had already
 * completed: a 5–11 step cliff on the progress chart and a 6–8 session re-climb.
 * Dropping to the top of the lower rung costs 6–7 chart steps and a two-session
 * re-climb (measured). At rung 0 there is no lower rung, so the target instead
 * steps down once (floored at `targetMin`) — the same "one step easier" shape, and
 * the only deload available at the bottom of a ladder.
 *
 * Rulings 1 and 2 both concerned the `easy` fast-track and are moot.
 *
 * ── A cardio day trains no ladder ───────────────────────────────────────────
 *
 * `CYCLE` has seven positions and two of them are cardio. A cardio session
 * carries no exercises, so `applySession` mutates no ladder state while still
 * advancing `sessionsCompleted` and `cyclePosition`. That falls out of the
 * per-exercise loop rather than needing a special case — but it is a real
 * behaviour with its own tests, because "a session that changes nothing" is
 * exactly the kind of case a later refactor breaks silently.
 */
import type {
  CycleDay,
  ExerciseResult,
  IsoTimestamp,
  Ladder,
  LadderState,
  Pattern,
  Rung,
  RungId,
  SessionResult,
  SetResult,
  StateDoc,
  TargetUnit,
} from './types.ts'
import { PATTERNS, cycleDayAt } from './types.ts'
import { LADDERS, getRung } from './ladders.ts'

// ─── Constants ──────────────────────────────────────────────────────────────

/** Every prescription is three sets. See SPEC.md, "session shape". */
export const SETS_PER_EXERCISE = 3

/**
 * Completed sessions at `targetMax` needed to advance a rung.
 *
 * With the fast-track gone this is the *only* route up any ladder, rep or time.
 */
export const CLEAN_AT_MAX_TO_ADVANCE = 2

/** Consecutive missed-target sessions that hold the prescription rather than regress. */
export const MISSES_TO_HOLD = 2

/** Consecutive missed-target sessions that drop a rung. */
export const MISSES_TO_REGRESS = 3

// ─── Unit arithmetic ────────────────────────────────────────────────────────

/**
 * How much one clean sub-max session adds to the target.
 *
 * Five seconds, not one: a one-second step would mean 26 sessions to clear a
 * single rung of planks, and `progressIndex` would stop being comparable across
 * units.
 */
export function targetStep(unit: TargetUnit): number {
  return unit === 'seconds' ? 5 : 1
}

/**
 * Distinct targets in one rung — the stride `progressIndex` takes per rung.
 *
 *   reps     5 6 7 8 9 10 11 12   → 8
 *   seconds  20 25 30 35 40 45    → 6
 */
export function stepsPerRung(unit: TargetUnit): number {
  return unit === 'seconds' ? 6 : 8
}

/** Highest valid `rungIndex` for a pattern, mirroring `ladders.topRungIndex`. */
function topIndex(pattern: Pattern): number {
  return LADDERS[pattern].rungs.length - 1
}

/**
 * Position of `rungId` inside its pattern's ladder, or `-1`.
 *
 * Rung ids embed a **1-based** number (`push-03-knees`) while `rungIndex` and
 * `getRung` are **0-based**, so this resolves by identity rather than by parsing
 * the id. Getting that backwards was half of a real defect in this project.
 */
export function rungIndexOf(pattern: Pattern, rungId: string): number {
  return LADDERS[pattern].rungs.findIndex((rung) => rung.id === rungId)
}

// ─── The predicates ─────────────────────────────────────────────────────────

/**
 * Every set hit its target value. The whole of the engine's input.
 *
 * The entire advance rule hangs off this, which is why it is one named function
 * with its own tests rather than an inlined condition. An exercise with no sets
 * is never completed — **an empty log is not evidence of success.** The engine
 * must never assume completion: if "Done" were the only signal it would believe
 * every set was hit and march the user up into movements they cannot perform.
 */
export function isCompleted(result: ExerciseResult): boolean {
  if (result.sets.length === 0) return false
  return result.sets.every((set) => set.actualValue >= set.targetValue)
}

/**
 * Some set fell short of its target. Drives `missedStreak`.
 *
 * Now the exact negation of `isCompleted` — the third case (`every rep done but
 * rated hard`) went with the effort input. Kept as its own name because two
 * rules are stated in terms of a *miss* ("2 holds, 3 regresses") and reading
 * `!isCompleted` at those call sites obscures which rule is firing.
 */
export function missedTarget(result: ExerciseResult): boolean {
  return !isCompleted(result)
}

/**
 * The user has run out of ladder: top rung, target already at the cap.
 *
 * Surfaced on the prescription so the UI can say so. Holding silently at the top
 * of a ladder while the user waits for an advance that can never come is the
 * failure mode this flag exists to prevent.
 */
export function isLadderMaxed(pattern: Pattern, state: LadderState): boolean {
  const ladder = LADDERS[pattern]
  return state.rungIndex >= topIndex(pattern) && state.target >= ladder.targetMax
}

// ─── nextSession ────────────────────────────────────────────────────────────

/** The previous logged performance of a pattern, for the "Last time: 3×7" line. */
export interface LastTime {
  readonly rungId: RungId
  readonly completedAt: IsoTimestamp
  readonly sets: readonly SetResult[]
  /**
   * `false` after a rung advance or regress: the numbers were earned on a
   * different movement, so the UI must not present them as a like-for-like
   * comparison. Kept rather than dropped because "last time, on the easier
   * version" is still worth showing.
   */
  readonly sameRung: boolean
}

export interface PrescribedExercise {
  readonly pattern: Pattern
  readonly rungIndex: number
  readonly rung: Rung
  readonly unit: TargetUnit
  /** `postural` ladders must be labelled as such by the UI (`POSTURAL_NOTICE`). */
  readonly kind: Ladder['kind']
  readonly sets: number
  readonly target: number
  readonly ladderMaxed: boolean
  readonly lastTime?: LastTime
}

export interface Prescription {
  /** 1-based ordinal of the session about to be performed. */
  readonly sessionNumber: number
  readonly cyclePosition: number
  readonly day: CycleDay
  readonly label: string
  /**
   * A cardio day. `exercises` is empty and no ladder will move; the UI renders
   * the cardio prescription instead (brief 13 owns its content).
   */
  readonly cardio: boolean
  readonly exercises: readonly PrescribedExercise[]
}

/**
 * Today's prescription, resolved from `cyclePosition` and `ladders`.
 *
 * Reads `history` for one purpose only — the previous actuals for each pattern.
 * Rungs and targets come from `state.ladders`, which is authoritative.
 *
 * On a cardio position `spec.patterns` is empty, so this returns no exercises and
 * touches no ladder. No branch is needed and none is written: the cardio day is
 * expressed entirely in the cycle content.
 *
 * Throws (via `getRung`) if a `rungIndex` points past the end of a ladder. That
 * is deliberate: a hand-edited state file with an impossible rung must fail
 * loudly rather than render a blank card and log a session against nothing.
 */
export function nextSession(state: StateDoc): Prescription {
  const spec = cycleDayAt(state.cyclePosition)
  const exercises = spec.patterns.map((pattern) => {
    const ladderState = state.ladders[pattern]
    const ladder = LADDERS[pattern]
    const rung = getRung(pattern, ladderState.rungIndex)
    const previous = lastPerformance(state.history, pattern)
    const base: PrescribedExercise = {
      pattern,
      rungIndex: ladderState.rungIndex,
      rung,
      unit: ladder.unit,
      kind: ladder.kind,
      sets: SETS_PER_EXERCISE,
      target: ladderState.target,
      ladderMaxed: isLadderMaxed(pattern, ladderState),
    }
    if (!previous) return base
    return {
      ...base,
      lastTime: {
        rungId: previous.exercise.rungId,
        completedAt: previous.completedAt,
        sets: previous.exercise.sets,
        sameRung: previous.exercise.rungId === rung.id,
      },
    }
  })

  return {
    sessionNumber: state.sessionsCompleted + 1,
    cyclePosition: state.cyclePosition,
    day: spec.day,
    label: spec.label,
    cardio: spec.cardio,
    exercises,
  }
}

function lastPerformance(
  history: readonly SessionResult[],
  pattern: Pattern,
): { readonly completedAt: IsoTimestamp; readonly exercise: ExerciseResult } | undefined {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const session = history[i]
    if (!session) continue
    for (let j = session.exercises.length - 1; j >= 0; j -= 1) {
      const exercise = session.exercises[j]
      if (exercise?.pattern === pattern) {
        return { completedAt: session.completedAt, exercise }
      }
    }
  }
  return undefined
}

// ─── applySession ───────────────────────────────────────────────────────────

/**
 * The one rung/cycle mutator. Returns a new document; never mutates its input.
 *
 * Per pattern trained, applies the rule table below. Then
 * `sessionsCompleted + 1`, `cyclePosition + 1`, and the result appended to
 * `history`. **Cycle position advances on completion, never on a date** — there
 * is no date arithmetic in this file, so a missed day is not an expressible
 * concept.
 *
 * Patterns the session did not train are returned untouched: not training a
 * pattern is not a miss. A **cardio session carries no exercises at all**, so it
 * mutates no ladder while still counting as a completed session and advancing the
 * cycle — the loop below simply does not execute.
 */
export function applySession(state: StateDoc, result: SessionResult): StateDoc {
  const ladders: Record<Pattern, LadderState> = { ...state.ladders }
  for (const exercise of result.exercises) {
    const before = ladders[exercise.pattern]
    ladders[exercise.pattern] = nextLadderState(exercise.pattern, before, exercise)
  }
  return {
    ...state,
    sessionsCompleted: state.sessionsCompleted + 1,
    cyclePosition: state.cyclePosition + 1,
    ladders,
    history: [...state.history, result],
  }
}

/**
 * The rule table, in one place, and it is now the whole of the engine's logic:
 *
 *   missed target, 1st or 2nd consecutive  → hold (prescription unchanged)
 *   missed target, 3rd consecutive         → rungIndex − 1, target = that rung's
 *                                            targetMax (at rung 0: target − step,
 *                                            floored at targetMin)
 *   completed, target < max                → target + targetStep(unit)
 *   completed, target = max, 2nd time      → rungIndex + 1, target = targetMin
 *   completed, target = max, 1st time      → hold, cleanAtMax = 1
 *
 * Five rows, one input. Difficulty grows exactly one step per completed session,
 * and the only route up a rung — on every ladder, rep or time — is two completed
 * sessions at `targetMax`.
 *
 * Every returned `rungIndex` and `target` is clamped into the ladder, so
 * `applySession` can never *produce* an out-of-range value even from a
 * hand-edited one. Targets are clamped to the range but **not** snapped to the
 * step grid: `target: 100` on a ladder capped at 12 is a broken value, while
 * `target: 22` on a 20/25/30 ladder is a perfectly trainable preference and not
 * the engine's business to overrule.
 */
function nextLadderState(
  pattern: Pattern,
  before: LadderState,
  result: ExerciseResult,
): LadderState {
  const ladder = LADDERS[pattern]
  const top = topIndex(pattern)
  const step = targetStep(ladder.unit)
  const clamp = (index: number): number => Math.min(top, Math.max(0, index))
  const clampTarget = (value: number): number =>
    Math.min(ladder.targetMax, Math.max(ladder.targetMin, value))

  if (missedTarget(result)) {
    const missedStreak = before.missedStreak + 1
    if (missedStreak >= MISSES_TO_REGRESS) {
      // Deload — and with the fast-track gone this is also the entire calibration
      // mechanism: it is what walks a user down from a starting rung that turned
      // out to be too hard. One step easier, not a cliff: drop to the *top* of the
      // rung below, which — since the only way onto this rung was two completed
      // sessions at that very target — is provably something the user has done. So
      // the re-climb costs two sessions rather than a whole rung's worth. At rung 0
      // there is no rung below, so the target steps down instead, which is what
      // keeps calibration working after the rung has bottomed out.
      //
      // `missedStreak` resets: the deload is the corrective action, so the count
      // starts again rather than dropping a rung every session.
      const atFloor = before.rungIndex <= 0
      return {
        rungIndex: clamp(before.rungIndex - 1),
        target: atFloor ? clampTarget(before.target - step) : ladder.targetMax,
        cleanAtMax: 0,
        missedStreak: 0,
      }
    }
    return {
      rungIndex: clamp(before.rungIndex),
      target: clampTarget(before.target),
      cleanAtMax: 0,
      missedStreak,
    }
  }

  // Every set hit its target from here down.

  const atMax = before.target >= ladder.targetMax
  // Only counts consecutive completed sessions *at* the cap, so a sub-max session
  // clears it.
  const cleanAtMax = atMax ? before.cleanAtMax + 1 : 0

  if (atMax && cleanAtMax >= CLEAN_AT_MAX_TO_ADVANCE) {
    if (before.rungIndex < top) {
      return {
        rungIndex: clamp(before.rungIndex + 1),
        target: ladder.targetMin,
        cleanAtMax: 0,
        missedStreak: 0,
      }
    }
    // Out of ladder. Fall through: at the cap the state saturates into a fixed
    // point. `nextSession` surfaces `ladderMaxed`, so running out of ladder is
    // never silent.
  }

  if (!atMax) {
    return {
      rungIndex: clamp(before.rungIndex),
      target: clampTarget(before.target + step),
      cleanAtMax: 0,
      missedStreak: 0,
    }
  }

  return {
    rungIndex: clamp(before.rungIndex),
    target: clampTarget(before.target),
    // Saturated at the top of the ladder so repeated clean sessions there are a
    // fixed point rather than an ever-growing counter.
    cleanAtMax: before.rungIndex >= top ? CLEAN_AT_MAX_TO_ADVANCE : cleanAtMax,
    missedStreak: 0,
  }
}

// ─── deriveLadderStates ─────────────────────────────────────────────────────

/**
 * Every ladder at its **starting rung** with the target at the bottom of the range.
 *
 * Not rung 0. Calibration is descending: `Ladder.startRungIndex` is a rung a
 * returning beginner plausibly can perform, and if it turns out they cannot, three
 * missed sessions walk them down one rung and keep doing so until it fits. The
 * starting target is still `targetMin`, so the *only* thing that starts
 * mid-ladder is the movement, never the volume.
 *
 * The start rungs are a safety cap with the reasoning written per ladder in
 * `ladders.ts` — see `START_RUNGS` there before changing one.
 */
export function freshLadderStates(): Record<Pattern, LadderState> {
  const states = {} as Record<Pattern, LadderState>
  for (const pattern of PATTERNS) {
    const ladder = LADDERS[pattern]
    states[pattern] = {
      rungIndex: Math.min(ladder.startRungIndex, ladder.rungs.length - 1),
      target: ladder.targetMin,
      cleanAtMax: 0,
      missedStreak: 0,
    }
  }
  return states
}

/**
 * Rebuild `ladders` by replaying `history`. **A repair tool, invoked explicitly —
 * never an automatic step** (see the header of `types.ts`): running it
 * implicitly would silently revert every hand-edit, which is the whole reason
 * the state file is hand-editable.
 *
 * It trusts history over its own running total. Each logged exercise carries the
 * rung id and the target it was actually performed at, so those are used as the
 * "before" state for that session and only the streak counters are carried
 * forward. That is what makes a corrupted `cleanAtMax` or `missedStreak`
 * recoverable, and it also survives a mid-program hand-edit — the history
 * records the edit's effect.
 *
 * A rung id that no longer resolves (a renamed rung, a hand-typed one) falls
 * back to the carried rung index rather than throwing: a repair tool that
 * crashes on the data it was invoked to repair is useless.
 */
export function deriveLadderStates(
  history: readonly SessionResult[],
): Record<Pattern, LadderState> {
  const states = freshLadderStates()
  for (const session of history) {
    for (const exercise of session.exercises) {
      const carried = states[exercise.pattern]
      const loggedIndex = rungIndexOf(exercise.pattern, exercise.rungId)
      const loggedTarget = exercise.sets[0]?.targetValue
      const observed: LadderState = {
        rungIndex: loggedIndex >= 0 ? loggedIndex : carried.rungIndex,
        target: loggedTarget ?? carried.target,
        cleanAtMax: carried.cleanAtMax,
        missedStreak: carried.missedStreak,
      }
      states[exercise.pattern] = nextLadderState(exercise.pattern, observed, exercise)
    }
  }
  return states
}
