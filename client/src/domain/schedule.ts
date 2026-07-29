/**
 * The fixed schedule — the whole of the app's logic, and there is very little of
 * it. Replaces v2's `engine.ts` (2026-07-29).
 *
 *   prescribe(state, variant)        → Prescription    what to do today
 *   toSessionResult(prescription, t) → SessionResult   what finishing it records
 *   recordSession(state, result)     → StateDoc        counters up, history appended
 *
 * **Nothing here branches on what the user did**, because nothing is measured.
 * There is no rule table, no advance/hold/regress, no `isCompleted`, no
 * `actualValue`. The prescription is a pure function of `sessionsDone`, so the
 * class of bug the v2 engine could have — a rule that reads a signal wrongly — is
 * not expressible (corpus/wiki/progression-engine.md).
 *
 * ── Interpolation, not accumulation ─────────────────────────────────────────
 *
 *   rungIndex        = min(startRungIndex + ⌊sessionsDone / sessionsPerRung⌋, top)
 *   sessionsIntoRung = sessionsDone mod sessionsPerRung
 *   target           = round(min + sessionsIntoRung / (sessionsPerRung − 1) × (max − min))
 *
 * The denominator is `sessionsPerRung − 1`, not `sessionsPerRung`, so that
 * `sessionsIntoRung`'s range of `0 .. per−1` maps exactly onto `0 .. 1` and the
 * declared caps are **values rather than asymptotes**: `min` is prescribed on the
 * first session of a rung and `max` on the last. With `per` as the denominator the
 * fraction stopped at `(per−1)/per`, which reached the cap only when rounding
 * happened to close the gap — the 20→60s plank topped out at 59s and never once
 * prescribed 60. A rung still takes exactly `per` sessions either way.
 *
 * Three properties fall out of this rather than being implemented, and all three
 * are the *reason* for this formulation rather than a per-rung step:
 *
 *   1. **Every rung takes `sessionsPerRung` sessions**, however wide its span.
 *      That is the law — a rung takes about six weeks — expressed directly.
 *   2. **The top rung cycles.** Once `rungIndex` clamps, the modulo keeps
 *      running, so the target sweeps min→max→min forever. There is deliberately
 *      **no special case** for it; a special case here would mean the formula is
 *      wrong. Running out of ladder is the honest ceiling of floor-only training,
 *      not a failure state.
 *   3. **Re-tuning a rung's range moves nobody's rung index**, because nothing
 *      accumulated depends on the old numbers. That is what makes the hold caps
 *      cheap to revise.
 *
 * Pure, deterministic, clock-free. Every timestamp arrives inside a
 * `SessionResult`; nothing here reads a clock, a browser API or a random number.
 * Enforced by `eslint.config.js`.
 */
import { CARDIO, LADDERS, getRung } from './ladders.ts'
import { DAILY_BLOCK, slotAt } from './types.ts'
import type { CardioProtocol, Rung } from './types.ts'
import type {
  IsoTimestamp,
  Pattern,
  Range,
  SessionResult,
  StateDoc,
  TargetUnit,
  Variant,
} from '@sports-app/shared/types.ts'

// ─── How much work ──────────────────────────────────────────────────────────

/**
 * Strength patterns run 3 sets, the daily core/posture block 2, to keep a session
 * near twelve minutes. ~7 direct sets/week per strength pattern is the "clearly
 * working but sub-maximal" band; if more is ever wanted the lever is a fourth
 * **set**, not a fourth session — at the cost of ~100s, which breaks the budget
 * (corpus/wiki/programme.md).
 */
export const SETS_PER_STRENGTH = 3
export const SETS_PER_DAILY_BLOCK = 2

/** Rounds on a cardio slot. Sourced from `CARDIO` so there is one number, not two. */
export const CARDIO_ROUNDS = CARDIO.rounds

/**
 * How far the variant moves today's target: ±2 reps, ±5 seconds. A dial, not a
 * signal — see `Variant`.
 */
const VARIANT_STEP: Readonly<Record<TargetUnit, number>> = { reps: 2, seconds: 5 }

/**
 * `easy` never drops below this many reps whatever the range says. Three reps is
 * the point below which a set stops being training at all.
 */
const ABSOLUTE_REP_FLOOR = 3

// ─── The prescription ───────────────────────────────────────────────────────

export interface PrescribedExercise {
  readonly type: 'exercise'
  readonly pattern: Pattern
  /** Carries the name, cues, figureId, modifier and the `safetyCritical` flag. */
  readonly rung: Rung
  readonly rungIndex: number
  readonly unit: TargetUnit
  /** `postural` obliges the UI to surface `POSTURAL_NOTICE`. */
  readonly ladderKind: 'strength' | 'postural'
  readonly sets: number
  /** Post-variant. This is the number on screen and the number recorded. */
  readonly targetValue: number
}

export interface PrescribedCardio {
  readonly type: 'cardio'
  readonly protocol: CardioProtocol
  readonly rounds: number
  /* No target, by design. See `CardioProtocol`. */
}

export type PrescribedItem = PrescribedExercise | PrescribedCardio

export interface Prescription {
  /** The rotation position this was derived from — `state.cyclePosition`. */
  readonly position: number
  /** 'Push' | 'Legs' | 'Cardio'. */
  readonly label: string
  readonly variant: Variant
  /**
   * In the order the player walks through them: the slot's own work first (the
   * strength patterns, or cardio in their place), then the daily block. The daily
   * block is last because it is the same every session and the least
   * fatigue-sensitive thing in it.
   */
  readonly items: readonly PrescribedItem[]
}

// ─── Derivation ─────────────────────────────────────────────────────────────

/**
 * Which rung `pattern` is on after `sessionsDone` sessions of it.
 *
 * Clamped at both ends. The top clamp is the law ("you stay on the top rung and
 * the target cycles"); the bottom clamp exists because a hand-edited negative
 * counter is an expected input for a file people are told to edit.
 */
export function rungIndexAt(pattern: Pattern, sessionsDone: number): number {
  const ladder = LADDERS[pattern]
  const climbed = Math.floor(sessionsDone / ladder.sessionsPerRung)
  const raw = ladder.startRungIndex + climbed
  return Math.min(Math.max(raw, 0), ladder.rungs.length - 1)
}

/**
 * The target span for one rung: its own if it declares one, else the ladder's
 * default. Every `seconds` rung declares its own, because the evidence-based
 * ceilings differ per exercise.
 */
export function rangeAt(pattern: Pattern, rungIndex: number): Range {
  return getRung(pattern, rungIndex).range ?? LADDERS[pattern].range
}

/**
 * Today's `medium` target for `pattern`, in the ladder's unit.
 *
 * The modulo is deliberately positive so that a clamped top rung — where
 * `sessionsDone` keeps growing past the last rung — sweeps min→max→min forever
 * with no special case, and so that a negative hand-edited counter still lands
 * inside the range.
 */
export function targetAt(pattern: Pattern, sessionsDone: number): number {
  const ladder = LADDERS[pattern]
  const { min, max } = rangeAt(pattern, rungIndexAt(pattern, sessionsDone))
  const per = ladder.sessionsPerRung
  const sessionsIntoRung = ((sessionsDone % per) + per) % per
  // `per − 1` so the last session of a rung lands exactly on `max`. Guarded
  // against a one-session rung, where `sessionsIntoRung` is always 0 and the
  // only sensible answer is `min`.
  const fraction = sessionsIntoRung / Math.max(per - 1, 1)
  return Math.round(min + fraction * (max - min))
}

/**
 * The per-session load dial.
 *
 * `hard` is a **no-op at `range.max`, deliberately**: the rep ceiling exists
 * because past ~12–15 bodyweight reps the adaptation drifts from strength to
 * endurance and there is no load to add, and the variant must not become a way
 * around it. `easy` bottoms out at `range.min`, never below three reps.
 *
 * This function is the whole of the variant's effect. It does not touch
 * `sessionsDone`, and nothing downstream may either — an easy day costs no
 * progress and banks no debt, which is the reason a bad day is free.
 */
export function applyVariant(
  target: number,
  unit: TargetUnit,
  variant: Variant,
  range: Range,
): number {
  const step = VARIANT_STEP[unit]
  const floor = unit === 'reps' ? Math.max(range.min, ABSOLUTE_REP_FLOOR) : range.min
  switch (variant) {
    case 'easy':
      return Math.max(target - step, floor)
    case 'medium':
      return target
    case 'hard':
      return Math.min(target + step, range.max)
  }
}

function prescribeExercise(
  state: StateDoc,
  pattern: Pattern,
  sets: number,
  variant: Variant,
): PrescribedExercise {
  const ladder = LADDERS[pattern]
  const sessionsDone = state.sessionsDone[pattern]
  const rungIndex = rungIndexAt(pattern, sessionsDone)
  const range = rangeAt(pattern, rungIndex)
  const target = targetAt(pattern, sessionsDone)
  return {
    type: 'exercise',
    pattern,
    rung: getRung(pattern, rungIndex),
    rungIndex,
    unit: ladder.unit,
    ladderKind: ladder.kind,
    sets,
    targetValue: applyVariant(target, ladder.unit, variant, range),
  }
}

/** What to do today. A pure function of `state.sessionsDone` and the variant. */
export function prescribe(state: StateDoc, variant: Variant): Prescription {
  const slot = slotAt(state.cyclePosition)
  const own: readonly PrescribedItem[] = slot.cardio
    ? [{ type: 'cardio', protocol: CARDIO, rounds: CARDIO_ROUNDS }]
    : slot.patterns.map((p) => prescribeExercise(state, p, SETS_PER_STRENGTH, variant))
  const daily = DAILY_BLOCK.map((p) => prescribeExercise(state, p, SETS_PER_DAILY_BLOCK, variant))
  return {
    position: state.cyclePosition,
    label: slot.label,
    variant,
    items: [...own, ...daily],
  }
}

/**
 * The inverse of `prescribe`: what a finished prescription records.
 *
 * This lives in the domain rather than in the player because it defines **the
 * shape of a recorded session**, and a shape defined in two places drifts. There
 * is no measurement here and no place to put one — the record carries what was
 * *prescribed*, so the only thing the caller supplies is the timestamp it is not
 * allowed to read itself.
 *
 * The cardio item records nothing: a cardio slot trains no ladder, so it has no
 * pattern, no rung and no target to log. A cardio session's `exercises` is
 * therefore the daily block alone, which is a normal case rather than an empty
 * one.
 */
export function toSessionResult(p: Prescription, completedAt: IsoTimestamp): SessionResult {
  return {
    completedAt,
    position: p.position,
    variant: p.variant,
    exercises: p.items
      .filter((item): item is PrescribedExercise => item.type === 'exercise')
      .map((e) => ({
        pattern: e.pattern,
        rungId: e.rung.id,
        sets: e.sets,
        targetValue: e.targetValue,
      })),
  }
}

/**
 * The only function that advances state. Position up one, one session counted for
 * every pattern the session trained, result appended.
 *
 * **No conditionals.** There is nothing to decide: the patterns trained are the
 * slot's own plus the daily block, and the variant is recorded rather than acted
 * on. If an `if` ever appears in this function, something has been misunderstood
 * about the design.
 *
 * The patterns come from `result.position` rather than `state.cyclePosition` so
 * that this describes the session that actually happened. `prescribe` fills
 * `position` from the state, so for any session the app itself produced the two
 * are the same number.
 */
export function recordSession(state: StateDoc, result: SessionResult): StateDoc {
  const trained: readonly Pattern[] = [...slotAt(result.position).patterns, ...DAILY_BLOCK]
  const sessionsDone = { ...state.sessionsDone }
  for (const pattern of trained) sessionsDone[pattern] += 1
  return {
    ...state,
    cyclePosition: state.cyclePosition + 1,
    sessionsDone,
    history: [...state.history, result],
  }
}
