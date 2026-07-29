/**
 * Engine unit tests.
 *
 * The headline is `describe('the replay property')` near the bottom: twenty-one
 * real sessions folded through `applySession` must land exactly on the
 * `midProgram` fixture. That single assertion covers a rep-ladder rung advance, a
 * time-ladder rung advance, a clean-at-max hold, a broken missed streak, a
 * three-deep missed streak that deloads at the floor of a ladder, and six cardio
 * sessions that must change nothing at all. Everything above it exists so that
 * when the replay fails, the failure names the rule that broke.
 *
 * `progress.ts` is tested here too rather than in a file of its own — brief 04's
 * file list does not include a `progress.test.ts`, and its assertions belong next
 * to the engine transitions that produce the numbers.
 *
 * ── v2: there is no effort input, so there is nothing to fake ────────────────
 *
 * The `exercise()` helper below used to take an `Effort`. It does not any more,
 * and that is the point: a test cannot construct an input the app cannot collect.
 * The tests that existed only to pin effort behaviour (`isClean`, the `easy`
 * fast-track, "every rep done but rated hard → hold") are gone with the rule they
 * covered; the tests that pinned *real* behaviour through an effort argument were
 * ported, not deleted.
 */
import type { ExerciseResult, Pattern, SessionResult, StateDoc } from '../types.ts'
import { CURRENT_SCHEMA_VERSION, PATTERNS, cycleDayAt } from '../types.ts'
import { LADDERS, findRungById, getRung, topRungIndex } from '../ladders.ts'
import {
  CLEAN_AT_MAX_TO_ADVANCE,
  MISSES_TO_REGRESS,
  SETS_PER_EXERCISE,
  applySession,
  deriveLadderStates,
  freshLadderStates,
  isCompleted,
  isLadderMaxed,
  missedTarget,
  nextSession,
  rungIndexOf,
  stepsPerRung,
  targetStep,
} from '../engine.ts'
import { currentProgressIndex, progressIndex, progressSeries, rungChangePoints } from '../progress.ts'
import {
  defaultSettings,
  ladderState,
  midProgram,
  midProgramHistory,
  midProgramStart,
  sets,
} from './fixtures.ts'

// ─── Helpers ────────────────────────────────────────────────────────────────

function doc(ladders: Partial<StateDoc['ladders']>, overrides: Partial<StateDoc> = {}): StateDoc {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    sessionsCompleted: 0,
    cyclePosition: 0,
    ladders: { ...freshLadderStates(), ...ladders },
    history: [],
    settings: defaultSettings,
    ...overrides,
  }
}

function exercise(
  pattern: Pattern,
  rungIndex: number,
  target: number,
  ...actuals: number[]
): ExerciseResult {
  return {
    pattern,
    rungId: getRung(pattern, rungIndex).id,
    sets: sets(target, ...actuals),
  }
}

function session(...exercises: ExerciseResult[]): SessionResult {
  return { completedAt: '2026-01-01T07:00:00.000Z', day: 'A', exercises }
}

/** A cardio session: a real completed session that trains no ladder. */
function cardioSession(): SessionResult {
  return { completedAt: '2026-01-01T07:00:00.000Z', day: 'D', exercises: [] }
}

/** Apply one exercise to one pattern and return just that pattern's new state. */
function step(pattern: Pattern, before: StateDoc['ladders'][Pattern], ex: ExerciseResult) {
  return applySession(doc({ [pattern]: before }), session(ex)).ladders[pattern]
}

/** The state after replaying the first `n` sessions of the fixture. */
function replay(n: number): StateDoc {
  return midProgramHistory.slice(0, n).reduce(applySession, midProgramStart)
}

const PUSH = LADDERS.push
const CORE = LADDERS.core

// ─── The predicate ──────────────────────────────────────────────────────────

describe('isCompleted', () => {
  it('is true when every set hit its target', () => {
    expect(isCompleted(exercise('push', 3, 8, 8, 8, 8))).toBe(true)
  })

  it('is false when any set fell short, wherever it fell short', () => {
    expect(isCompleted(exercise('push', 3, 8, 7, 8, 8))).toBe(false)
    expect(isCompleted(exercise('push', 3, 8, 8, 7, 8))).toBe(false)
    expect(isCompleted(exercise('push', 3, 8, 8, 8, 7))).toBe(false)
  })

  it('counts overshooting a target as hitting it', () => {
    expect(isCompleted(exercise('push', 3, 8, 9, 8, 8))).toBe(true)
  })

  it('is false for an exercise with no sets — an empty log is not a success', () => {
    // The engine must never assume completion. If "Done" were the only signal it
    // would believe every set was hit and march the user up the ladder.
    expect(isCompleted({ pattern: 'push', rungId: 'push-04-full', sets: [] })).toBe(false)
  })
})

describe('missedTarget', () => {
  it('is the exact negation of isCompleted, on every shape', () => {
    // v1 had a third case: every rep done, last set rated `hard`. That input is
    // gone, so these two predicates now partition every possible exercise.
    const cases: ExerciseResult[] = [
      exercise('push', 3, 8, 8, 8, 8),
      exercise('push', 3, 8, 8, 8, 7),
      exercise('core', 1, 30, 30, 25, 30),
      { pattern: 'push', rungId: 'push-04-full', sets: [] },
    ]
    for (const ex of cases) {
      expect(missedTarget(ex)).toBe(!isCompleted(ex))
    }
  })

  it('is true only when some set actually fell short', () => {
    expect(missedTarget(exercise('push', 3, 8, 8, 8, 7))).toBe(true)
    expect(missedTarget(exercise('push', 3, 8, 8, 8, 8))).toBe(false)
  })

  it('treats an empty log as a miss, so an empty exercise cannot advance anything', () => {
    expect(missedTarget({ pattern: 'push', rungId: 'push-04-full', sets: [] })).toBe(true)
  })
})

// ─── Unit arithmetic ────────────────────────────────────────────────────────

describe('targetStep and stepsPerRung', () => {
  it('steps reps by 1 over eight targets and seconds by 5 over six', () => {
    expect(targetStep('reps')).toBe(1)
    expect(targetStep('seconds')).toBe(5)
    expect(stepsPerRung('reps')).toBe(8)
    expect(stepsPerRung('seconds')).toBe(6)
  })

  it('spans exactly each ladder’s declared range', () => {
    for (const ladder of Object.values(LADDERS)) {
      const span = (ladder.targetMax - ladder.targetMin) / targetStep(ladder.unit)
      expect(span + 1, `${ladder.pattern} target count`).toBe(stepsPerRung(ladder.unit))
    }
  })
})

describe('rungIndexOf', () => {
  it('resolves a rung id to its 0-based index, not the 1-based number in the id', () => {
    expect(rungIndexOf('push', 'push-03-knees')).toBe(2)
    expect(rungIndexOf('core', 'core-02-plank')).toBe(1)
    expect(rungIndexOf('push', 'push-01-hands-high')).toBe(0)
  })

  it('returns -1 for an id that is not in that pattern’s ladder', () => {
    expect(rungIndexOf('push', 'core-02-plank')).toBe(-1)
    expect(rungIndexOf('push', 'push-99-jetpack')).toBe(-1)
  })
})

// ─── freshLadderStates: descending calibration starts mid-ladder ────────────

describe('freshLadderStates', () => {
  it('starts every ladder at its declared startRungIndex, not at rung 0', () => {
    const fresh = freshLadderStates()
    for (const pattern of PATTERNS) {
      expect(fresh[pattern].rungIndex, pattern).toBe(LADDERS[pattern].startRungIndex)
    }
    // And at least one of them really is off the bottom, or the whole
    // descending-calibration design is not actually wired up.
    expect(PATTERNS.some((p) => fresh[p].rungIndex > 0)).toBe(true)
  })

  it('starts the target at the bottom of the range on every ladder', () => {
    // Only the *movement* starts mid-ladder. Starting the volume high as well
    // would stack two guesses on top of each other.
    const fresh = freshLadderStates()
    for (const pattern of PATTERNS) {
      expect(fresh[pattern].target, pattern).toBe(LADDERS[pattern].targetMin)
      expect(fresh[pattern].cleanAtMax, pattern).toBe(0)
      expect(fresh[pattern].missedStreak, pattern).toBe(0)
    }
  })

  it('produces a state every ladder can actually be prescribed from', () => {
    expect(() => nextSession(doc({}))).not.toThrow()
    for (const pattern of PATTERNS) {
      expect(() => getRung(pattern, freshLadderStates()[pattern].rungIndex)).not.toThrow()
    }
  })
})

// ─── nextSession ────────────────────────────────────────────────────────────

describe('nextSession', () => {
  it('resolves the cycle day from cyclePosition, never from a date', () => {
    for (const [position, day, patterns] of [
      [0, 'A', ['push', 'pull']],
      [1, 'B', ['squat', 'hinge']],
      [2, 'C', ['core', 'pull']],
      [3, 'D', []],
      [4, 'A', ['push', 'pull']],
      [5, 'B', ['squat', 'hinge']],
      [6, 'D', []],
      [7, 'A', ['push', 'pull']],
      // 99 mod 7 = 1.
      [99, 'B', ['squat', 'hinge']],
    ] as const) {
      const prescription = nextSession(doc({}, { cyclePosition: position }))
      expect(prescription.day, `position ${position}`).toBe(day)
      expect(prescription.exercises.map((e) => e.pattern), `position ${position}`).toEqual([
        ...patterns,
      ])
    }
  })

  it('prescribes nothing at all on a cardio day, and says so', () => {
    // Brief 13 owns the cardio content; the engine's job is only to know that this
    // position trains no ladder.
    for (const position of [3, 6, 10, 13]) {
      const prescription = nextSession(doc({}, { cyclePosition: position }))
      expect(prescription.cardio, `position ${position}`).toBe(true)
      expect(prescription.exercises, `position ${position}`).toEqual([])
      expect(prescription.label).toBe('Cardio')
    }
  })

  it('marks every strength day as not cardio', () => {
    for (const position of [0, 1, 2, 4, 5, 7, 8, 9]) {
      const prescription = nextSession(doc({}, { cyclePosition: position }))
      expect(prescription.cardio, `position ${position}`).toBe(cycleDayAt(position).cardio)
      expect(prescription.exercises.length, `position ${position}`).toBeGreaterThan(0)
    }
  })

  it('prescribes the rung and target from `ladders`, which is authoritative', () => {
    const prescription = nextSession(doc({ push: ladderState(4, 9) }))
    const push = prescription.exercises[0]!
    expect(push.rungIndex).toBe(4)
    expect(push.rung.id).toBe('push-05-full-3s-down')
    expect(push.target).toBe(9)
    expect(push.sets).toBe(SETS_PER_EXERCISE)
    expect(push.unit).toBe('reps')
  })

  it('carries the ladder kind so the UI can label postural work honestly', () => {
    const prescription = nextSession(doc({}, { cyclePosition: 2 }))
    const byPattern = new Map(prescription.exercises.map((e) => [e.pattern, e]))
    expect(byPattern.get('core')!.kind).toBe('strength')
    expect(byPattern.get('pull')!.kind).toBe('postural')
  })

  it('numbers the session it is about to prescribe, 1-based', () => {
    expect(nextSession(midProgram).sessionNumber).toBe(midProgramHistory.length + 1)
    expect(nextSession(midProgramStart).sessionNumber).toBe(1)
  })

  it('has no `lastTime` on a first-ever session', () => {
    expect(nextSession(midProgramStart).exercises.every((e) => e.lastTime === undefined)).toBe(true)
  })

  it('reports the previous actuals for "Last time: 3×7"', () => {
    // midProgram's next session is #22, cycle position 21 → 21 mod 7 = 0 → day A.
    const prescription = nextSession(midProgram)
    expect(prescription.day).toBe('A')
    const push = prescription.exercises.find((e) => e.pattern === 'push')!
    expect(push.lastTime?.sets.map((s) => s.actualValue)).toEqual([6, 6, 6])
    expect(push.lastTime?.completedAt).toBe('2026-07-31T07:21:00.000Z')
  })

  it('skips the cardio sessions when looking back for the last performance', () => {
    // The most recent session in the fixture is a cardio day with no exercises.
    // "Last time" must reach past it to the last time this pattern was trained.
    expect(midProgramHistory.at(-1)?.exercises).toEqual([])
    const pull = nextSession(midProgram).exercises.find((e) => e.pattern === 'pull')!
    expect(pull.lastTime?.rungId).toBe('pull-02-prone-t')
    expect(pull.lastTime?.completedAt).toBe('2026-07-31T07:21:00.000Z')
  })

  it('flags `sameRung: false` after an advance, so a comparison is not implied', () => {
    // Session 12 is where push's second completed 3×12 advanced it to
    // `push-04-full`, so at that moment the last logged push was earned on
    // `push-03-knees` — an easier movement, and not a like-for-like comparison.
    const afterPushAdvance = { ...replay(12), cyclePosition: 0 }
    const push = nextSession(afterPushAdvance).exercises.find((e) => e.pattern === 'push')!
    expect(push.rung.id).toBe('push-04-full')
    expect(push.lastTime?.rungId).toBe('push-03-knees')
    expect(push.lastTime?.sameRung).toBe(false)

    // Session 15 does the same on a time ladder: pull advanced to `pull-02-prone-t`
    // off two completed 45s holds on `pull-01-prone-y`.
    const afterPullAdvance = { ...replay(15), cyclePosition: 2 }
    const pull = nextSession(afterPullAdvance).exercises.find((e) => e.pattern === 'pull')!
    expect(pull.rung.id).toBe('pull-02-prone-t')
    expect(pull.lastTime?.rungId).toBe('pull-01-prone-y')
    expect(pull.lastTime?.sameRung).toBe(false)

    // A pattern that merely bumped its target stayed on the same rung, so the
    // comparison is like-for-like and `sameRung` is true.
    const core = nextSession({ ...midProgram, cyclePosition: 2 }).exercises.find(
      (e) => e.pattern === 'core',
    )!
    expect(core.rung.id).toBe('core-02-plank')
    expect(core.lastTime?.rungId).toBe('core-02-plank')
    expect(core.lastTime?.sameRung).toBe(true)
  })

  it('surfaces `ladderMaxed` at the top of a ladder with the target capped', () => {
    const top = topRungIndex('hinge')
    const maxed = nextSession(doc({ hinge: ladderState(top, 12, 2) }, { cyclePosition: 1 }))
    expect(maxed.exercises.find((e) => e.pattern === 'hinge')!.ladderMaxed).toBe(true)

    const notMaxed = nextSession(doc({ hinge: ladderState(top, 11) }, { cyclePosition: 1 }))
    expect(notMaxed.exercises.find((e) => e.pattern === 'hinge')!.ladderMaxed).toBe(false)

    const notTop = nextSession(doc({ hinge: ladderState(top - 1, 12) }, { cyclePosition: 1 }))
    expect(notTop.exercises.find((e) => e.pattern === 'hinge')!.ladderMaxed).toBe(false)
  })

  it('throws loudly on a hand-edited rungIndex past the end of a ladder', () => {
    // Rendering blank cues and logging a session against nothing is worse than
    // an error the user can see and fix in the file they hand-edited.
    expect(() => nextSession(doc({ push: ladderState(99, 5) }))).toThrow(/no rung at index 99/)
  })

  it('does not mutate the document it reads', () => {
    const before = deepFreeze(structuredClone(midProgram))
    expect(() => nextSession(before)).not.toThrow()
  })
})

// ─── applySession: the rule table ───────────────────────────────────────────

describe('applySession — sub-max, completed', () => {
  it('bumps a rep target by 1', () => {
    expect(step('push', ladderState(3, 8), exercise('push', 3, 8, 8, 8, 8))).toEqual(
      ladderState(3, 9),
    )
  })

  it('bumps a time target by 5, not by 1', () => {
    expect(step('core', ladderState(1, 25), exercise('core', 1, 25, 25, 25, 25))).toEqual(
      ladderState(1, 30),
    )
  })

  it('never bumps past the cap', () => {
    expect(
      step('push', ladderState(3, PUSH.targetMax - 1), exercise('push', 3, 11, 11, 11, 11)),
    ).toEqual(ladderState(3, PUSH.targetMax))
  })

  it('clears a missed streak', () => {
    expect(step('push', ladderState(3, 8, 0, 2), exercise('push', 3, 8, 8, 8, 8))).toEqual(
      ladderState(3, 9),
    )
  })
})

describe('applySession — there is no fast-track any more', () => {
  // Wave-4 rulings 1 and 2 both concerned the `easy` fast-track. With effort gone
  // the only route up any ladder is two completed sessions at `targetMax`, and
  // these tests pin the *absence* of the shortcut: it was the app's only
  // calibration mechanism, so its removal is what descending calibration replaces.
  it('bumps the target by one step from any sub-max target, and never advances', () => {
    for (const target of [5, 8, 11]) {
      const after = step('push', ladderState(1, target), exercise('push', 1, target, target, target, target))
      expect(after, `push at ${target}`).toEqual(ladderState(1, target + 1))
    }
  })

  it('costs 9 completed sessions to climb one rep rung, not one', () => {
    // Seven +1 bumps from 5 to 12, then two completed sessions at the cap.
    let state = ladderState(0, PUSH.targetMin)
    let sessions = 0
    while (state.rungIndex === 0) {
      state = step('push', state, exercise('push', 0, state.target, state.target, state.target, state.target))
      sessions += 1
      expect(sessions, 'runaway').toBeLessThan(30)
    }
    expect(sessions).toBe(9)
    expect(state).toEqual(ladderState(1, PUSH.targetMin))
  })

  it('costs 7 completed sessions to climb one time rung', () => {
    // Five +5s bumps from 20s to 45s, then two completed sessions at the cap.
    // Time and rep ladders now differ only in the arithmetic, never in the rules.
    let state = ladderState(0, CORE.targetMin)
    let sessions = 0
    while (state.rungIndex === 0) {
      state = step('core', state, exercise('core', 0, state.target, state.target, state.target, state.target))
      sessions += 1
      expect(sessions, 'runaway').toBeLessThan(30)
    }
    expect(sessions).toBe(7)
    expect(state).toEqual(ladderState(1, CORE.targetMin))
  })

  it('treats a rep ladder and a time ladder identically at the same relative position', () => {
    // The one place v1 branched on `unit` beyond arithmetic was the fast-track.
    const repAtMax = step('push', ladderState(1, PUSH.targetMax), exercise('push', 1, 12, 12, 12, 12))
    const timeAtMax = step('core', ladderState(1, CORE.targetMax), exercise('core', 1, 45, 45, 45, 45))
    expect(repAtMax.cleanAtMax).toBe(timeAtMax.cleanAtMax)
    expect(repAtMax.rungIndex).toBe(timeAtMax.rungIndex)
  })
})

describe('applySession — at max, completed', () => {
  it('holds on the first completed session at max and counts it', () => {
    expect(step('push', ladderState(3, 12), exercise('push', 3, 12, 12, 12, 12))).toEqual(
      ladderState(3, 12, 1),
    )
  })

  it('advances on the second, resetting the target to the bottom', () => {
    expect(step('push', ladderState(3, 12, 1), exercise('push', 3, 12, 12, 12, 12))).toEqual(
      ladderState(4, PUSH.targetMin),
    )
    expect(CLEAN_AT_MAX_TO_ADVANCE).toBe(2)
  })

  it('advances a time ladder on the second completed session at max', () => {
    const first = step('pull', ladderState(0, 45), exercise('pull', 0, 45, 45, 45, 45))
    expect(first).toEqual(ladderState(0, 45, 1))
    expect(step('pull', first, exercise('pull', 0, 45, 45, 45, 45))).toEqual(ladderState(1, 20))
  })

  it('is repeatable: the next rung advances the same way', () => {
    let state = ladderState(0, PUSH.targetMax, 1)
    state = step('push', state, exercise('push', 0, 12, 12, 12, 12))
    expect(state).toEqual(ladderState(1, PUSH.targetMin))
    state = step('push', ladderState(1, PUSH.targetMax, 1), exercise('push', 1, 12, 12, 12, 12))
    expect(state).toEqual(ladderState(2, PUSH.targetMin))
  })

  it('resets the clean-at-max count on a miss, so two must be consecutive', () => {
    const held = step('push', ladderState(3, 12), exercise('push', 3, 12, 12, 12, 12))
    expect(held.cleanAtMax).toBe(1)
    const missed = step('push', held, exercise('push', 3, 12, 12, 12, 10))
    expect(missed.cleanAtMax).toBe(0)
    expect(missed.missedStreak).toBe(1)
  })

  it('resets the clean-at-max count when the target drops below the cap', () => {
    // A sub-max session clears it, so the two at the cap really are consecutive.
    const submax = step('push', ladderState(3, 12, 1), exercise('push', 3, 11, 11, 11, 11))
    expect(submax.cleanAtMax).toBe(0)
  })
})

describe('applySession — missed target', () => {
  it('holds on the first miss', () => {
    expect(step('push', ladderState(3, 9), exercise('push', 3, 9, 9, 9, 8))).toEqual(
      ladderState(3, 9, 0, 1),
    )
  })

  it('holds on the second, and does not regress yet — the exact boundary', () => {
    expect(step('push', ladderState(3, 9, 0, 1), exercise('push', 3, 9, 9, 9, 8))).toEqual(
      ladderState(3, 9, 0, 2),
    )
  })

  it('deloads on the third to the TOP of the rung below, one step down', () => {
    // Rung 3 at 3×9 is index 3×8+4 = 28; rung 2 at 3×12 is 2×8+7 = 23. Resetting
    // to the bottom of the rung below would be a 12-step cliff and an eight-session
    // re-climb of work the user had already completed.
    expect(step('push', ladderState(3, 9, 0, 2), exercise('push', 3, 9, 9, 9, 8))).toEqual(
      ladderState(2, PUSH.targetMax),
    )
    expect(MISSES_TO_REGRESS).toBe(3)
  })

  it('makes the re-climb short: two completed sessions at the lower cap advance back', () => {
    const deloaded = step('push', ladderState(3, 5, 0, 2), exercise('push', 3, 5, 5, 5, 4))
    expect(deloaded).toEqual(ladderState(2, PUSH.targetMax))
    const once = step('push', deloaded, exercise('push', 2, 12, 12, 12, 12))
    expect(once).toEqual(ladderState(2, PUSH.targetMax, 1))
    expect(step('push', once, exercise('push', 2, 12, 12, 12, 12))).toEqual(
      ladderState(3, PUSH.targetMin),
    )
  })

  it('deloads a time ladder to the lower rung’s cap too', () => {
    expect(step('core', ladderState(2, 30, 0, 2), exercise('core', 2, 30, 30, 30, 25))).toEqual(
      ladderState(1, CORE.targetMax),
    )
  })

  it('restarts the count after a deload rather than dropping a rung every session', () => {
    let state = ladderState(5, 7, 0, 2)
    state = step('push', state, exercise('push', 5, 7, 7, 7, 5))
    expect(state).toEqual(ladderState(4, PUSH.targetMax))
    state = step('push', state, exercise('push', 4, 12, 12, 12, 11))
    expect(state).toEqual(ladderState(4, PUSH.targetMax, 0, 1))
  })

  it('counts a shortfall of one rep on any single set as a miss', () => {
    // No rating can rescue a short set, because there is no rating. One rep on any
    // one of the three sets is the whole difference between climbing and holding.
    for (const actuals of [
      [8, 9, 9],
      [9, 8, 9],
      [9, 9, 8],
    ]) {
      expect(step('push', ladderState(3, 9), exercise('push', 3, 9, ...actuals))).toEqual(
        ladderState(3, 9, 0, 1),
      )
    }
  })

  it('requires the misses to be consecutive', () => {
    let state = ladderState(3, 9)
    state = step('push', state, exercise('push', 3, 9, 9, 9, 8))
    state = step('push', state, exercise('push', 3, 9, 9, 9, 8))
    expect(state.missedStreak).toBe(2)
    state = step('push', state, exercise('push', 3, 9, 9, 9, 9))
    expect(state).toEqual(ladderState(3, 10))
  })

  it('walks a user down rung by rung when the start was simply too hard', () => {
    // Descending calibration, at the level of a single ladder: someone planted
    // three rungs above their capability who cannot complete anything takes
    // exactly three missed sessions per rung to come down.
    let state = ladderState(5, PUSH.targetMin)
    const drops: number[] = []
    for (let i = 0; i < 9; i += 1) {
      const before = state.rungIndex
      state = step('push', state, exercise('push', 5, state.target, 0, 0, 0))
      if (state.rungIndex < before) drops.push(state.rungIndex)
    }
    expect(drops).toEqual([4, 3, 2])
    expect(state).toEqual(ladderState(2, PUSH.targetMax, 0, 0))
  })
})

// ─── Clamps ─────────────────────────────────────────────────────────────────

describe('applySession — clamps', () => {
  it('never drops below rung 0, and cannot go below its bottom target either', () => {
    expect(step('push', ladderState(0, 5, 0, 2), exercise('push', 0, 5, 5, 4, 3))).toEqual(
      ladderState(0, PUSH.targetMin),
    )
  })

  it('deloads by one target step at rung 0, because there is no rung left to drop', () => {
    // 45s → 40s, not 45s → 20s. Still worth naming, because the progress index
    // falls here with NO change in `rungIndex` — a chart annotation keyed on
    // `rungIndex` alone would not mark it (brief 09).
    expect(step('core', ladderState(0, 45, 0, 2), exercise('core', 0, 45, 45, 40, 38))).toEqual(
      ladderState(0, 40),
    )
    expect(step('push', ladderState(0, 9, 0, 2), exercise('push', 0, 9, 9, 9, 7))).toEqual(
      ladderState(0, 8),
    )
  })

  it('holds at the top of a ladder instead of walking off the end', () => {
    const top = topRungIndex('push')
    const state = step('push', ladderState(top, 12, 1), exercise('push', top, 12, 12, 12, 12))
    expect(state.rungIndex).toBe(top)
    expect(state.target).toBe(PUSH.targetMax)
    expect(isLadderMaxed('push', state)).toBe(true)
  })

  it('is a fixed point at the top, however many completed sessions arrive', () => {
    const top = topRungIndex('push')
    let state = ladderState(top, PUSH.targetMax, 2)
    for (let i = 0; i < 5; i += 1) {
      state = step('push', state, exercise('push', top, 12, 12, 12, 12))
    }
    expect(state).toEqual(ladderState(top, PUSH.targetMax, CLEAN_AT_MAX_TO_ADVANCE))
  })

  it('pulls a hand-edited out-of-range target back into the ladder’s range', () => {
    // Above the cap: treated as at-max, so a completed session counts toward the
    // advance and the target is repaired.
    expect(step('push', ladderState(3, 100), exercise('push', 3, 100, 100, 100, 100))).toEqual(
      ladderState(3, PUSH.targetMax, 1),
    )
    // Below the bottom: repaired on the first session rather than climbing from 3.
    expect(step('push', ladderState(3, 3), exercise('push', 3, 3, 3, 3, 2))).toEqual(
      ladderState(3, PUSH.targetMin, 0, 1),
    )
  })

  it('pulls a hand-edited out-of-range rungIndex back into the ladder', () => {
    // `nextSession` throws on this, but if a session is somehow applied against
    // it the engine must not persist an impossible index.
    const state = step('push', ladderState(99, 12, 1), exercise('push', 0, 12, 12, 12, 12))
    expect(state.rungIndex).toBe(topRungIndex('push'))
  })

  it('never produces a rungIndex outside any ladder’s bounds', () => {
    for (const pattern of PATTERNS) {
      const ladder = LADDERS[pattern]
      const top = topRungIndex(pattern)
      for (const rungIndex of [0, 1, top]) {
        for (const target of [ladder.targetMin, ladder.targetMax]) {
          for (const shortfall of [0, 1]) {
            const ex: ExerciseResult = {
              pattern,
              rungId: getRung(pattern, rungIndex).id,
              sets: sets(target, target, target, target - shortfall),
            }
            for (const streak of [0, 1, 2]) {
              const after = step(pattern, ladderState(rungIndex, target, 1, streak), ex)
              expect(after.rungIndex).toBeGreaterThanOrEqual(0)
              expect(after.rungIndex).toBeLessThanOrEqual(top)
            }
          }
        }
      }
    }
  })
})

// ─── Document-level behaviour ───────────────────────────────────────────────

describe('applySession — the document', () => {
  it('advances sessionsCompleted and cyclePosition by exactly one', () => {
    const after = applySession(
      doc({}, { sessionsCompleted: 41, cyclePosition: 41 }),
      session(exercise('push', 0, 5, 5, 5, 5)),
    )
    expect(after.sessionsCompleted).toBe(42)
    expect(after.cyclePosition).toBe(42)
  })

  it('advances the cycle on completion, whatever the timestamps say', () => {
    // A five-day gap and a same-minute repeat must be indistinguishable: there is
    // no date arithmetic in the engine, so there is no missed day to model.
    const gap = applySession(doc({}), {
      completedAt: '2027-11-30T23:59:00.000Z',
      day: 'A',
      exercises: [exercise('push', 0, 5, 5, 5, 5)],
    })
    const immediate = applySession(doc({}), {
      completedAt: '2026-01-01T00:00:00.000Z',
      day: 'A',
      exercises: [exercise('push', 0, 5, 5, 5, 5)],
    })
    expect(gap.cyclePosition).toBe(immediate.cyclePosition)
    expect(gap.ladders).toEqual(immediate.ladders)
  })

  it('appends the result to history', () => {
    const result = session(exercise('push', 0, 5, 5, 5, 5))
    const after = applySession(doc({}), result)
    expect(after.history).toEqual([result])
  })

  it('leaves patterns the session did not train untouched', () => {
    const before = doc({ hinge: ladderState(2, 7, 1, 1) })
    const after = applySession(before, session(exercise('push', 0, 5, 5, 5, 5)))
    expect(after.ladders.hinge).toEqual(before.ladders.hinge)
    expect(after.ladders.squat).toEqual(before.ladders.squat)
  })

  it('carries schemaVersion and settings through unchanged', () => {
    const after = applySession(midProgramStart, midProgramHistory[0]!)
    expect(after.schemaVersion).toBe(midProgramStart.schemaVersion)
    expect(after.settings).toEqual(midProgramStart.settings)
  })

  it('does not mutate its input, at any depth', () => {
    const before = deepFreeze(structuredClone(midProgram))
    const result = session(exercise('push', 3, 7, 7, 7, 7), exercise('pull', 1, 30, 30, 30, 30))
    const after = applySession(before, result)
    expect(after).not.toBe(before)
    expect(before.sessionsCompleted).toBe(midProgramHistory.length)
    expect(before.history).toHaveLength(midProgramHistory.length)
    expect(before.ladders.push).toEqual(ladderState(3, 7))
    expect(after.ladders.push).toEqual(ladderState(3, 8))
    expect(before.ladders.pull).toEqual(ladderState(1, 30))
    expect(after.ladders.pull).toEqual(ladderState(1, 35))
  })
})

// ─── A cardio session trains no ladder ──────────────────────────────────────

describe('applySession — a cardio session', () => {
  it('advances the counters and history while mutating no ladder state', () => {
    const before = doc({ push: ladderState(4, 9, 1, 2) }, { sessionsCompleted: 7, cyclePosition: 3 })
    const result = cardioSession()
    const after = applySession(before, result)

    expect(after.sessionsCompleted).toBe(8)
    expect(after.cyclePosition).toBe(4)
    expect(after.history).toEqual([result])
    // Not "equal to a fresh ladder set" — byte-identical to what went in,
    // including the streak counters a careless reset would clear.
    expect(after.ladders).toEqual(before.ladders)
    for (const pattern of PATTERNS) {
      expect(after.ladders[pattern], pattern).toEqual(before.ladders[pattern])
    }
  })

  it('does not reset a missed streak, so cardio cannot launder a bad week', () => {
    // A user two misses deep who then does two cardio days must still be two
    // misses deep: not training a pattern is neither a miss nor a success.
    let state = doc({ hinge: ladderState(0, 12, 0, 2) }, { cyclePosition: 3 })
    state = applySession(state, cardioSession())
    state = applySession(state, cardioSession())
    expect(state.ladders.hinge).toEqual(ladderState(0, 12, 0, 2))
    // And the next real miss is still the third one, so it deloads.
    const after = applySession(state, session(exercise('hinge', 0, 12, 12, 11, 10)))
    expect(after.ladders.hinge).toEqual(ladderState(0, 11))
  })

  it('keeps a run of cardio days walking the cycle forward one position each', () => {
    let state = doc({}, { cyclePosition: 0 })
    const days: string[] = []
    for (let i = 0; i < 7; i += 1) {
      days.push(nextSession(state).day)
      state = applySession(state, cardioSession())
    }
    expect(days).toEqual(['A', 'B', 'C', 'D', 'A', 'B', 'D'])
    expect(state.cyclePosition).toBe(7)
    expect(state.ladders).toEqual(freshLadderStates())
  })
})

// ─── The headline: the replay property ──────────────────────────────────────

describe('the replay property', () => {
  it('folds midProgramHistory from midProgramStart onto midProgram exactly', () => {
    expect(midProgramHistory.reduce(applySession, midProgramStart)).toEqual(midProgram)
  })

  it('reaches the same place one session at a time', () => {
    // Guards against a fold that only works because `reduce` passes extra
    // arguments the engine happens to ignore.
    let state = midProgramStart
    for (const result of midProgramHistory) state = applySession(state, result)
    expect(state).toEqual(midProgram)
  })

  it('walks each ladder through the trajectory the fixture documents', () => {
    const targets = new Map<Pattern, number[]>()
    const rungs = new Map<Pattern, number[]>()
    let state = midProgramStart
    for (const result of midProgramHistory) {
      for (const ex of result.exercises) {
        targets.set(ex.pattern, [
          ...(targets.get(ex.pattern) ?? []),
          state.ladders[ex.pattern].target,
        ])
        rungs.set(ex.pattern, [
          ...(rungs.get(ex.pattern) ?? []),
          state.ladders[ex.pattern].rungIndex,
        ])
      }
      state = applySession(state, result)
    }
    // push: climb to the cap, hold once, advance, climb again.
    expect(targets.get('push')).toEqual([10, 11, 12, 12, 5, 6])
    expect(rungs.get('push')).toEqual([2, 2, 2, 2, 3, 3])
    // squat: a miss at 11 holds, the next completed session clears the streak.
    expect(targets.get('squat')).toEqual([10, 11, 11, 12, 12, 12])
    expect(rungs.get('squat')).toEqual([1, 1, 1, 1, 1, 1])
    // hinge: three consecutive misses at 12 deload to 11 without a rung change.
    expect(targets.get('hinge')).toEqual([11, 12, 12, 12, 11, 12])
    expect(rungs.get('hinge')).toEqual([0, 0, 0, 0, 0, 0])
    // core: +5s a session, never +1s.
    expect(targets.get('core')).toEqual([25, 30, 35])
    // pull: 20s → 45s, two completed sessions at the cap, then the next rung.
    expect(targets.get('pull')).toEqual([20, 25, 30, 35, 40, 45, 45, 20, 25])
    expect(rungs.get('pull')).toEqual([0, 0, 0, 0, 0, 0, 0, 1, 1])
  })

  it('gives all five ladders genuinely different trajectories', () => {
    // A fixture where every pattern behaves the same way hides most engine bugs.
    const trajectories = PATTERNS.map((pattern) => {
      let state = midProgramStart
      const path: string[] = []
      for (const result of midProgramHistory) {
        const ex = result.exercises.find((e) => e.pattern === pattern)
        if (ex) {
          const { rungIndex, target } = state.ladders[pattern]
          path.push(`${rungIndex}@${target}`)
        }
        state = applySession(state, result)
      }
      return path.join(' → ')
    })
    expect(new Set(trajectories).size).toBe(PATTERNS.length)
  })

  it('exercises every row of the rule table at least once', () => {
    let state = midProgramStart
    let bumps = 0
    let holdsAtMax = 0
    let advances = 0
    let missHolds = 0
    let deloads = 0
    let cardioSessions = 0
    for (const result of midProgramHistory) {
      const after = applySession(state, result)
      if (result.exercises.length === 0) {
        cardioSessions += 1
        expect(after.ladders).toEqual(state.ladders)
      }
      for (const ex of result.exercises) {
        const b = state.ladders[ex.pattern]
        const a = after.ladders[ex.pattern]
        if (a.rungIndex > b.rungIndex) advances += 1
        else if (a.rungIndex < b.rungIndex || a.target < b.target) deloads += 1
        else if (a.target > b.target) bumps += 1
        else if (a.cleanAtMax > b.cleanAtMax) holdsAtMax += 1
        else if (a.missedStreak > b.missedStreak) missHolds += 1
      }
      state = after
    }
    expect({ bumps, holdsAtMax, advances, missHolds, deloads, cardioSessions }).toEqual({
      // 30 logged exercises in total: 18 + 4 + 2 + 5 + 1.
      bumps: 18,
      holdsAtMax: 4,
      advances: 2,
      missHolds: 5,
      deloads: 1,
      cardioSessions: 6,
    })
  })

  it('resolves every rung id in the history to the rung it was logged at', () => {
    for (const result of midProgramHistory) {
      for (const ex of result.exercises) {
        expect(findRungById(ex.rungId), `${ex.rungId} missing from LADDERS`).toBeDefined()
        const index = rungIndexOf(ex.pattern, ex.rungId)
        expect(index, `${ex.rungId} not in the ${ex.pattern} ladder`).toBeGreaterThanOrEqual(0)
        expect(getRung(ex.pattern, index).id).toBe(ex.rungId)
      }
    }
  })
})

// ─── deriveLadderStates ─────────────────────────────────────────────────────

describe('deriveLadderStates', () => {
  it('reconstructs every ladder state from history alone', () => {
    // Under v1 the fixture's squat log was deliberately STALE — the `easy`
    // fast-track moved the ladder somewhere the log did not record, so this
    // function and `applySession` disagreed on one pattern. With no fast-track
    // nothing can move a ladder off the log any more, so the staleness resolves
    // itself and the two agree everywhere.
    expect(deriveLadderStates(midProgramHistory)).toEqual(midProgram.ladders)
  })

  it('repairs corrupted counters without discarding history', () => {
    const corrupted: StateDoc = {
      ...midProgram,
      ladders: {
        ...midProgram.ladders,
        hinge: ladderState(4, 5, 7, 0),
        pull: ladderState(0, 20, 9),
      },
    }
    const repaired = deriveLadderStates(corrupted.history)
    expect(repaired.hinge).toEqual(midProgram.ladders.hinge)
    expect(repaired.pull).toEqual(midProgram.ladders.pull)
  })

  it('ignores cardio sessions, which record no work to replay', () => {
    const cardioOnly = midProgramHistory.filter((s) => s.exercises.length === 0)
    expect(cardioOnly).toHaveLength(6)
    expect(deriveLadderStates(cardioOnly)).toEqual(freshLadderStates())
  })

  it('leaves an untrained pattern at its starting rung', () => {
    const derived = deriveLadderStates([session(exercise('push', 0, 5, 5, 5, 5))])
    expect(derived.core).toEqual(ladderState(LADDERS.core.startRungIndex, CORE.targetMin))
    expect(derived.push).toEqual(ladderState(0, 6))
  })

  it('returns a fresh set of states for empty history', () => {
    expect(deriveLadderStates([])).toEqual(freshLadderStates())
  })

  it('falls back to the carried rung rather than crashing on an unresolvable id', () => {
    // A repair tool that throws on the data it was invoked to repair is useless.
    const history: SessionResult[] = [
      session(exercise('push', 0, 5, 5, 5, 5)),
      session({ pattern: 'push', rungId: 'push-99-jetpack', sets: sets(6, 6, 6, 6) }),
    ]
    expect(() => deriveLadderStates(history)).not.toThrow()
    expect(deriveLadderStates(history).push).toEqual(ladderState(0, 7))
  })

  it('is not run implicitly by applySession — a hand-edit must survive a session', () => {
    // The locked resolution in types.ts: `ladders` wins on read, derivation is an
    // explicitly invoked repair. If `applySession` consulted history it would
    // silently revert this edit.
    const handEdited: StateDoc = {
      ...midProgram,
      ladders: { ...midProgram.ladders, push: ladderState(6, 5) },
    }
    expect(deriveLadderStates(handEdited.history).push).toEqual(ladderState(3, 7))
    const after = applySession(handEdited, session(exercise('push', 6, 5, 5, 5, 5)))
    expect(after.ladders.push).toEqual(ladderState(6, 6))
  })

  it('picks a hand-edit up on the next replay, because history records its effect', () => {
    // The other half of the resolution: derivation trusts the rung id and target
    // each session was logged at, so a deliberate edit is not undone by a later
    // repair — only corrupted counters are.
    const handEdited: StateDoc = {
      ...midProgram,
      ladders: { ...midProgram.ladders, push: ladderState(6, 5) },
    }
    const after = applySession(handEdited, session(exercise('push', 6, 5, 5, 5, 5)))
    expect(deriveLadderStates(after.history).push).toEqual(ladderState(6, 6))
  })
})

// ─── progress.ts ────────────────────────────────────────────────────────────

describe('progressIndex', () => {
  it('is the rung stride plus the offset within the rung', () => {
    expect(progressIndex(0, 5, PUSH)).toBe(0)
    expect(progressIndex(0, 12, PUSH)).toBe(7)
    expect(progressIndex(2, 12, PUSH)).toBe(23)
    expect(progressIndex(0, 20, CORE)).toBe(0)
    expect(progressIndex(0, 45, CORE)).toBe(5)
    expect(progressIndex(1, 20, CORE)).toBe(6)
  })

  it('increases across a rung advance — the transition a rep chart misrenders', () => {
    // push in the fixture goes 3×12 on rung 2 → 3×5 on rung 3. Raw reps read
    // 12 → 5 and look like a collapse; the index reads 23 → 24.
    expect(progressIndex(2, 12, PUSH)).toBeLessThan(progressIndex(3, 5, PUSH))
    expect(progressIndex(0, 45, CORE)).toBeLessThan(progressIndex(1, 20, CORE))
  })

  it('is strictly increasing along every step of every ladder', () => {
    for (const pattern of PATTERNS) {
      const ladder = LADDERS[pattern]
      const walk: number[] = []
      for (let r = 0; r < ladder.rungs.length; r += 1) {
        for (let t = ladder.targetMin; t <= ladder.targetMax; t += targetStep(ladder.unit)) {
          walk.push(progressIndex(r, t, ladder))
        }
      }
      for (let i = 1; i < walk.length; i += 1) {
        expect(walk[i], `${pattern} step ${i}`).toBe(walk[i - 1]! + 1)
      }
    }
  })

  it('reads a pattern’s current position from its ladder state', () => {
    // push: rung 3 at 3×7 → 3×8 + 2 = 26. core: rung 1 at 40s → 6 + 4 = 10.
    expect(currentProgressIndex('push', midProgram.ladders.push)).toBe(26)
    expect(currentProgressIndex('core', midProgram.ladders.core)).toBe(10)
  })
})

describe('progressSeries', () => {
  it('emits one point per session performed, in order, skipping cardio days', () => {
    const series = progressSeries(midProgramHistory)
    expect(series.push.map((p) => p.sessionsCompleted)).toEqual([1, 5, 8, 12, 15, 19])
    expect(series.pull.map((p) => p.sessionsCompleted)).toEqual([1, 3, 5, 8, 10, 12, 15, 17, 19])
    expect(series.core.map((p) => p.sessionsCompleted)).toEqual([3, 10, 17])
    expect(series.squat).toHaveLength(6)
    // Six of the 21 sessions are cardio and contribute no point to any series.
    const points = PATTERNS.reduce((n, p) => n + series[p].length, 0)
    expect(points).toBe(30)
  })

  it('never goes backwards except at the fixture’s one deload', () => {
    // A deload is real and the chart should show it. What the index must never do
    // is fall because of the double-progression reset, which is the whole reason
    // raw reps are unplottable.
    const series = progressSeries(midProgramHistory)
    const decreases: { pattern: Pattern; from: number; to: number }[] = []
    for (const pattern of PATTERNS) {
      const values = series[pattern].map((p) => p.progressIndex)
      for (let i = 1; i < values.length; i += 1) {
        if (values[i]! < values[i - 1]!) {
          decreases.push({ pattern, from: values[i - 1]!, to: values[i]! })
        }
      }
    }
    // hinge deloaded at session 13 from 3×12 to 3×11 — index 7 → 6, one step, and
    // with NO change in rungIndex, which is why brief 09 cannot key its deload
    // annotation on the rung alone.
    expect(decreases).toEqual([{ pattern: 'hinge', from: 7, to: 6 }])
    expect(series.push.map((p) => p.progressIndex)).toEqual([21, 22, 23, 23, 24, 25])
    expect(series.pull.map((p) => p.progressIndex)).toEqual([0, 1, 2, 3, 4, 5, 5, 6, 7])
  })

  it('exposes no raw-value series — only the index is plottable', () => {
    // `target` rides along for labels, but the series' y-value is `progressIndex`
    // and the fixture proves why: raw pull targets sawtooth 45 → 20 on the advance
    // while the index rises 5 → 6.
    const series = progressSeries(midProgramHistory)
    expect(series.pull.map((p) => p.target)).toEqual([20, 25, 30, 35, 40, 45, 45, 20, 25])
    expect(series.pull.map((p) => p.progressIndex)).toEqual([0, 1, 2, 3, 4, 5, 5, 6, 7])
    expect(series.push.map((p) => p.target)).toEqual([10, 11, 12, 12, 5, 6])
    expect(series.push.map((p) => p.progressIndex)).toEqual([21, 22, 23, 23, 24, 25])
  })

  it('marks where a rung changed, for the milestone annotations', () => {
    const series = progressSeries(midProgramHistory)
    expect(rungChangePoints(series.push)).toEqual([4])
    expect(series.push[4]!.rungId).toBe('push-04-full')
    expect(rungChangePoints(series.pull)).toEqual([7])
    expect(series.pull[7]!.rungId).toBe('pull-02-prone-t')
    // hinge deloaded rather than advancing, and at the floor of the ladder the
    // rung does not change — so there is no rung-change point to annotate.
    expect(rungChangePoints(series.hinge)).toEqual([])
  })

  it('skips a point whose rung id no longer resolves rather than inventing one', () => {
    const series = progressSeries([
      session(exercise('push', 0, 5, 5, 5, 5)),
      session({ pattern: 'push', rungId: 'push-99-jetpack', sets: sets(6, 6, 6, 6) }),
    ])
    expect(series.push).toHaveLength(1)
  })

  it('is empty for every pattern with no history', () => {
    const series = progressSeries([])
    for (const pattern of PATTERNS) expect(series[pattern]).toEqual([])
  })
})

// ─── Utilities ──────────────────────────────────────────────────────────────

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key])
    }
    Object.freeze(value)
  }
  return value
}
