/**
 * The schedule has one formula in it, so these tests are mostly **properties
 * rather than example values** — the properties are the reason the formula is
 * written the way it is, and an example value would pass just as happily against a
 * per-rung step table, which is the thing this replaced.
 */
import {
  CARDIO_ROUNDS,
  SETS_PER_DAILY_BLOCK,
  SETS_PER_STRENGTH,
  applyVariant,
  prescribe,
  rangeAt,
  recordSession,
  rungIndexAt,
  targetAt,
} from '../schedule.ts'
import type { PrescribedExercise, PrescribedItem } from '../schedule.ts'
import { CARDIO, LADDERS, topRungIndex } from '../ladders.ts'
import { DAILY_BLOCK, PATTERNS, ROTATION, VARIANTS, slotAt } from '../types.ts'
import type { Pattern, SessionResult, StateDoc, Variant } from '../types.ts'
import { midProgram } from './fixtures.ts'

const ZERO: Readonly<Record<Pattern, number>> = { push: 0, squat: 0, hinge: 0, core: 0, pull: 0 }

function docWith(sessionsDone: Partial<Record<Pattern, number>>, cyclePosition = 0): StateDoc {
  return {
    schemaVersion: 3,
    username: 'test',
    cyclePosition,
    sessionsDone: { ...ZERO, ...sessionsDone },
    history: [],
    settings: { persistGranted: null, sync: null },
  }
}

const exercises = (items: readonly PrescribedItem[]): readonly PrescribedExercise[] =>
  items.filter((item): item is PrescribedExercise => item.type === 'exercise')

// ─── Property 1 ─────────────────────────────────────────────────────────────

describe('every rung takes sessionsPerRung sessions, whatever its span', () => {
  it('holds for all five ladders, over the whole ladder', () => {
    // This IS the law — "a rung takes about six weeks" — so it is asserted as a
    // count of sessions per rung rather than as a target at a session number.
    for (const pattern of PATTERNS) {
      const ladder = LADDERS[pattern]
      const per = ladder.sessionsPerRung
      const rungsAbove = topRungIndex(pattern) - ladder.startRungIndex
      const seen = new Map<number, number>()
      for (let n = 0; n < per * rungsAbove; n++) {
        const index = rungIndexAt(pattern, n)
        seen.set(index, (seen.get(index) ?? 0) + 1)
      }
      for (const [index, count] of seen) {
        expect(count, `${pattern} rung ${index} lasted ${count} sessions, not ${per}`).toBe(per)
      }
      expect(seen.size, `${pattern} did not climb every rung`).toBe(rungsAbove)
    }
  })

  it('advances on exactly the sessions divisible by sessionsPerRung', () => {
    for (const pattern of PATTERNS) {
      const per = LADDERS[pattern].sessionsPerRung
      for (let n = 1; n < per * 3; n++) {
        const advanced = rungIndexAt(pattern, n) !== rungIndexAt(pattern, n - 1)
        expect(advanced, `${pattern} at session ${n}`).toBe(n % per === 0)
      }
    }
  })

  it('starts every ladder at its own startRungIndex, at the bottom of that range', () => {
    for (const pattern of PATTERNS) {
      const ladder = LADDERS[pattern]
      expect(rungIndexAt(pattern, 0)).toBe(ladder.startRungIndex)
      expect(targetAt(pattern, 0)).toBe(rangeAt(pattern, ladder.startRungIndex).min)
    }
  })

  it('lands on the bottom of the new range on the first session of every rung', () => {
    // The locked call "at the top of a rung the next rung starts at its own bottom
    // target" — which is only free because the fraction resets to zero.
    for (const pattern of PATTERNS) {
      const ladder = LADDERS[pattern]
      const per = ladder.sessionsPerRung
      const rungsAbove = topRungIndex(pattern) - ladder.startRungIndex
      for (let rung = 0; rung <= rungsAbove; rung++) {
        const n = rung * per
        expect(targetAt(pattern, n), `${pattern} session ${n}`).toBe(
          rangeAt(pattern, rungIndexAt(pattern, n)).min,
        )
      }
    }
  })
})

// ─── Property 2 ─────────────────────────────────────────────────────────────

describe('the top rung cycles, with no special case', () => {
  it('clamps the rung index and never exceeds the top', () => {
    for (const pattern of PATTERNS) {
      const per = LADDERS[pattern].sessionsPerRung
      for (const n of [per * 50, per * 500, 10 ** 6]) {
        expect(rungIndexAt(pattern, n), `${pattern} at ${n}`).toBe(topRungIndex(pattern))
      }
    }
  })

  it('keeps sweeping min→max→min for ever once clamped', () => {
    for (const pattern of PATTERNS) {
      const ladder = LADDERS[pattern]
      const per = ladder.sessionsPerRung
      // Well past the top of every ladder.
      const base = per * (ladder.rungs.length + 20)
      const range = rangeAt(pattern, topRungIndex(pattern))
      const sweep = Array.from({ length: per }, (_, i) => targetAt(pattern, base + i))
      expect(sweep[0], `${pattern} does not restart at the bottom`).toBe(range.min)
      expect(Math.max(...sweep), `${pattern} never approaches its cap`).toBeLessThanOrEqual(
        range.max,
      )
      // Monotonic across the sweep, then back to the bottom on the next session.
      for (let i = 1; i < sweep.length; i++) {
        expect(sweep[i]!, `${pattern} sweep dipped at ${i}`).toBeGreaterThanOrEqual(sweep[i - 1]!)
      }
      expect(targetAt(pattern, base + per)).toBe(range.min)
    }
  })

  it('is periodic with period sessionsPerRung once clamped', () => {
    // The honest statement of "you stay there and it cycles": the whole
    // prescription repeats, and nothing special-cases it into existence.
    for (const pattern of PATTERNS) {
      const per = LADDERS[pattern].sessionsPerRung
      const base = per * (LADDERS[pattern].rungs.length + 5)
      for (let i = 0; i < per; i++) {
        expect(targetAt(pattern, base + i)).toBe(targetAt(pattern, base + i + per))
      }
    }
  })
})

// ─── Property 3 ─────────────────────────────────────────────────────────────

describe('re-tuning a range does not move anyone', () => {
  it('derives the rung index from sessions alone, never from a range', () => {
    // Stated as: the index is exactly the closed form, which mentions no range.
    for (const pattern of PATTERNS) {
      const ladder = LADDERS[pattern]
      for (let n = 0; n < ladder.sessionsPerRung * (ladder.rungs.length + 2); n += 3) {
        const expected = Math.min(
          ladder.startRungIndex + Math.floor(n / ladder.sessionsPerRung),
          ladder.rungs.length - 1,
        )
        expect(rungIndexAt(pattern, n), `${pattern} at ${n}`).toBe(expected)
      }
    }
  })

  it('gives two ladders with the same start and cadence the same rung sequence', () => {
    // core and pull both start at index 1 and both run 42 sessions per rung, but
    // their rungs' spans differ (20→60 vs 10→30). Identical index sequences are
    // the observable form of "the caps are free to re-tune".
    expect(LADDERS.core.startRungIndex).toBe(LADDERS.pull.startRungIndex)
    expect(LADDERS.core.sessionsPerRung).toBe(LADDERS.pull.sessionsPerRung)
    for (let n = 0; n < 42 * 6; n += 7) {
      expect(rungIndexAt('core', n)).toBe(rungIndexAt('pull', n))
    }
  })

  it('advances through the same fraction of every rung, whatever the span', () => {
    // Two core rungs with different spans, at the same point inside their rung,
    // sit at the same fraction of their own range. That is what lets a rung's caps
    // change without anything stored becoming wrong.
    const plank = rangeAt('core', 1) // 20 → 60
    const lsit = rangeAt('core', 5) // 10 → 30
    expect(plank).not.toEqual(lsit)
    for (const into of [0, 7, 21, 35, 41]) {
      const a = (targetAt('core', into) - plank.min) / (plank.max - plank.min)
      const b = (targetAt('core', 4 * 42 + into) - lsit.min) / (lsit.max - lsit.min)
      expect(a, `sessionsIntoRung ${into}`).toBeCloseTo(b, 1)
    }
  })
})

// ─── The derived steps ──────────────────────────────────────────────────────

describe('the derived steps match the law', () => {
  it('gives push +1 rep per 2 sessions', () => {
    for (let n = 0; n + 2 < 14; n++) {
      expect(targetAt('push', n + 2) - targetAt('push', n), `push at ${n}`).toBe(1)
    }
    expect(targetAt('push', 0)).toBe(5)
    expect(targetAt('push', 13)).toBe(12)
  })

  it('gives the 20→60s plank +1s per session', () => {
    expect(rangeAt('core', rungIndexAt('core', 0))).toEqual({ min: 20, max: 60 })
    const diffs = Array.from({ length: 41 }, (_, n) => targetAt('core', n + 1) - targetAt('core', n))
    for (const d of diffs) expect(d === 0 || d === 1).toBe(true)
    const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length
    expect(mean).toBeCloseTo(40 / 42, 1)
  })

  it('gives the 10→30s prone T +1s per 2 sessions', () => {
    // Same 10→30 span as the prone Y the wiki quotes; the Y sits below the start
    // rung, so the T is the one the schedule actually prescribes first.
    expect(rangeAt('pull', rungIndexAt('pull', 0))).toEqual({ min: 10, max: 30 })
    for (let n = 0; n + 2 < 42; n += 2) {
      const step = targetAt('pull', n + 2) - targetAt('pull', n)
      expect(step === 0 || step === 1, `pull at ${n} stepped ${step}`).toBe(true)
    }
    expect(targetAt('pull', 0)).toBe(10)
    expect(targetAt('pull', 41)).toBe(30)
  })

  it('never prescribes outside the range of the current rung', () => {
    for (const pattern of PATTERNS) {
      const per = LADDERS[pattern].sessionsPerRung
      for (let n = 0; n < per * (LADDERS[pattern].rungs.length + 3); n++) {
        const range = rangeAt(pattern, rungIndexAt(pattern, n))
        const target = targetAt(pattern, n)
        expect(target, `${pattern} at ${n}`).toBeGreaterThanOrEqual(range.min)
        expect(target, `${pattern} at ${n}`).toBeLessThanOrEqual(range.max)
      }
    }
  })

  it('survives a hand-edited negative counter without leaving the range', () => {
    for (const pattern of PATTERNS) {
      for (const n of [-1, -5, -100]) {
        expect(rungIndexAt(pattern, n)).toBeGreaterThanOrEqual(0)
        const range = rangeAt(pattern, rungIndexAt(pattern, n))
        expect(targetAt(pattern, n)).toBeGreaterThanOrEqual(range.min)
        expect(targetAt(pattern, n)).toBeLessThanOrEqual(range.max)
      }
    }
  })
})

// ─── The variant ────────────────────────────────────────────────────────────

describe('applyVariant', () => {
  const reps = { min: 5, max: 12 }
  const plank = { min: 20, max: 60 }

  it('moves reps by 2 and seconds by 5', () => {
    expect(applyVariant(8, 'reps', 'easy', reps)).toBe(6)
    expect(applyVariant(8, 'reps', 'medium', reps)).toBe(8)
    expect(applyVariant(8, 'reps', 'hard', reps)).toBe(10)
    expect(applyVariant(40, 'seconds', 'easy', plank)).toBe(35)
    expect(applyVariant(40, 'seconds', 'medium', plank)).toBe(40)
    expect(applyVariant(40, 'seconds', 'hard', plank)).toBe(45)
  })

  it('makes `hard` a NO-OP at range.max, deliberately', () => {
    // The rep ceiling exists because past ~12–15 bodyweight reps the adaptation
    // drifts to endurance and there is no load to add. The variant must not be a
    // way around it. corpus/wiki/decisions.md.
    expect(applyVariant(12, 'reps', 'hard', reps)).toBe(12)
    expect(applyVariant(11, 'reps', 'hard', reps)).toBe(12)
    expect(applyVariant(60, 'seconds', 'hard', plank)).toBe(60)
    expect(applyVariant(58, 'seconds', 'hard', plank)).toBe(60)
    // And it is a no-op through the real schedule, not just in the abstract:
    // push session 13 prescribes the cap.
    const capped = prescribe(docWith({ push: 13 }), 'hard')
    const push = exercises(capped.items).find((e) => e.pattern === 'push')!
    expect(push.targetValue).toBe(12)
  })

  it('floors `easy` at range.min and never below 3 reps', () => {
    expect(applyVariant(5, 'reps', 'easy', reps)).toBe(5)
    expect(applyVariant(6, 'reps', 'easy', reps)).toBe(5)
    expect(applyVariant(20, 'seconds', 'easy', plank)).toBe(20)
    // A rung with an unusually low floor still cannot produce a 1-rep set.
    expect(applyVariant(4, 'reps', 'easy', { min: 1, max: 12 })).toBe(3)
    expect(applyVariant(3, 'reps', 'easy', { min: 1, max: 12 })).toBe(3)
  })

  it('never leaves the range, for every variant at every point in a rung', () => {
    for (const pattern of PATTERNS) {
      const ladder = LADDERS[pattern]
      for (let n = 0; n < ladder.sessionsPerRung * 3; n++) {
        const range = rangeAt(pattern, rungIndexAt(pattern, n))
        for (const variant of VARIANTS) {
          const value = applyVariant(targetAt(pattern, n), ladder.unit, variant, range)
          expect(value, `${pattern} ${variant} at ${n}`).toBeGreaterThanOrEqual(range.min)
          expect(value, `${pattern} ${variant} at ${n}`).toBeLessThanOrEqual(range.max)
        }
      }
    }
  })
})

describe('the variant NEVER touches sessionsDone', () => {
  // The single most important property in this file: an easy day costs no
  // progress and banks no debt, so a bad day is free.
  it('leaves the document untouched whichever variant is prescribed', () => {
    const before = docWith({ push: 20, squat: 20, hinge: 20, core: 60, pull: 60 }, 4)
    const snapshot = JSON.stringify(before)
    for (const variant of VARIANTS) prescribe(before, variant)
    expect(JSON.stringify(before)).toBe(snapshot)
  })

  it('prescribes the same rung, sets and unit for all three variants', () => {
    const state = docWith({ push: 20, squat: 20, hinge: 20, core: 60, pull: 60 }, 1)
    const byVariant = VARIANTS.map((v) => exercises(prescribe(state, v).items))
    const [easy, medium, hard] = byVariant as [
      readonly PrescribedExercise[],
      readonly PrescribedExercise[],
      readonly PrescribedExercise[],
    ]
    for (const [i, m] of medium.entries()) {
      expect(easy[i]!.rung.id).toBe(m.rung.id)
      expect(hard[i]!.rung.id).toBe(m.rung.id)
      expect(easy[i]!.rungIndex).toBe(m.rungIndex)
      expect(easy[i]!.sets).toBe(m.sets)
      expect(hard[i]!.sets).toBe(m.sets)
      // Only the number moves, and only by the unit's step.
      expect(m.targetValue - easy[i]!.targetValue).toBeGreaterThanOrEqual(0)
      expect(hard[i]!.targetValue - m.targetValue).toBeGreaterThanOrEqual(0)
    }
  })

  it('advances the counters identically whatever variant was recorded', () => {
    const state = docWith({ push: 5, squat: 5, hinge: 5, core: 15, pull: 15 }, 1)
    const results = VARIANTS.map((variant): SessionResult => ({
      completedAt: '2026-07-29T00:00:00.000Z',
      position: state.cyclePosition,
      variant,
      exercises: [],
    }))
    const after = results.map((r) => recordSession(state, r))
    for (const doc of after) {
      expect(doc.sessionsDone).toEqual(after[0]!.sessionsDone)
      expect(doc.cyclePosition).toBe(after[0]!.cyclePosition)
    }
  })
})

// ─── recordSession ──────────────────────────────────────────────────────────

describe('recordSession', () => {
  const result = (position: number, variant: Variant = 'medium'): SessionResult => ({
    completedAt: '2026-07-29T06:00:00.000Z',
    position,
    variant,
    exercises: [],
  })

  it('has no conditional in it at all', () => {
    // Structural, deliberately. There is nothing for this function to decide, and
    // an `if` here would mean adaptation had crept back in.
    const source = recordSession.toString()
    expect(source).not.toMatch(/\bif\b|\bswitch\b|\?|&&|\|\|/)
  })

  it('advances the position by exactly one', () => {
    for (const position of [0, 1, 2, 7, 100]) {
      expect(recordSession(docWith({}, position), result(position)).cyclePosition).toBe(position + 1)
    }
  })

  it('counts one session for the slot patterns plus the daily block', () => {
    for (const position of [0, 1, 2, 3, 4, 5]) {
      const before = docWith({}, position)
      const after = recordSession(before, result(position))
      const trained = new Set([...slotAt(position).patterns, ...DAILY_BLOCK])
      for (const pattern of PATTERNS) {
        expect(
          after.sessionsDone[pattern],
          `${pattern} after a ${slotAt(position).label} session`,
        ).toBe(trained.has(pattern) ? 1 : 0)
      }
    }
  })

  it('counts the daily block in every slot, cardio included', () => {
    for (let position = 0; position < ROTATION.length; position++) {
      const after = recordSession(docWith({}, position), result(position))
      for (const pattern of DAILY_BLOCK) {
        expect(after.sessionsDone[pattern], `${pattern} at position ${position}`).toBe(1)
      }
    }
  })

  it('does not read the recorded exercises', () => {
    // Nothing is measured, so the recorded exercises cannot influence the
    // counters. A session that recorded nothing advances exactly as far as one
    // that recorded everything.
    const state = docWith({}, 1)
    const empty = recordSession(state, result(1))
    const full = recordSession(state, {
      ...result(1),
      exercises: [
        { pattern: 'squat', rungId: 'squat-02-bodyweight', sets: 3, targetValue: 5 },
        { pattern: 'core', rungId: 'core-02-plank', sets: 2, targetValue: 20 },
      ],
    })
    expect(full.sessionsDone).toEqual(empty.sessionsDone)
  })

  it('appends to history without mutating the input document', () => {
    const before = midProgram
    const snapshot = JSON.stringify(before)
    const after = recordSession(before, result(before.cyclePosition))
    expect(after.history).toHaveLength(before.history.length + 1)
    expect(after.history.slice(0, before.history.length)).toEqual(before.history)
    expect(JSON.stringify(before), 'recordSession mutated its input').toBe(snapshot)
    expect(after.sessionsDone).not.toBe(before.sessionsDone)
  })

  it('replays a full turn of the rotation into the ratio the volume budget assumes', () => {
    // Three sessions = one turn. Each rotating pattern once, the daily block three
    // times. That 1:3 is where "2.3 vs 7 sessions a week" and therefore 14 vs 42
    // come from.
    let state = docWith({}, 0)
    for (let i = 0; i < 3; i++) state = recordSession(state, result(state.cyclePosition))
    expect(state.sessionsDone).toEqual({ push: 1, squat: 1, hinge: 1, core: 3, pull: 3 })
    expect(state.cyclePosition).toBe(3)
  })

  it('survives a hand-edited absurd position rather than throwing', () => {
    for (const position of [-1, -1000, 10 ** 9, 2.5, Number.NaN]) {
      expect(() => recordSession(docWith({}, position), result(position))).not.toThrow()
    }
  })
})

// ─── prescribe ──────────────────────────────────────────────────────────────

describe('prescribe', () => {
  it('labels the slot and echoes the position and variant', () => {
    for (let position = 0; position < ROTATION.length; position++) {
      const p = prescribe(docWith({}, position), 'medium')
      expect(p.position).toBe(position)
      expect(p.label).toBe(slotAt(position).label)
      expect(p.variant).toBe('medium')
    }
  })

  it('orders the slot own work first and the daily block last', () => {
    const legs = prescribe(docWith({}, 1), 'medium')
    expect(exercises(legs.items).map((e) => e.pattern)).toEqual(['squat', 'hinge', 'core', 'pull'])
    const push = prescribe(docWith({}, 0), 'medium')
    expect(exercises(push.items).map((e) => e.pattern)).toEqual(['push', 'core', 'pull'])
  })

  it('runs strength at 3 sets and the daily block at 2', () => {
    expect([SETS_PER_STRENGTH, SETS_PER_DAILY_BLOCK]).toEqual([3, 2])
    for (let position = 0; position < ROTATION.length; position++) {
      const slot = slotAt(position)
      for (const e of exercises(prescribe(docWith({}, position), 'medium').items)) {
        const expected = slot.patterns.includes(e.pattern)
          ? SETS_PER_STRENGTH
          : SETS_PER_DAILY_BLOCK
        expect(e.sets, `${e.pattern} on the ${slot.label} slot`).toBe(expected)
      }
    }
  })

  it('trains the daily block in EVERY slot', () => {
    for (let position = 0; position < ROTATION.length * 3; position++) {
      const patterns = exercises(prescribe(docWith({}, position), 'medium').items).map(
        (e) => e.pattern,
      )
      for (const pattern of DAILY_BLOCK) {
        expect(patterns, `${pattern} missing at position ${position}`).toContain(pattern)
      }
    }
  })

  it('puts cardio in place of the strength work, with rounds and no target', () => {
    const cardioPosition = ROTATION.findIndex((s) => s.cardio)
    const p = prescribe(docWith({}, cardioPosition), 'hard')
    expect(p.label).toBe('Cardio')
    expect(p.items[0]).toEqual({ type: 'cardio', protocol: CARDIO, rounds: CARDIO_ROUNDS })
    expect(CARDIO_ROUNDS).toBe(5)
    // Cardio is not a strength pattern in disguise: no target, no unit, no sets,
    // and the variant does not reach it.
    const cardio = p.items[0]!
    for (const field of ['targetValue', 'unit', 'sets', 'pattern', 'rung']) {
      expect(cardio, `cardio must not carry ${field}`).not.toHaveProperty(field)
    }
    // …and the rest of the session is the daily block, at 2 sets.
    expect(exercises(p.items).map((e) => e.pattern)).toEqual([...DAILY_BLOCK])
  })

  it('carries the rung, its unit and its ladder kind for each exercise', () => {
    for (const e of exercises(prescribe(midProgram, 'medium').items)) {
      const ladder = LADDERS[e.pattern]
      expect(e.unit).toBe(ladder.unit)
      expect(e.ladderKind).toBe(ladder.kind)
      expect(e.rung).toBe(ladder.rungs[e.rungIndex])
      expect(e.rung.cues.length).toBeGreaterThan(1)
      expect(e.rungIndex).toBe(rungIndexAt(e.pattern, midProgram.sessionsDone[e.pattern]))
    }
    // The pull slot still announces itself as postural, wherever it is rendered.
    const pull = exercises(prescribe(midProgram, 'medium').items).find((e) => e.pattern === 'pull')
    expect(pull?.ladderKind).toBe('postural')
  })

  it('puts the five fixture patterns on five distinguishable prescriptions', () => {
    const seen = new Set<string>()
    for (let position = 0; position < ROTATION.length; position++) {
      for (const e of exercises(prescribe({ ...midProgram, cyclePosition: position }, 'medium').items)) {
        seen.add(`${e.pattern}:${e.rung.id}:${e.targetValue}`)
      }
    }
    expect(seen.size).toBe(5)
  })

  it('never throws on a hand-edited absurd position', () => {
    for (const position of [-1, -999, 10 ** 9, 2.5, Number.NaN]) {
      expect(() => prescribe(docWith({}, position), 'medium'), `position ${position}`).not.toThrow()
      expect(prescribe(docWith({}, position), 'medium').items.length).toBeGreaterThan(0)
    }
  })
})
