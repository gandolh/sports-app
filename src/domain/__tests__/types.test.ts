import { CYCLE, CYCLE_DAYS, PATTERNS, cycleDayAt, isCycleDay, isPattern } from '../types.ts'
import { LADDERS } from '../ladders.ts'
import { midProgram, midProgramHistory, midProgramStart } from './fixtures.ts'

/** Rep ladders step by 1; time ladders by 5. See the fixtures.ts header. */
const stepFor = (unit: 'reps' | 'seconds') => (unit === 'seconds' ? 5 : 1)

describe('cycle', () => {
  it('has seven positions covering every pattern', () => {
    const covered = new Set(CYCLE.flatMap((d) => d.patterns))
    expect(CYCLE).toHaveLength(7)
    expect([...covered].sort()).toEqual([...PATTERNS].sort())
  })

  it('runs A · B · C · cardio · A · B · cardio', () => {
    expect(CYCLE.map((d) => d.day)).toEqual(['A', 'B', 'C', 'D', 'A', 'B', 'D'])
    expect(CYCLE.map((d) => d.cardio)).toEqual([false, false, false, true, false, false, true])
  })

  it('gives cardio exactly two positions in seven, and no ladder', () => {
    // Two, not three: three would cut each strength pattern to ~4.7 direct
    // sets/week and exceed the impact-volume ceiling. Locked decision.
    const cardioDays = CYCLE.filter((d) => d.cardio)
    expect(cardioDays).toHaveLength(2)
    for (const day of cardioDays) {
      expect(day.patterns, 'a cardio day trains no ladder').toEqual([])
    }
  })

  it('places the cardio days as far from the legs day as seven positions allow', () => {
    // Cardio movements are lower-body, and day B is the legs day, so the two must
    // not sit adjacent to it on both sides.
    const legs = CYCLE.map((d, i) => [d, i] as const).filter(([d]) => d.day === 'B')
    const cardio = CYCLE.map((d, i) => [d, i] as const).filter(([d]) => d.cardio)
    const gaps = cardio.flatMap(([, ci]) => legs.map(([, li]) => Math.abs(ci - li)))
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(1)
    // And no two cardio days are adjacent to each other either.
    const [first, second] = cardio.map(([, i]) => i)
    expect(second! - first!).toBeGreaterThan(1)
  })

  it('trains each pattern the number of times per turn the volume budget assumes', () => {
    const counts = new Map<string, number>()
    for (const day of CYCLE) {
      for (const p of day.patterns) counts.set(p, (counts.get(p) ?? 0) + 1)
    }
    // Two strength days out of three are upper-body/trunk, so pull rides along on
    // both of them; each strength pattern gets two turns except core, which
    // shares day C.
    expect(counts.get('pull')).toBe(3)
    expect(counts.get('push')).toBe(2)
    expect(counts.get('squat')).toBe(2)
    expect(counts.get('hinge')).toBe(2)
    expect(counts.get('core')).toBe(1)
  })

  it('wraps by position, with no notion of a date', () => {
    expect(cycleDayAt(0).day).toBe('A')
    expect(cycleDayAt(1).day).toBe('B')
    expect(cycleDayAt(2).day).toBe('C')
    expect(cycleDayAt(3).day).toBe('D')
    expect(cycleDayAt(4).day).toBe('A')
    expect(cycleDayAt(5).day).toBe('B')
    expect(cycleDayAt(6).day).toBe('D')
    expect(cycleDayAt(7).day).toBe('A')
    // 99 mod 7 = 1.
    expect(cycleDayAt(99).day).toBe('B')
  })

  it('survives a hand-edited negative position rather than throwing', () => {
    // The state file is expected to be hand-edited, so out-of-range input is a
    // normal case, not a bug to crash on. Positive modulo: -1 → 6, -3 → 4.
    expect(cycleDayAt(-1).day).toBe('D')
    expect(cycleDayAt(-3).day).toBe('A')
    expect(cycleDayAt(-7).day).toBe('A')
    for (const position of [-1000, -7, -1, 0, 1, 1000, 10 ** 9]) {
      expect(() => cycleDayAt(position), `position ${position}`).not.toThrow()
    }
  })
})

describe('guards', () => {
  it('narrows patterns', () => {
    expect(isPattern('push')).toBe(true)
    expect(isPattern('bench')).toBe(false)
    expect(isPattern(undefined)).toBe(false)
  })

  it('narrows cycle days, derived from CYCLE rather than restated', () => {
    expect(CYCLE_DAYS).toEqual(['A', 'B', 'C', 'D'])
    for (const day of CYCLE.map((d) => d.day)) expect(isCycleDay(day)).toBe(true)
    expect(isCycleDay('E')).toBe(false)
    expect(isCycleDay('a')).toBe(false)
    expect(isCycleDay(3)).toBe(false)
    expect(isCycleDay(undefined)).toBe(false)
  })
})

describe('midProgram fixture', () => {
  it('keeps sessionsCompleted consistent with history', () => {
    expect(midProgram.sessionsCompleted).toBe(midProgramHistory.length)
  })

  it('records exactly the patterns each day trains', () => {
    // Guards against a fixture that drifts from the cycle definition and
    // silently makes downstream engine tests meaningless.
    midProgramHistory.forEach((session, i) => {
      const spec = CYCLE.find((d) => d.day === session.day)
      expect(spec, `session ${i} has unknown day ${session.day}`).toBeDefined()
      const recorded = session.exercises.map((e) => e.pattern).sort()
      expect(recorded).toEqual([...spec!.patterns].sort())
    })
  })

  it('follows the cycle in order', () => {
    midProgramHistory.forEach((session, i) => {
      expect(session.day, `session ${i}`).toBe(cycleDayAt(i).day)
    })
  })

  it('has ladders at differing rungs, so engine tests can distinguish them', () => {
    const rungs = Object.values(midProgram.ladders).map((l) => l.rungIndex)
    expect(new Set(rungs).size).toBeGreaterThan(1)
  })

  it('contains a rung advance — the transition a rep chart would misrender', () => {
    // push held rung 2 at targets 10 → 11 → 12 → 12, then advanced and reset to 5
    // before climbing again. Brief 09 must not plot raw reps because of the 12 → 5.
    const pushTargets = midProgramHistory
      .flatMap((s) => s.exercises)
      .filter((e) => e.pattern === 'push')
      .map((e) => e.sets[0]?.targetValue)
    expect(pushTargets).toEqual([10, 11, 12, 12, 5, 6])
    expect(midProgram.ladders.push.target).toBe(7)
    expect(midProgram.ladders.push.rungIndex).toBe(3)
  })

  it('contains a cardio day per turn pair, recording no exercises at all', () => {
    const cardioSessions = midProgramHistory.filter((s) => s.day === 'D')
    expect(cardioSessions).toHaveLength(6)
    for (const session of cardioSessions) {
      expect(session.exercises, 'a cardio day trains no ladder').toEqual([])
    }
    // And the non-cardio sessions all record work, so an empty `exercises` array
    // is never an accident in this fixture.
    for (const session of midProgramHistory.filter((s) => s.day !== 'D')) {
      expect(session.exercises.length, session.completedAt).toBeGreaterThan(0)
    }
  })

  it('contains a deload — the transition where the index falls with no rung change', () => {
    // hinge missed 3×12 three sessions running and dropped to 3×11 at rung 0.
    const hingeTargets = midProgramHistory
      .flatMap((s) => s.exercises)
      .filter((e) => e.pattern === 'hinge')
      .map((e) => e.sets[0]!.targetValue)
    expect(hingeTargets).toEqual([11, 12, 12, 12, 11, 12])
    expect(midProgram.ladders.hinge.rungIndex).toBe(0)
  })

  it('carries no effort rating anywhere — the field does not exist in v2', () => {
    // Cheap, and it is the one thing that would silently reintroduce a locked
    // decision if a stale fixture were merged.
    for (const session of midProgramHistory) {
      for (const e of session.exercises) {
        expect(Object.keys(e).sort()).toEqual(['pattern', 'rungId', 'sets'])
      }
    }
    expect(midProgram.schemaVersion).toBe(2)
    expect(midProgramStart.schemaVersion).toBe(2)
  })

  it('uses rung ids prefixed by their pattern', () => {
    for (const session of midProgramHistory) {
      for (const e of session.exercises) {
        expect(e.rungId.startsWith(`${e.pattern}-`)).toBe(true)
      }
    }
  })

  // The original fixture was written before ladders.ts existed and recorded a
  // target of 13 on a ladder capped at 12, plus rung indices that disagreed with
  // the rung ids in its own history. These three tests catch that whole bug class
  // without needing the engine, so it cannot come back silently.
  it('records only targets inside each ladder’s declared range', () => {
    for (const session of midProgramHistory) {
      for (const e of session.exercises) {
        const ladder = LADDERS[e.pattern]
        for (const s of e.sets) {
          expect(
            s.targetValue,
            `${e.rungId} target ${s.targetValue} outside ${ladder.targetMin}..${ladder.targetMax}`,
          ).toBeGreaterThanOrEqual(ladder.targetMin)
          expect(s.targetValue).toBeLessThanOrEqual(ladder.targetMax)
        }
      }
    }
  })

  it('steps targets by the ladder’s unit step, never by an arbitrary amount', () => {
    for (const [pattern, ladder] of Object.entries(LADDERS)) {
      const step = stepFor(ladder.unit)
      const targets = midProgramHistory
        .flatMap((s) => s.exercises)
        .filter((e) => e.pattern === pattern)
        .map((e) => e.sets[0]!.targetValue)
      for (const t of targets) {
        expect((t - ladder.targetMin) % step, `${pattern} target ${t} is off-step`).toBe(0)
      }
    }
  })

  it('keeps every ladder state in bounds and consistent with its rung ids', () => {
    for (const doc of [midProgramStart, midProgram]) {
      for (const pattern of PATTERNS) {
        const ladder = LADDERS[pattern]
        const state = doc.ladders[pattern]
        expect(state.rungIndex).toBeGreaterThanOrEqual(0)
        expect(state.rungIndex, `${pattern} rungIndex out of ladder bounds`).toBeLessThan(
          ladder.rungs.length,
        )
        expect(state.target).toBeGreaterThanOrEqual(ladder.targetMin)
        expect(state.target).toBeLessThanOrEqual(ladder.targetMax)
        expect((state.target - ladder.targetMin) % stepFor(ladder.unit)).toBe(0)
      }
    }
  })

  it('logs each exercise against the rung the ladder was actually on', () => {
    // Rung ids are 1-based, rungIndex is 0-based. Getting this backwards was the
    // other half of the original defect.
    const seen = new Map<string, string>()
    for (const session of midProgramHistory) {
      for (const e of session.exercises) {
        seen.set(e.pattern, e.rungId)
      }
    }
    for (const [pattern, rungId] of seen) {
      const oneBased = Number(rungId.split('-')[1])
      const zeroBased = oneBased - 1
      const rung = LADDERS[pattern as (typeof PATTERNS)[number]].rungs[zeroBased]
      expect(rung?.id, `${rungId} should sit at index ${zeroBased}`).toBe(rungId)
    }
  })

  it('starts from a state that could plausibly precede the history', () => {
    // Full proof is brief 04's job:
    //   midProgramHistory.reduce(applySession, midProgramStart) === midProgram
    // Until the engine exists, assert the cheap half: the first recorded target
    // for each pattern equals that pattern's starting target.
    const firstTarget = new Map<string, number>()
    for (const session of midProgramHistory) {
      for (const e of session.exercises) {
        if (!firstTarget.has(e.pattern)) firstTarget.set(e.pattern, e.sets[0]!.targetValue)
      }
    }
    for (const pattern of PATTERNS) {
      expect(firstTarget.get(pattern), `${pattern} first logged target`).toBe(
        midProgramStart.ladders[pattern].target,
      )
    }
  })

  it('never records more sets than it has targets for', () => {
    for (const session of midProgramHistory) {
      for (const e of session.exercises) {
        expect(e.sets.length).toBe(3)
        const targets = new Set(e.sets.map((s) => s.targetValue))
        expect(targets.size, 'all sets in an exercise share one target').toBe(1)
      }
    }
  })
})
