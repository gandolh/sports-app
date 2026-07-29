/**
 * The one number a progress chart is allowed to plot.
 *
 * In double progression the target climbs to the top of the range and then
 * **resets to the bottom on a rung advance**. So a chart of raw reps sawtooths
 * and shows a drop at the exact moment the user got stronger — the most
 * demoralising possible bug in a progress screen, and the reason this file
 * exists. Nothing here exposes a raw-reps series, on purpose.
 *
 *   progressIndex = rungIndex × stepsPerRung(unit) + (target − targetMin) / targetStep(unit)
 *
 * Monotonic by construction across a rung advance:
 *
 *   push rung 2 @ 12  →  2 × 8 + 7 = 23
 *   push rung 3 @  5  →  3 × 8 + 0 = 24
 *
 * Comparable *within* a pattern only. Each pattern is its own chart line: rep and
 * time ladders have different rung counts and different step sizes, so a shared
 * axis would be meaningless.
 */
import type { Ladder, LadderState, Pattern, RungId, SessionResult } from './types.ts'
import { PATTERNS } from './types.ts'
import { LADDERS } from './ladders.ts'
import { rungIndexOf, stepsPerRung, targetStep } from './engine.ts'

/**
 * The monotonic progress index for a position on a ladder.
 *
 * The ladder is passed in rather than looked up by pattern so the function can be
 * unit-tested against a synthetic ladder, and so callers that already hold a
 * `Ladder` do not pay a second lookup.
 */
export function progressIndex(rungIndex: number, target: number, ladder: Ladder): number {
  return (
    rungIndex * stepsPerRung(ladder.unit) +
    (target - ladder.targetMin) / targetStep(ladder.unit)
  )
}

/** `progressIndex` for a pattern's current authoritative ladder state. */
export function currentProgressIndex(pattern: Pattern, state: LadderState): number {
  return progressIndex(state.rungIndex, state.target, LADDERS[pattern])
}

/**
 * One plotted point: the work actually performed in one session.
 *
 * `rungIndex` and `rungId` ride along because a rung advance is the milestone
 * worth annotating on the line, and the *name* of the new rung is the meaningful
 * unit of progress — "now at full push-up" says more than "index 24".
 */
export interface ProgressPoint {
  /** 1-based session ordinal, matching `StateDoc.sessionsCompleted` after it. */
  readonly sessionsCompleted: number
  readonly progressIndex: number
  readonly rungIndex: number
  readonly rungId: RungId
  /** The prescribed target that session, in the ladder's unit. Not for the y-axis. */
  readonly target: number
}

/**
 * `history` → one series per pattern, in session order.
 *
 * The point for a session is the position the session was **performed at**, taken
 * from the logged rung id and target rather than recomputed. History is the
 * record of what happened; recomputing it would let a chart disagree with the
 * training log.
 *
 * A session whose rung id no longer resolves in `LADDERS` contributes no point.
 * An unknown id is a display problem, not a reason to break the screen — and a
 * fabricated y-value would be worse than a gap.
 */
export function progressSeries(
  history: readonly SessionResult[],
): Record<Pattern, readonly ProgressPoint[]> {
  const series = {} as Record<Pattern, ProgressPoint[]>
  for (const pattern of PATTERNS) series[pattern] = []

  history.forEach((session, i) => {
    for (const exercise of session.exercises) {
      const ladder = LADDERS[exercise.pattern]
      const rungIndex = rungIndexOf(exercise.pattern, exercise.rungId)
      const target = exercise.sets[0]?.targetValue
      if (rungIndex < 0 || target === undefined) continue
      series[exercise.pattern].push({
        sessionsCompleted: i + 1,
        progressIndex: progressIndex(rungIndex, target, ladder),
        rungIndex,
        rungId: exercise.rungId,
        target,
      })
    }
  })

  return series
}

/**
 * Indices into a series where `rungIndex` changed — the milestones brief 09
 * annotates. The first point is never a milestone: starting somewhere is not an
 * advance.
 */
export function rungChangePoints(series: readonly ProgressPoint[]): readonly number[] {
  const changes: number[] = []
  series.forEach((point, i) => {
    const previous = series[i - 1]
    if (previous && previous.rungIndex !== point.rungIndex) changes.push(i)
  })
  return changes
}
