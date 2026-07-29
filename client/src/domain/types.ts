/**
 * The domain contract, **v3** (2026-07-29). Briefs 16–20 all code against this
 * file, so a wrong field here costs five briefs later.
 *
 * ── What is here and what is in `shared/` ────────────────────────────────────
 *
 * *Split out 2026-07-29 (brief 21).* The document shape and the scalars that
 * travel inside it moved to `@sports-app/shared/types.ts`, because the service
 * validates the document it stores and both ends must agree on it. What stayed
 * here is the **programme**: the ladders, the rotation, and the types that
 * describe a rung.
 *
 * The deciding question is never "type or behaviour" — it is *does the service
 * have to understand this value to do its job?* `RungId` does cross the wire
 * (inside `ExerciseRecord`); `Rung`, `Ladder` and `Modifier` do not, because the
 * server never resolves a rung id to the movement it names. That split is argued
 * at length next to `RungId` in `shared/types.ts`; it looks arbitrary and is not.
 *
 * ── What v3 deleted, and why nothing replaced it ─────────────────────────────
 *
 * The app no longer adapts. Nothing is measured, nothing branches on what the
 * user did, and the prescription is a pure function of how many sessions of a
 * pattern have been completed (corpus/wiki/progression-engine.md). So:
 *
 *   - `LadderState` is gone. Rung index and target are *derived* from
 *     `sessionsDone`, which means there is no cached number that can drift from
 *     the thing it caches — the bug class that produced the v2 fixture defect is
 *     now inexpressible.
 *   - `SetResult.actualValue` is gone. The app never learns what happened.
 *   - `Effort` is gone, and stays gone: asking after the work is asking at the
 *     worst possible moment.
 *   - `CycleDay` / `CYCLE` / `cycleDayAt` are gone, replaced by the three-slot
 *     `ROTATION` plus a `DAILY_BLOCK` trained in every session.
 *   - `Settings.soundEnabled` / `voiceEnabled` / `skipWarmupByDefault` are gone:
 *     audio and the guided warmup are out of v2 scope.
 *
 * ── Hand-editing still binds the content ────────────────────────────────────
 *
 * The state document is hand-edited by a person (corpus/wiki/decisions.md), which
 * is a constraint on this file too even though the document lives in `shared/`:
 * **out-of-range input is a normal case, not a bug to crash on.** A hand-edited
 * negative or absurd `cyclePosition` must degrade, not throw — see `slotAt`.
 *
 * ── Purity ──────────────────────────────────────────────────────────────────
 *
 * Nothing in client/src/domain/ may touch a browser API or read the clock;
 * timestamps arrive as parameters. `shared/` is the only thing it may import from
 * outside itself. Enforced by eslint.config.js, not by convention.
 */
import type { Pattern, Range, RungId, TargetUnit } from '@sports-app/shared/types.ts'

// ─── Content ────────────────────────────────────────────────────────────────

/**
 * The modifier metadata that distinguishes a rung from its neighbours.
 *
 * This exists because a rung is *one movement plus a modifier*, never a
 * different exercise — so adjacent rungs frequently share a shape and a figure,
 * and differ only in what is recorded here. The `pauseAt` field is not
 * decoration: "pause 2s" is ambiguous and possibly unsafe without knowing where
 * in the rep the pause happens.
 */
export interface Modifier {
  /** Seconds spent on the lowering phase. Absent means normal tempo. */
  readonly eccentricSeconds?: number
  readonly pauseSeconds?: number
  readonly pauseAt?: 'bottom' | 'top' | 'mid'
  /** One limb takes most or all of the load. */
  readonly unilateral?: boolean
  /** What is raised off the floor to change leverage or range. */
  readonly elevation?: 'hands' | 'feet' | 'heels' | 'none'
}

export interface Rung {
  readonly id: RungId
  readonly name: string
  /**
   * 2–4 short imperative cues covering setup, movement standard, where the
   * modifier applies, and the failure signal that says stop the set.
   *
   * Load-bearing: a figure cannot distinguish rung 3 from rung 4 when they share
   * a pose and differ only in tempo. Only these can.
   */
  readonly cues: readonly string[]
  readonly modifier?: Modifier
  /** Key into the figure registry. Unknown ids render a placeholder. */
  readonly figureId?: string
  /**
   * Overrides the ladder default. **REQUIRED on every `seconds` rung** — the
   * evidence-based ceilings genuinely differ per exercise (front plank 60s,
   * tuck L-sit 30s), and the interpolation absorbs differing spans for free
   * (corpus/wiki/programme.md#hold-caps-per-rung).
   */
  readonly range?: Range
  /**
   * Failing this rung is **injurious, not merely unsuccessful** — the schedule
   * reaches these on a clock rather than on readiness, and there is no mechanism
   * to step back (corpus/wiki/decisions.md, accepted risk). The user chose to
   * rely on the rung's own cue text as the only brake, which imposes one UI
   * contract:
   *
   * **On a `safetyCritical` rung, `cues[0]` renders FIRST and visually
   * separated** — as the safety check it is, not as item one of four. Brief 19
   * implements that; this flag is how it knows which rungs.
   */
  readonly safetyCritical?: boolean
}

export interface Ladder {
  readonly pattern: Pattern
  readonly unit: TargetUnit
  /**
   * `postural` means this ladder does NOT train the strength quality its pattern
   * name implies, and the UI must say so. Required rather than optional so it
   * cannot be forgotten — there is no pull anchor, so the pull ladder trains
   * scapular retraction and upper-back endurance only. Presenting it as pull
   * strength would be a safety misrepresentation.
   */
  readonly kind: 'strength' | 'postural'
  /**
   * Where every document starts this ladder. **Not rung 0.**
   *
   * There is no calibration in v3 — everyone gets the same schedule — so this is
   * purely a safety cap: the hardest rung whose *failure mode* is benign. The
   * per-ladder reasoning is written next to the value in `ladders.ts`. Raising
   * one is a safety change, not a tuning tweak.
   */
  readonly startRungIndex: number
  /** Default target span, used only by rungs that declare no `range` of their own. */
  readonly range: Range
  /**
   * How many sessions of this pattern one rung takes. **This is the law**, not a
   * tuning knob: a rung takes about six weeks on every ladder, so the number is
   * `sessions of this pattern per week × 6`.
   *
   *   rotating pattern, 2.3×/week → 14      daily block, 7×/week → 42
   *
   * Every step in the programme derives from it, which is why it is one rule
   * rather than three constants: 5→12 reps over 14 sessions is +1 rep per 2
   * sessions, a 20→60s plank over 42 is +1s per session, and a 10→30s prone Y
   * over 42 is +1s per 2 sessions — exactly the three steps the user specified
   * independently before the law was derived (corpus/wiki/progression-engine.md).
   */
  readonly sessionsPerRung: number
  readonly rungs: readonly Rung[]
}

/**
 * The cardio protocol. **Deliberately not a `Ladder`.**
 *
 * A cardio slot has no rungs, no progression and no target value, so every field
 * of `Ladder` would be either absent or a lie. Most of all it has no unit and no
 * number to hit: cardio is prescribed **by breathlessness**, because a count is
 * something the user can pace themselves down to, and self-pacing to nothing is
 * exactly the failure mode this protocol exists to avoid
 * (corpus/wiki/programme.md#the-cardio-day). There is no `target` field here on
 * purpose — the absence is the guarantee.
 */
export interface CardioProtocol {
  readonly label: string
  readonly rounds: number
  /** Seconds of hard work per round. 60, not 20 — see the note in `ladders.ts`. */
  readonly hardSeconds: number
  /** Lower-body only: the push day is upper-body and the daily block is daily. */
  readonly movements: readonly string[]
  /** Literal, not a string: no future edit may quietly switch this to a count. */
  readonly prescribedBy: 'breathlessness'
  readonly cues: readonly string[]
  /** The honest limit the app must state, not hide. */
  readonly notice: string
}

// ─── The rotation ───────────────────────────────────────────────────────────

export interface RotationSlot {
  readonly label: string
  /** The slot's own strength work. Empty on the cardio slot. */
  readonly patterns: readonly Pattern[]
  /**
   * Stated rather than inferred from `patterns.length === 0`. "This slot trains
   * no ladder" is a fact about the programme; an empty array is an accident
   * waiting to be read as a content bug.
   */
  readonly cardio: boolean
}

const PUSH_SLOT: RotationSlot = { label: 'Push', patterns: ['push'], cardio: false }
const LEGS_SLOT: RotationSlot = { label: 'Legs', patterns: ['squat', 'hinge'], cardio: false }
const CARDIO_SLOT: RotationSlot = { label: 'Cardio', patterns: [], cardio: true }

/**
 * Push · Legs · Cardio. **Cardio always FOLLOWS legs and never precedes it** —
 * that ordering is the whole reason for this sequence and it is a locked decision
 * (corpus/wiki/decisions.md). With daily training you cannot keep cardio away
 * from legs day unless legs days go back-to-back, which breaks 48-hour recovery,
 * so the achievable optimum is the *order*: the concurrent-training literature
 * cares about strength-before-conditioning, and `Legs → Cardio → Push` satisfies
 * it while giving legs 48h+ before the next session. **Do not reorder.**
 *
 * Position is an integer counter into this array. There is no date arithmetic
 * anywhere in the domain, so "a missed day" is not an expressible concept.
 */
export const ROTATION: readonly [RotationSlot, RotationSlot, RotationSlot] = [
  PUSH_SLOT,
  LEGS_SLOT,
  CARDIO_SLOT,
]

/**
 * Trained in EVERY session, on top of the slot's own patterns.
 *
 * Daily because the work is low-fatigue, responds to frequency, and is the half
 * of the goal set a desk job actively damages. It also equalises pacing: at one
 * session per rotation, core rungs took twice as long as push rungs to clear.
 */
export const DAILY_BLOCK: readonly Pattern[] = ['core', 'pull']

/**
 * The slot at `position`, wrapping.
 *
 * Never throws. The state file is hand-editable, so a negative, fractional or
 * absurd position is an expected input, not a bug: it degrades to a real slot
 * rather than breaking the only screen that matters.
 */
export function slotAt(position: number): RotationSlot {
  const length = ROTATION.length
  // Positive modulo, so -1 → 2 rather than -1.
  const index = ((position % length) + length) % length
  // `index` is NaN for a NaN position and fractional for a fractional one; both
  // miss the array, and the first slot is a better answer than a thrown error.
  return ROTATION[index] ?? ROTATION[0]
}
