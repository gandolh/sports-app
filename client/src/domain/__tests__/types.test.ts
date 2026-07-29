import { DAILY_BLOCK, ROTATION, slotAt } from '../types.ts'
import {
  CURRENT_SCHEMA_VERSION,
  PATTERNS,
  VARIANTS,
  isPattern,
  isVariant,
} from '@sports-app/shared/types.ts'
import * as contract from '../types.ts'
import { midProgram } from './fixtures.ts'

describe('the rotation', () => {
  it('has three slots: Push, Legs, Cardio', () => {
    // Hard-coded on purpose. A silently added or dropped slot changes every
    // pattern's sessions-per-week and therefore every number in the programme.
    expect(ROTATION).toHaveLength(3)
    expect(ROTATION.map((s) => s.label)).toEqual(['Push', 'Legs', 'Cardio'])
  })

  it('puts cardio immediately AFTER legs and never before it', () => {
    // The locked reason this sequence exists: the concurrent-training literature
    // cares about strength-before-conditioning, and with daily training the order
    // is the only thing left to optimise. corpus/wiki/decisions.md.
    const legs = ROTATION.findIndex((s) => s.label === 'Legs')
    const cardio = ROTATION.findIndex((s) => s.cardio)
    expect(legs).toBeGreaterThanOrEqual(0)
    expect(cardio).toBe(legs + 1)
    // And the slot after cardio (wrapping) is not legs again, or legs would be
    // sandwiched and lose its 48h.
    expect(slotAt(cardio + 1).label).not.toBe('Legs')
  })

  it('gives cardio exactly one slot, and that slot trains no ladder', () => {
    const cardioSlots = ROTATION.filter((s) => s.cardio)
    expect(cardioSlots).toHaveLength(1)
    for (const slot of cardioSlots) {
      expect(slot.patterns, 'a cardio slot trains no ladder').toEqual([])
    }
  })

  it('gives every non-cardio slot at least one pattern', () => {
    for (const slot of ROTATION.filter((s) => !s.cardio)) {
      expect(slot.patterns.length, slot.label).toBeGreaterThan(0)
    }
  })

  it('covers all five patterns between the rotation and the daily block', () => {
    const covered = new Set([...ROTATION.flatMap((s) => s.patterns), ...DAILY_BLOCK])
    expect([...covered].sort()).toEqual([...PATTERNS].sort())
  })

  it('trains the daily block in every slot, and only there', () => {
    expect(DAILY_BLOCK).toEqual(['core', 'pull'])
    // Disjoint from every slot's own patterns: if a slot also listed `core`, the
    // counter would be incremented twice for one session's work.
    for (const slot of ROTATION) {
      for (const pattern of slot.patterns) {
        expect(DAILY_BLOCK, `${slot.label} duplicates the daily block`).not.toContain(pattern)
      }
    }
  })

  it('trains each rotating pattern once per turn, which is what 14 assumes', () => {
    // `SESSIONS_PER_RUNG_ROTATING = 14` is "2.3 sessions/week × 6 weeks". That
    // 2.3 is one appearance in a three-slot rotation. If a pattern ever appeared
    // twice, 14 would silently become the wrong number.
    const counts = new Map<string, number>()
    for (const slot of ROTATION) {
      for (const p of slot.patterns) counts.set(p, (counts.get(p) ?? 0) + 1)
    }
    expect([...counts.values()].every((n) => n === 1)).toBe(true)
    expect([...counts.keys()].sort()).toEqual(['hinge', 'push', 'squat'])
  })
})

describe('slotAt', () => {
  it('wraps by position, with no notion of a date', () => {
    expect(slotAt(0).label).toBe('Push')
    expect(slotAt(1).label).toBe('Legs')
    expect(slotAt(2).label).toBe('Cardio')
    expect(slotAt(3).label).toBe('Push')
    // 100 mod 3 = 1.
    expect(slotAt(100).label).toBe('Legs')
  })

  it('survives a hand-edited negative position rather than throwing', () => {
    // The state file is expected to be hand-edited, so out-of-range input is a
    // normal case, not a bug to crash on. Positive modulo: -1 → 2, -3 → 0.
    expect(slotAt(-1).label).toBe('Cardio')
    expect(slotAt(-2).label).toBe('Legs')
    expect(slotAt(-3).label).toBe('Push')
  })

  it('survives absurd, fractional and non-finite positions', () => {
    const absurd = [
      -1e9,
      -1000,
      -1,
      0,
      1,
      1000,
      1e9,
      Number.MAX_SAFE_INTEGER,
      2.5,
      -2.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]
    for (const position of absurd) {
      expect(() => slotAt(position), `position ${position}`).not.toThrow()
      expect(ROTATION, `position ${position}`).toContain(slotAt(position))
    }
  })
})

describe('guards', () => {
  it('narrows patterns', () => {
    for (const p of PATTERNS) expect(isPattern(p)).toBe(true)
    expect(isPattern('bench')).toBe(false)
    expect(isPattern('Push')).toBe(false)
    expect(isPattern(undefined)).toBe(false)
  })

  it('narrows variants — persistence has to validate the one variable field', () => {
    expect(VARIANTS).toEqual(['easy', 'medium', 'hard'])
    for (const v of VARIANTS) expect(isVariant(v)).toBe(true)
    expect(isVariant('ok')).toBe(false)
    expect(isVariant('Easy')).toBe(false)
    expect(isVariant(2)).toBe(false)
    expect(isVariant(undefined)).toBe(false)
  })
})

describe('the v2 contract is gone, not deprecated', () => {
  it('exports no cycle, ladder-state or effort machinery', () => {
    // Cheap, and it is the one thing that would silently reintroduce a locked
    // decision if a stale branch were merged. Every name here was deleted by
    // design and has no replacement.
    for (const gone of ['CYCLE', 'CYCLE_DAYS', 'cycleDayAt', 'isCycleDay']) {
      expect(contract, `${gone} came back`).not.toHaveProperty(gone)
    }
  })

  it('is at schema version 3', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(3)
    expect(midProgram.schemaVersion).toBe(3)
  })
})

describe('midProgram fixture', () => {
  it('puts every pattern at a distinguishable point', () => {
    // The fixture's whole job: a screen that renders one pattern's rung for
    // another must fail rather than pass by coincidence.
    const counts = PATTERNS.map((p) => midProgram.sessionsDone[p])
    expect(new Set(counts).size).toBeGreaterThan(1)
    for (const n of counts) expect(Number.isInteger(n) && n >= 0).toBe(true)
  })

  it('carries the whole of the mutable state and nothing derived', () => {
    expect(Object.keys(midProgram).sort()).toEqual([
      'cyclePosition',
      'history',
      'schemaVersion',
      'sessionsDone',
      'settings',
      'username',
    ])
    // `sessionsCompleted` was derivable from history.length and is gone; nothing
    // in v3 stores a number that can drift from the thing it counts.
    expect(midProgram).not.toHaveProperty('sessionsCompleted')
    expect(midProgram).not.toHaveProperty('ladders')
  })

  it('keeps settings to the two that survived v2', () => {
    expect(Object.keys(midProgram.settings).sort()).toEqual(['persistGranted', 'sync'])
  })

  it('records a set COUNT and a prescribed target, never an outcome', () => {
    for (const session of midProgram.history) {
      for (const e of session.exercises) {
        expect(Object.keys(e).sort()).toEqual(['pattern', 'rungId', 'sets', 'targetValue'])
        expect(typeof e.sets, 'sets is a count, not an array').toBe('number')
        expect(e).not.toHaveProperty('actualValue')
        expect(e).not.toHaveProperty('effort')
        expect(e.rungId.startsWith(`${e.pattern}-`)).toBe(true)
      }
    }
  })

  it('records exactly the patterns each recorded slot trained', () => {
    // Guards against a fixture that drifts from the rotation and silently makes
    // the UI tests meaningless.
    for (const session of midProgram.history) {
      const expected = [...slotAt(session.position).patterns, ...DAILY_BLOCK].sort()
      const recorded = session.exercises.map((e) => e.pattern).sort()
      expect(recorded, `position ${session.position}`).toEqual(expected)
    }
  })

  it('runs its recorded sessions in rotation order, ending at cyclePosition', () => {
    const positions = midProgram.history.map((s) => s.position)
    for (const [i, position] of positions.entries()) {
      expect(position, `history[${i}]`).toBe(midProgram.cyclePosition - positions.length + i)
    }
  })

  it('mixes the variants, the only genuinely variable field in the document', () => {
    const variants = new Set(midProgram.history.map((s) => s.variant))
    expect(variants.size).toBeGreaterThan(1)
    for (const v of variants) expect(isVariant(v)).toBe(true)
  })
})
