/**
 * The simulation harness: a synthetic user who answers prescriptions, driven
 * through hundreds of sessions of the real engine over the real ladders.
 *
 * This exists because single-transition unit tests cannot catch the failures that
 * actually matter. "Does the engine advance on a completed session" is easy; "does
 * a user with this capability curve end up somewhere sensible after 200 sessions,
 * without prescribing work they cannot do, without wandering off, and without the
 * progress chart ever going backwards" is the question, and it is only answerable
 * by running it.
 *
 * ── Determinism ─────────────────────────────────────────────────────────────
 *
 * `src/domain/` may not call `Math.random()` or read the clock, and this file
 * lives under it, so randomness is a seeded LCG written below and timestamps are
 * synthesised from the session ordinal. Every run is reproducible from
 * `(seed, options)`: a failure here can always be replayed exactly.
 *
 * ── The synthetic user is now PURELY a capability curve ─────────────────────
 *
 * The previous version of this file carried an **effort model** — a `gradual` /
 * `abrupt` switch deciding whether the user would report `easy`, `ok` or `hard`,
 * and it was the knob that moved the headline numbers by 30×. It is gone, because
 * the input it fed no longer exists: the app never asks how hard anything felt
 * (corpus/wiki/decisions.md, "No effort input anywhere").
 *
 * What is left is the honest half. A user is described per pattern by:
 *
 *   capability(rung, n) = base × (1 + growth)^min(n, plateauAfter) × decay^rung
 *
 * read as "the value this user can complete for all three sets, in the ladder's
 * unit". `decay` encodes that a rung is a *harder version of the same movement*:
 * someone good for 20 counter push-ups is good for maybe 15 on a chair. Per-set
 * `noise` is the day-to-day and set-to-set variation.
 *
 * That is the whole model, and it is now the whole of what the engine can see:
 * completed or not completed, three sets at a time.
 *
 * ── One consequence worth naming before reading any metric ──────────────────
 *
 * Deleting the effort input deleted the engine's only interior fixed point (the
 * "every rep done but rated hard → hold" row). A completed session always either
 * bumps the target or counts toward a rung advance, so the only states the engine
 * can sit still in are the top of a ladder at its cap and nothing else. A
 * static-capability user therefore does not park on one prescription any more —
 * they oscillate over a narrow band around their ceiling. `bandWidth` and
 * `wastedSessions` below exist to measure that band rather than pretend it away.
 */
import type {
  CycleDay,
  ExerciseResult,
  IsoTimestamp,
  Pattern,
  SessionResult,
  SetResult,
  StateDoc,
} from '../types.ts'
import { CURRENT_SCHEMA_VERSION, PATTERNS } from '../types.ts'
import { LADDERS } from '../ladders.ts'
import {
  SETS_PER_EXERCISE,
  applySession,
  freshLadderStates,
  isCompleted,
  missedTarget,
  nextSession,
} from '../engine.ts'
import type { Prescription } from '../engine.ts'
import { progressIndex } from '../progress.ts'
import { defaultSettings } from './fixtures.ts'

// ─── Seeded PRNG ────────────────────────────────────────────────────────────

/**
 * Numerical Recipes LCG. `Math.imul` keeps the multiply exact in 32 bits, so the
 * sequence is identical on every platform — which is the only property a test
 * harness needs from a PRNG.
 */
export function lcg(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x100000000
  }
}

// ─── Synthetic timestamps ───────────────────────────────────────────────────

const pad = (n: number): string => (n < 10 ? `0${n}` : `${n}`)

/**
 * A valid, strictly increasing ISO instant for session `n`.
 *
 * The engine never parses a timestamp — it is carried through to `history` and
 * read only by the UI — so this needs to be well-formed and monotonic and
 * nothing more. Deliberately built by arithmetic on the session ordinal rather
 * than by date math, because `src/domain/` has no calendar and no clock.
 */
export function simulatedTimestamp(n: number): IsoTimestamp {
  if (!Number.isInteger(n) || n < 0 || n >= 86400) {
    throw new Error(`simulatedTimestamp: session ordinal ${n} out of range 0..86399`)
  }
  const hh = pad(Math.floor(n / 3600))
  const mm = pad(Math.floor(n / 60) % 60)
  const ss = pad(n % 60)
  return `2026-01-01T${hh}:${mm}:${ss}.000Z`
}

// ─── The synthetic user ─────────────────────────────────────────────────────

export interface CapabilitySpec {
  /** What the user can complete for all three sets at rung 0, session 0. */
  readonly base: number
  /** Capability at rung r is `base × decay^r`. A rung is a harder version, so < 1. */
  readonly decay: number
  /** Fractional capability gain per session performed of this pattern. */
  readonly growth: number
  /** Growth stops after this many sessions of this pattern. */
  readonly plateauAfter: number
  /** Day-to-day fractional variation, ±noise, applied per set. */
  readonly noise: number
}

export type UserSpec = Readonly<Record<Pattern, CapabilitySpec>>

/** The same capability spec on every pattern — the usual case for a probe. */
export function uniformUser(spec: CapabilitySpec): UserSpec {
  const user = {} as Record<Pattern, CapabilitySpec>
  for (const pattern of PATTERNS) user[pattern] = spec
  return user
}

/** One spec per pattern, defaulting the rest to `base`. */
export function userWith(base: CapabilitySpec, overrides: Partial<UserSpec>): UserSpec {
  const user = uniformUser(base) as Record<Pattern, CapabilitySpec>
  for (const pattern of PATTERNS) {
    const override = overrides[pattern]
    if (override) user[pattern] = override
  }
  return user
}

/** What the user can hold or lift at `rungIndex`, after `n` sessions of the pattern. */
export function capabilityAt(spec: CapabilitySpec, rungIndex: number, n: number): number {
  const grown = spec.base * (1 + spec.growth) ** Math.min(n, spec.plateauAfter)
  return grown * spec.decay ** rungIndex
}

/**
 * The hardest rung whose *bottom* target this user could complete — the honest
 * answer to "what rung is this person actually on".
 *
 * Note that this can be 0 even when the user cannot perform rung 0 either: there
 * is no lower answer to give. `sessionsAboveCapability` is therefore non-zero for
 * a user weaker than the bottom of the ladder, by construction.
 */
export function trueCapabilityRung(spec: CapabilitySpec, pattern: Pattern, n: number): number {
  const ladder = LADDERS[pattern]
  let best = 0
  for (let r = 0; r < ladder.rungs.length; r += 1) {
    if (capabilityAt(spec, r, n) >= ladder.targetMin) best = r
  }
  return best
}

/**
 * How the synthetic user answers one prescribed exercise.
 *
 * Each set is capped at the prescribed target — nobody does extra reps — and
 * each set draws its own capability sample, so a run has realistic set-to-set
 * variation rather than three identical numbers.
 */
export function performExercise(
  spec: CapabilitySpec,
  capability: number,
  target: number,
  rand: () => number,
): readonly SetResult[] {
  const results: SetResult[] = []
  for (let s = 0; s < SETS_PER_EXERCISE; s += 1) {
    const jitter = 1 + spec.noise * (rand() * 2 - 1)
    const achievable = Math.floor(capability * jitter)
    results.push({ targetValue: target, actualValue: Math.max(0, Math.min(target, achievable)) })
  }
  return results
}

// ─── Running a simulation ───────────────────────────────────────────────────

export interface SimOptions {
  readonly sessions: number
  readonly seed: number
  readonly user: UserSpec
  /** Defaults to a brand-new document: every ladder at its `startRungIndex`. */
  readonly start?: StateDoc
}

export interface Observation {
  readonly pattern: Pattern
  /** 1-based count of sessions of *this pattern*, including this one. */
  readonly patternSession: number
  readonly rungIndex: number
  readonly target: number
  readonly capability: number
  readonly trueCapabilityRung: number
  readonly missed: boolean
  readonly completed: boolean
  /** Where this session sat on the chart. */
  readonly progressIndex: number
  /** Where the ladder sat *after* the engine applied the session. */
  readonly progressIndexAfter: number
  readonly rungIndexAfter: number
  readonly targetAfter: number
  /**
   * The engine took the regress branch: the prescription got easier.
   *
   * Usually that is a rung drop, but at rung 0 the rung cannot drop and only the
   * target resets — which is still a deload, and still the only one available at
   * the bottom of a ladder.
   */
  readonly deloaded: boolean
  /** The engine advanced a rung *onto* a rung this user cannot perform at all. */
  readonly advancedAboveCapability: boolean
}

/** An observation before the engine has been asked what the session did. */
type PendingObservation = Omit<
  Observation,
  | 'progressIndexAfter'
  | 'rungIndexAfter'
  | 'targetAfter'
  | 'deloaded'
  | 'advancedAboveCapability'
>

export interface SimStep {
  /** 1-based session ordinal. */
  readonly session: number
  readonly day: CycleDay
  readonly cardio: boolean
  readonly before: StateDoc
  readonly prescription: Prescription
  readonly result: SessionResult
  readonly after: StateDoc
  readonly observations: readonly Observation[]
}

export interface SimRun {
  readonly options: SimOptions
  readonly steps: readonly SimStep[]
  readonly final: StateDoc
}

export function freshDoc(): StateDoc {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    sessionsCompleted: 0,
    cyclePosition: 0,
    ladders: freshLadderStates(),
    history: [],
    settings: defaultSettings,
  }
}

/**
 * A start document with named ladder positions, for probing calibration.
 *
 * `overrides` are `rungIndex` values; the target starts at the bottom of the
 * range, which is what a fresh document does and what any deload-to-rung-0 lands
 * on. Used by the descending-calibration test to plant a user well above their
 * real capability.
 */
export function docAtRungs(overrides: Partial<Record<Pattern, number>>): StateDoc {
  const base = freshDoc()
  const ladders = { ...base.ladders }
  for (const pattern of PATTERNS) {
    const rungIndex = overrides[pattern]
    if (rungIndex === undefined) continue
    ladders[pattern] = {
      rungIndex,
      target: LADDERS[pattern].targetMin,
      cleanAtMax: 0,
      missedStreak: 0,
    }
  }
  return { ...base, ladders }
}

export function simulate(options: SimOptions): SimRun {
  const rand = lcg(options.seed)
  const steps: SimStep[] = []
  const patternSessions = {} as Record<Pattern, number>
  for (const pattern of PATTERNS) patternSessions[pattern] = 0

  let state = options.start ?? freshDoc()

  for (let i = 0; i < options.sessions; i += 1) {
    const prescription = nextSession(state)
    const exercises: ExerciseResult[] = []
    const pending: PendingObservation[] = []

    // On a cardio day this loop body never runs: no exercises are prescribed, so
    // none are performed and no ladder moves. The session still counts.
    for (const item of prescription.exercises) {
      const spec = options.user[item.pattern]
      const ladder = LADDERS[item.pattern]
      const n = patternSessions[item.pattern]
      patternSessions[item.pattern] = n + 1

      const capability = capabilityAt(spec, item.rungIndex, n)
      const performed = performExercise(spec, capability, item.target, rand)

      const exercise: ExerciseResult = {
        pattern: item.pattern,
        rungId: item.rung.id,
        sets: performed,
      }
      exercises.push(exercise)
      pending.push({
        pattern: item.pattern,
        patternSession: n + 1,
        rungIndex: item.rungIndex,
        target: item.target,
        capability,
        trueCapabilityRung: trueCapabilityRung(spec, item.pattern, n),
        missed: missedTarget(exercise),
        completed: isCompleted(exercise),
        progressIndex: progressIndex(item.rungIndex, item.target, ladder),
      })
    }

    const result: SessionResult = {
      completedAt: simulatedTimestamp(i),
      day: prescription.day,
      exercises,
    }
    const after = applySession(state, result)

    steps.push({
      session: i + 1,
      day: prescription.day,
      cardio: prescription.cardio,
      before: state,
      prescription,
      result,
      after,
      observations: pending.map((observation) => {
        const ladderAfter = after.ladders[observation.pattern]
        return {
          ...observation,
          rungIndexAfter: ladderAfter.rungIndex,
          targetAfter: ladderAfter.target,
          deloaded:
            observation.missed &&
            (ladderAfter.rungIndex < observation.rungIndex ||
              ladderAfter.target < observation.target),
          advancedAboveCapability:
            ladderAfter.rungIndex > observation.rungIndex &&
            ladderAfter.rungIndex > observation.trueCapabilityRung,
          progressIndexAfter: progressIndex(
            ladderAfter.rungIndex,
            ladderAfter.target,
            LADDERS[observation.pattern],
          ),
        }
      }),
    })
    state = after
  }

  return { options, steps, final: state }
}

// ─── Reading a run ──────────────────────────────────────────────────────────

export function observationsFor(run: SimRun, pattern: Pattern): readonly Observation[] {
  return run.steps.flatMap((step) => step.observations.filter((o) => o.pattern === pattern))
}

export interface SimMetrics {
  /** Sessions of this pattern. */
  readonly sessions: number
  readonly advances: number
  readonly regressions: number
  readonly missed: number
  readonly finalRungIndex: number
  readonly finalTarget: number
  readonly maxRungIndex: number
  readonly minRungIndex: number
  readonly trueCapabilityRungAtEnd: number
  /** Sessions prescribed on a rung above what the user could actually do. */
  readonly sessionsAboveCapability: number
  /**
   * The same count, restricted to *after* descending calibration has finished —
   * i.e. after the ladder has first sat at or below the user's true rung.
   *
   * This is the number that says whether the ENGINE overshoots. The raw count
   * above cannot be zero for a user weaker than `startRungIndex`, because
   * starting mid-ladder and walking down is the whole design; what must be zero
   * is over-prescription the engine causes on its own once it has found the user.
   */
  readonly sessionsAboveCapabilityAfterCalibration: number
  /** Rung advances that landed on a rung the user cannot perform. Must be 0. */
  readonly advancesAboveCapability: number
  /** Sessions where the prescribed target exceeded capability outright. */
  readonly sessionsBeyondTarget: number
  /** The as-performed chart series never goes backwards. */
  readonly performedIndexNonDecreasing: boolean
  /** The authoritative ladder position never goes backwards. */
  readonly stateIndexNonDecreasing: boolean
  /**
   * Index decreases that a deload does *not* explain.
   *
   * This, not plain monotonicity, is the property that makes the chart honest: a
   * deload is real and the chart should show it, but the index must never fall
   * because of the double-progression reset. Must be 0 in every run.
   */
  readonly unexplainedIndexDecreases: number
  /** Deload events, including the target-only deload at the bottom of a ladder. */
  readonly deloads: number
  /**
   * How many distinct rungs the last quarter of the run visited.
   *
   * 1 means the ladder settled dead still. 2 means it oscillates over a pair of
   * adjacent rungs, which is the engine's steady state for a static-capability
   * user now that the "completed but hard" fixed point is gone. 3 or more would
   * mean it is wandering, which would be a real problem.
   */
  readonly tailBandWidth: number
  /** Missed sessions in the last quarter of the run — the cost of the band. */
  readonly tailMissedFraction: number
}

export function metricsFor(run: SimRun, pattern: Pattern): SimMetrics {
  const observations = observationsFor(run, pattern)
  const last = observations[observations.length - 1]
  const finalState = run.final.ladders[pattern]

  let advances = 0
  let regressions = 0
  let performedNonDecreasing = true
  let stateNonDecreasing = true
  let unexplained = 0
  let calibrated = false
  let aboveAfterCalibration = 0
  observations.forEach((o, i) => {
    if (o.rungIndexAfter > o.rungIndex) advances += 1
    if (o.rungIndexAfter < o.rungIndex) regressions += 1
    if (o.rungIndex <= o.trueCapabilityRung) calibrated = true
    else if (calibrated) aboveAfterCalibration += 1
    const previous = observations[i - 1]
    if (previous) {
      if (o.progressIndex < previous.progressIndex) performedNonDecreasing = false
      if (o.progressIndexAfter < previous.progressIndexAfter) {
        stateNonDecreasing = false
        if (!o.deloaded) unexplained += 1
      }
    }
  })

  const tail = observations.slice(-Math.max(1, Math.floor(observations.length / 4)))

  return {
    sessions: observations.length,
    advances,
    regressions,
    missed: observations.filter((o) => o.missed).length,
    finalRungIndex: finalState.rungIndex,
    finalTarget: finalState.target,
    maxRungIndex: observations.reduce((m, o) => Math.max(m, o.rungIndex), 0),
    minRungIndex: observations.reduce(
      (m, o) => Math.min(m, o.rungIndex),
      observations[0]?.rungIndex ?? 0,
    ),
    trueCapabilityRungAtEnd: last?.trueCapabilityRung ?? 0,
    sessionsAboveCapability: observations.filter((o) => o.rungIndex > o.trueCapabilityRung).length,
    sessionsAboveCapabilityAfterCalibration: aboveAfterCalibration,
    advancesAboveCapability: observations.filter((o) => o.advancedAboveCapability).length,
    sessionsBeyondTarget: observations.filter((o) => o.capability < o.target).length,
    performedIndexNonDecreasing: performedNonDecreasing,
    stateIndexNonDecreasing: stateNonDecreasing,
    unexplainedIndexDecreases: unexplained,
    deloads: observations.filter((o) => o.deloaded).length,
    tailBandWidth: new Set(tail.map((o) => o.rungIndex)).size,
    tailMissedFraction: tail.length === 0 ? 0 : tail.filter((o) => o.missed).length / tail.length,
  }
}

/**
 * The 1-based session of `pattern` at which the ladder first sat on `rungIndex`,
 * or `undefined` if it never got there. This is the number the calibration claim
 * lives or dies on.
 */
export function firstSessionAtRung(
  run: SimRun,
  pattern: Pattern,
  rungIndex: number,
): number | undefined {
  for (const o of observationsFor(run, pattern)) {
    if (o.rungIndex >= rungIndex) return o.patternSession
  }
  return undefined
}

/**
 * The 1-based session of `pattern` at which the ladder first sat at or *below*
 * `rungIndex` — the descending counterpart of `firstSessionAtRung`, and the
 * number that says how long descending calibration takes.
 */
export function firstSessionAtOrBelowRung(
  run: SimRun,
  pattern: Pattern,
  rungIndex: number,
): number | undefined {
  for (const o of observationsFor(run, pattern)) {
    if (o.rungIndex <= rungIndex) return o.patternSession
  }
  return undefined
}

/** Every distinct rung the ladder visited, in order of first visit. */
export function rungTrajectory(run: SimRun, pattern: Pattern): readonly number[] {
  const path: number[] = []
  for (const o of observationsFor(run, pattern)) {
    if (path[path.length - 1] !== o.rungIndex) path.push(o.rungIndex)
  }
  return path
}
