/**
 * Milestones reached and total work ever — the two account-page stats that
 * need no stored data beyond what `schedule.ts` and `ladders.ts` already derive
 * (brief 20, corpus/briefs/todo/20-milestones-and-total-work.md). Charts are
 * out: the prescription is a pure function of session count, so plotting it
 * against session number is a straight line with no information in it.
 *
 * ── Why this replays history instead of reading `sessionsDone` ──────────────
 *
 * `rungIndexAt` is a function of a session COUNT, and `StateDoc.sessionsDone`
 * only ever holds the count as of NOW. Asking "what rung was pattern P on at
 * session 12" by plugging today's count into `rungIndexAt` answers a different
 * question — today's rung, mislabelled with session 12's number. So this file
 * never reads `doc.sessionsDone`: it replays `doc.history` from zero, counting
 * each pattern's own appearances as it goes, and asks `rungIndexAt` about the
 * count AT THAT POINT. That replay is the entire difficulty here.
 *
 * `completedAt` is never read either — milestones key off session NUMBER
 * (position in `history`), matching the no-dates invariant.
 */
import { LADDERS, getRung, topRungIndex } from './ladders.ts'
import { rungIndexAt } from './schedule.ts'
import { PATTERNS } from './types.ts'
import type { Pattern, RungId, StateDoc } from './types.ts'

export interface Milestone {
  /** 1-based; the session at which this was reached. */
  readonly sessionNumber: number
  readonly pattern: Pattern
  readonly kind: 'rung' | 'named'
  readonly label: string
}

export interface TotalWork {
  readonly reps: number
  readonly holdSeconds: number
  readonly sessions: number
  readonly perPattern: Readonly<Record<Pattern, { reps: number; holdSeconds: number }>>
}

// ─── Named milestones ───────────────────────────────────────────────────────
//
// A rung index means nothing to a person; these handful of rungs are worth
// calling out by name instead. Two directions, because "reaching" a rung
// sometimes means arriving at it and sometimes means finishing it:
//
//   NAMED_ON_ENTRY      — the milestone is arriving at this rung.
//   NAMED_ON_COMPLETION — the milestone is what the rung LEFT looked like at
//                         its hardest, which is the session before the next
//                         one starts (schedule.ts guarantees the last session
//                         of a rung prescribes exactly its max).
//
// `squat-02-bodyweight` is also every document's *starting* rung
// (`ladders.ts#START_RUNGS`), so nobody ever climbs INTO it — the ordinary
// increase-detection below would never fire for it. It is reached on the
// pattern's very first trained session instead; see the `firstSession` check.

const NAMED_ON_ENTRY: ReadonlyMap<RungId, string> = new Map([
  ['push-04-full', 'Reached the first full push-up.'],
  ['squat-02-bodyweight', 'Reached the first unassisted bodyweight squat.'],
])

const NAMED_ON_COMPLETION: ReadonlyMap<RungId, string> = new Map([
  ['core-02-plank', 'Held a 60-second front plank.'],
  ['core-03-side-plank', 'Held 45 seconds of side plank, split across both sides.'],
])

/**
 * Reaching the top of a ladder is a milestone in its own right: the target
 * now cycles min→max→min forever, which is the honest ceiling of floor-only
 * training, not a failure — see schedule.ts's note on the top rung.
 */
function topOfLadderLabel(pattern: Pattern): string {
  const rung = getRung(pattern, topRungIndex(pattern))
  const noun = LADDERS[pattern].unit === 'reps' ? 'reps' : 'seconds'
  return (
    `Reached the top of the ${pattern} ladder (${rung.name}) — there is no rung ` +
    `above it, so the ${noun} target now cycles between its floor and its ` +
    'ceiling forever. That is the ceiling of floor-only training, not a setback.'
  )
}

/**
 * Every milestone reached, replayed from `doc.history`, newest-first — that is
 * how the account page reads.
 *
 * Two independent triggers per pattern, both driven by the count of that
 * pattern's own sessions trained so far (never by `doc.sessionsDone`):
 *
 *   1. The pattern's very first trained session, which is when its *starting*
 *      rung (`ladders.ts#START_RUNGS`) is genuinely reached for the first
 *      time — not an "increase" in rung index, since there is nothing to
 *      increase from, but real all the same. Only worth a milestone if that
 *      starting rung happens to be named.
 *   2. Every later session where the rung index for that pattern goes up,
 *      which `rungIndexAt` reports at most once per session by construction
 *      (`sessionsPerRung` sessions per step) — so the top-of-ladder case
 *      fires exactly once, on the session that first reaches it, and never
 *      again while it cycles.
 */
export function milestonesReached(doc: StateDoc): readonly Milestone[] {
  const sessionsDoneSoFar: Record<Pattern, number> = { push: 0, squat: 0, hinge: 0, core: 0, pull: 0 }
  const highestRungIndex: Record<Pattern, number> = {
    push: rungIndexAt('push', 0),
    squat: rungIndexAt('squat', 0),
    hinge: rungIndexAt('hinge', 0),
    core: rungIndexAt('core', 0),
    pull: rungIndexAt('pull', 0),
  }
  const firstSessionSeen: Record<Pattern, boolean> = {
    push: false,
    squat: false,
    hinge: false,
    core: false,
    pull: false,
  }

  const milestones: Milestone[] = []

  doc.history.forEach((session, i) => {
    const sessionNumber = i + 1
    // Which patterns this session trained is read off the recorded exercises,
    // not guessed from the rotation slot: a cardio session trains no ladder of
    // its own, but the daily block still records, and that is exactly what
    // should still count here.
    const trainedPatterns = new Set(session.exercises.map((e) => e.pattern))

    for (const pattern of trainedPatterns) {
      const before = sessionsDoneSoFar[pattern]
      const after = before + 1
      sessionsDoneSoFar[pattern] = after

      if (!firstSessionSeen[pattern]) {
        firstSessionSeen[pattern] = true
        const startRung = getRung(pattern, highestRungIndex[pattern])
        const label = NAMED_ON_ENTRY.get(startRung.id)
        if (label !== undefined) {
          milestones.push({ sessionNumber, pattern, kind: 'named', label })
        }
      }

      const newIndex = rungIndexAt(pattern, after)
      if (newIndex > highestRungIndex[pattern]) {
        const exitedRung = getRung(pattern, highestRungIndex[pattern])
        const enteredRung = getRung(pattern, newIndex)
        highestRungIndex[pattern] = newIndex

        if (newIndex === topRungIndex(pattern)) {
          milestones.push({ sessionNumber, pattern, kind: 'named', label: topOfLadderLabel(pattern) })
          continue
        }

        const enteredLabel = NAMED_ON_ENTRY.get(enteredRung.id)
        const exitedLabel = NAMED_ON_COMPLETION.get(exitedRung.id)
        if (enteredLabel !== undefined) {
          milestones.push({ sessionNumber, pattern, kind: 'named', label: enteredLabel })
        } else if (exitedLabel !== undefined) {
          milestones.push({ sessionNumber, pattern, kind: 'named', label: exitedLabel })
        } else {
          milestones.push({
            sessionNumber,
            pattern,
            kind: 'rung',
            label: `Advanced to ${enteredRung.name}.`,
          })
        }
      }
    }
  })

  return milestones.slice().reverse()
}

/**
 * Total work done, ever: `sets × targetValue`, summed per exercise record and
 * split into reps or hold-seconds by the ladder's unit (`LADDERS[pattern].unit`
 * — fixed per pattern, so there is no per-rung lookup to get wrong).
 *
 * This is work PRESCRIBED, not work verified — the app measures nothing
 * (corpus/wiki/decisions.md), so every number here is the sum of what the
 * schedule asked for, not what actually happened. Still the most motivating
 * figure available, and not a lie, but the distinction belongs in the code
 * rather than only in someone's head.
 *
 * Cardio rounds are deliberately NOT included anywhere in this total. A
 * cardio slot records no exercises of its own (`schedule.ts#toSessionResult`
 * — only the daily block does), so there is no per-session rounds count in
 * `history` to sum in the first place. Reconstructing one from the current
 * `CARDIO_ROUNDS` constant would be the same category error this module
 * exists to avoid — using a CURRENT number to stand in for a HISTORICAL one —
 * and cardio has no target value to begin with (`CardioProtocol`, by design).
 */
export function totalWork(doc: StateDoc): TotalWork {
  const perPattern: Record<Pattern, { reps: number; holdSeconds: number }> = {
    push: { reps: 0, holdSeconds: 0 },
    squat: { reps: 0, holdSeconds: 0 },
    hinge: { reps: 0, holdSeconds: 0 },
    core: { reps: 0, holdSeconds: 0 },
    pull: { reps: 0, holdSeconds: 0 },
  }

  for (const session of doc.history) {
    for (const exercise of session.exercises) {
      const work = exercise.sets * exercise.targetValue
      if (LADDERS[exercise.pattern].unit === 'seconds') {
        perPattern[exercise.pattern].holdSeconds += work
      } else {
        perPattern[exercise.pattern].reps += work
      }
    }
  }

  let reps = 0
  let holdSeconds = 0
  for (const pattern of PATTERNS) {
    reps += perPattern[pattern].reps
    holdSeconds += perPattern[pattern].holdSeconds
  }

  return { reps, holdSeconds, sessions: doc.history.length, perPattern }
}
