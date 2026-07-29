/**
 * The domain contract. Briefs 03, 04, 05, 09 and 11 all code against this file,
 * so a wrong field here costs five briefs later.
 *
 * ── The state document is the source of truth AND the backup format ──────────
 *
 * `StateDoc` is serialised to one human-readable JSON file that a person is
 * expected to open in a text editor and hand-edit — that dual role is a locked
 * decision (corpus/wiki/decisions.md). It constrains the naming here: every
 * field must be self-explanatory to someone fixing a wrong rung at 2am. Hence
 * `rungIndex`, not `ri`; readable string discriminants, not numeric enums.
 *
 * ── Is `LadderState` authoritative, or a cache derived from `history`? ───────
 *
 * RESOLVED: **authoritative on read, derivable for repair.**
 *
 *   - The engine and UI always read `ladders` directly. It is the truth.
 *   - `deriveLadderStates(history)` (brief 04) can reconstruct it by replaying
 *     history, and exists as an *explicitly invoked repair tool* — never as an
 *     automatic step.
 *
 * Both halves are needed and they would conflict if derivation ran implicitly:
 * a hand-edited `rungIndex` must take effect immediately (so `ladders` wins),
 * but a corrupted counter must be recoverable without discarding months of
 * history (so derivation must exist). Running derivation automatically would
 * silently revert every hand-edit, which defeats the reason the file is
 * hand-editable in the first place.
 *
 * Brief 04 depends on this choice: `applySession` mutates `ladders` directly and
 * does not consult `history` to decide anything.
 *
 * ── Purity ──────────────────────────────────────────────────────────────────
 *
 * Nothing in src/domain/ may touch a browser API or read the clock; timestamps
 * arrive as parameters. This is enforced by eslint.config.js, not convention.
 */

// ─── Scalars ────────────────────────────────────────────────────────────────

/** The five movement patterns. `pull` is postural-only in v1 — see `Ladder.kind`. */
export type Pattern = 'push' | 'squat' | 'hinge' | 'core' | 'pull'

export const PATTERNS: readonly Pattern[] = ['push', 'squat', 'hinge', 'core', 'pull']

/**
 * Rep-based ladders count reps; core and pull are held, not repped, and count
 * seconds. Both run the *identical* progression rules — only the unit and the
 * display formatting differ.
 */
export type TargetUnit = 'reps' | 'seconds'

/**
 * The four positions the cycle can be on. `D` is cardio and trains no ladder.
 *
 * There is deliberately **no effort type here**. The app never asks how hard
 * anything felt, before or after — no `easy | ok | hard` tap, no reps-in-reserve
 * question, no difficulty picker. The engine's only input is *did you complete
 * the prescribed work*, which makes `SetResult` the whole of the input surface.
 * Locked decision, 2026-07-29 (corpus/wiki/decisions.md, "No effort input
 * anywhere"). Re-adding a rating field here would silently reopen it.
 */
export type CycleDay = 'A' | 'B' | 'C' | 'D'

/**
 * ISO-8601 instant, always supplied by the caller. `src/domain/` cannot read the
 * clock, which is what makes the simulation harness reproducible.
 */
export type IsoTimestamp = string

/**
 * Stable rung identifier, e.g. `push-04-full`.
 *
 * These are written into persisted history, so **a rung id is immutable once
 * shipped**. Renaming one orphans real training records that reference it.
 * The template type enforces only the pattern prefix; brief 03 owns the rest of
 * the convention.
 */
export type RungId = `${Pattern}-${string}`

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
  /** Key into the figure registry (brief 10). Unknown ids render a placeholder. */
  readonly figureId?: string
}

export interface Ladder {
  readonly pattern: Pattern
  readonly unit: TargetUnit
  /**
   * Where a brand-new document starts this ladder. **Not rung 0.**
   *
   * Calibration is descending (corpus/wiki/progression-engine.md): with no
   * effort input there is no fast-track, so instead of climbing up from the
   * bottom the user starts at a rung a returning beginner plausibly *can*
   * perform and the 3-miss regress rule walks them down if they cannot. A
   * missed set is free information; a question is not.
   *
   * **This is a safety-relevant number, not a tuning knob.** Each ladder's value
   * is capped at the hardest rung whose *failure mode* is benign, and the
   * reasoning per ladder is written next to the value in `ladders.ts`. Raising
   * one is a safety change, not a calibration tweak.
   */
  readonly startRungIndex: number
  /**
   * `postural` means this ladder does NOT train the strength quality its pattern
   * name implies, and the UI must say so. Required rather than optional so it
   * cannot be forgotten — v1 has no pull anchor, so the pull ladder trains
   * scapular retraction and upper-back endurance only. Presenting it as pull
   * strength would be a safety misrepresentation.
   */
  readonly kind: 'strength' | 'postural'
  readonly targetMin: number
  readonly targetMax: number
  readonly rungs: readonly Rung[]
}

export interface CycleDaySpec {
  readonly day: CycleDay
  readonly label: string
  /** Empty on a cardio day: it trains no ladder and mutates no ladder state. */
  readonly patterns: readonly Pattern[]
  /**
   * Required rather than optional so it cannot be forgotten, and stated rather
   * than inferred from `patterns.length === 0`. "This day trains no ladder" is a
   * fact about the programme; an empty array is an accident waiting to be read
   * as a content bug. Brief 13 owns what a cardio day actually *contains*.
   */
  readonly cardio: boolean
}

const DAY_A: CycleDaySpec = { day: 'A', label: 'Push', patterns: ['push', 'pull'], cardio: false }
const DAY_B: CycleDaySpec = { day: 'B', label: 'Legs', patterns: ['squat', 'hinge'], cardio: false }
const DAY_C: CycleDaySpec = { day: 'C', label: 'Core', patterns: ['core', 'pull'], cardio: false }
const DAY_D: CycleDaySpec = { day: 'D', label: 'Cardio', patterns: [], cardio: true }

/**
 * The rotating cycle — **seven positions, two of them cardio** (revised
 * 2026-07-29, corpus/wiki/decisions.md, "Cardio gets its own day").
 *
 *   A · B · C · CARDIO · A · B · CARDIO
 *
 * Twice weekly, not three times: three cardio days would cut each strength
 * pattern to ~4.7 direct sets/week *and* exceed the impact-volume ceiling the
 * injury literature supports. The two cardio days sit as far from Day B (legs)
 * as a seven-position cycle allows, because cardio movements are lower-body.
 *
 * Position is an integer counter into this array — there is no date arithmetic
 * anywhere in the engine, so "a missed day" is not an expressible concept.
 * Locked decision (corpus/wiki/decisions.md).
 */
export const CYCLE: readonly [
  CycleDaySpec,
  CycleDaySpec,
  CycleDaySpec,
  CycleDaySpec,
  CycleDaySpec,
  CycleDaySpec,
  CycleDaySpec,
] = [DAY_A, DAY_B, DAY_C, DAY_D, DAY_A, DAY_B, DAY_D]

// ─── Results ────────────────────────────────────────────────────────────────

export interface SetResult {
  readonly targetValue: number
  /** What actually happened. Never assumed equal to target. */
  readonly actualValue: number
}

/**
 * One exercise's record. Target and actual per set, and nothing else — the
 * `effort` field that used to sit here is gone (schema v2). See `CycleDay`.
 */
export interface ExerciseResult {
  readonly pattern: Pattern
  readonly rungId: RungId
  readonly sets: readonly SetResult[]
}

export interface SessionResult {
  /** Supplied by the caller — `src/domain/` may not read the clock. */
  readonly completedAt: IsoTimestamp
  readonly day: CycleDay
  /** Empty on a cardio day. A session that trains no ladder is a normal case. */
  readonly exercises: readonly ExerciseResult[]
}

// ─── State ──────────────────────────────────────────────────────────────────

export interface LadderState {
  readonly rungIndex: number
  /** Current prescription, in the ladder's unit. Between targetMin and targetMax. */
  readonly target: number
  /**
   * Consecutive clean sessions *at `targetMax`*. Two triggers a rung advance.
   * Reset on advance and on any missed session.
   */
  readonly cleanAtMax: number
  /** Consecutive missed sessions. 2 holds, 3 regresses. */
  readonly missedStreak: number
}

/**
 * Cross-brief settings. Declared here rather than bolted on later because
 * briefs 05, 07, 08 and 11 all need a slot and none of them is allowed to edit
 * this file.
 */
export interface Settings {
  readonly soundEnabled: boolean
  readonly voiceEnabled: boolean
  /** Set after the user skips the warmup repeatedly — respect it, don't re-ask. */
  readonly skipWarmupByDefault: boolean
  /** Result of navigator.storage.persist(). `null` = not yet requested. */
  readonly persistGranted: boolean | null
  readonly sync: SyncSettings | null
}

export interface SyncSettings {
  readonly baseUrl: string
  /** Write-only in the UI: masked and replaceable, never displayed. */
  readonly secret: string
}

/**
 * **v2** (2026-07-29): `ExerciseResult.effort` was removed. A v1 document has an
 * `effort` string on every exercise; `codec.migrate` drops the field on load
 * rather than rejecting the document. Everything else about the shape is
 * unchanged, which is exactly why this was the right first migration to have to
 * write — see `MIGRATIONS` in `src/persistence/codec.ts`.
 */
export const CURRENT_SCHEMA_VERSION = 2

export interface StateDoc {
  /**
   * Present from v1 even though there was only one version then. Retrofitting
   * migration onto a file that already holds six months of real training
   * history is a problem you only get to have once.
   */
  readonly schemaVersion: number
  /** Monotonic. Never resets — there is no streak to break. */
  readonly sessionsCompleted: number
  /** Integer index into CYCLE. Advances on completion, never on a date. */
  readonly cyclePosition: number
  readonly ladders: Readonly<Record<Pattern, LadderState>>
  readonly history: readonly SessionResult[]
  readonly settings: Settings
}

// ─── Derived helpers (pure, no state) ───────────────────────────────────────

export function cycleDayAt(cyclePosition: number): CycleDaySpec {
  // Positive modulo: cyclePosition should never be negative, but a hand-edited
  // file is an expected input and must not produce an out-of-range index.
  const i = ((cyclePosition % CYCLE.length) + CYCLE.length) % CYCLE.length
  const spec = CYCLE[i]
  if (!spec) throw new Error(`cycleDayAt: no cycle spec at index ${i}`)
  return spec
}

export function isPattern(value: unknown): value is Pattern {
  return typeof value === 'string' && (PATTERNS as readonly string[]).includes(value)
}

/** Every day letter the cycle can produce, deduplicated and in cycle order. */
export const CYCLE_DAYS: readonly CycleDay[] = [...new Set(CYCLE.map((spec) => spec.day))]

/**
 * Derived from `CYCLE` rather than restated, so adding a cycle day cannot leave
 * the persistence layer rejecting sessions the engine now prescribes.
 */
export function isCycleDay(value: unknown): value is CycleDay {
  return typeof value === 'string' && (CYCLE_DAYS as readonly string[]).includes(value)
}
