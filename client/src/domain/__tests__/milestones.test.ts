/**
 * The one property worth testing hardest here is the replay itself: a rung
 * index is a function of a session COUNT, and it is tempting to reach for
 * `doc.sessionsDone` — the document's CURRENT count — when asking what rung a
 * past session was on. That answers a different question and mislabels every
 * milestone with today's rung under an old session number, which reads as an
 * off-by-one rather than the category error it is. The first describe block
 * below sets `sessionsDone` to numbers wildly inconsistent with the replayed
 * history specifically to catch an implementation that reads them.
 */
import { milestonesReached, totalWork } from '../milestones.ts'
import { rungIndexAt } from '../schedule.ts'
import { getRung, topRungIndex } from '../ladders.ts'
import type { Pattern, RungId, SessionResult, StateDoc } from '@sports-app/shared/types.ts'

const ZERO: Readonly<Record<Pattern, number>> = { push: 0, squat: 0, hinge: 0, core: 0, pull: 0 }

function docWith(history: readonly SessionResult[], sessionsDone: Partial<Record<Pattern, number>> = {}): StateDoc {
  return {
    schemaVersion: 4,
    username: 'test',
    cyclePosition: 0,
    sessionsDone: { ...ZERO, ...sessionsDone },
    history,
    settings: { persistGranted: null, sync: null },
  }
}

/** A minimal recorded session training a single pattern. `sets`/`targetValue` are arbitrary unless a test cares about the sum. */
function sessionFor(pattern: Pattern, sets = 3, targetValue = 8): SessionResult {
  const rungId = `${pattern}-00-fixture` as RungId
  return {
    completedAt: '2026-01-01T00:00:00.000Z',
    position: 0,
    variant: 'medium',
    exercises: [{ pattern, rungId, sets, targetValue }],
  }
}

// ─── The replay trap ────────────────────────────────────────────────────────

describe('milestonesReached replays history rather than trusting doc.sessionsDone', () => {
  // Alternating push/squat sessions, one each per round: push lands on session
  // numbers 1, 3, 5, ..., squat on 2, 4, 6, .... Fourteen of each — the law
  // from progression-engine.md — so push's 14th session (overall #27) is the
  // first to climb its rung, and squat's 14th (overall #28) is the first to
  // climb its own.
  const history: SessionResult[] = []
  for (let i = 0; i < 14; i++) {
    history.push(sessionFor('push'))
    history.push(sessionFor('squat'))
  }

  // Deliberately absurd and inconsistent with the replay above: if the
  // implementation ever reads these instead of counting history, every
  // assertion below breaks.
  const doc = docWith(history, { push: 500, squat: 500, hinge: 999, core: 1, pull: 1 })
  const milestones = milestonesReached(doc)

  it('attributes the push rung advance to session 27, not to a count derived from sessionsDone', () => {
    const found = milestones.find((m) => m.pattern === 'push' && m.label.includes('full push-up'))
    expect(found).toBeDefined()
    expect(found?.sessionNumber).toBe(27)
    expect(found?.kind).toBe('named')
  })

  it('attributes the squat rung advance to session 28, independently of push', () => {
    const found = milestones.find(
      (m) => m.pattern === 'squat' && m.label.startsWith('Advanced to'),
    )
    expect(found).toBeDefined()
    expect(found?.sessionNumber).toBe(28)
    expect(found?.kind).toBe('rung')
  })

  it('reaches squat\'s starting rung — a named rung nobody ever climbs into — on squat\'s very first session', () => {
    // squat-02-bodyweight is squat's startRungIndex, so it is never entered by
    // an increase in rung index; it must be attributed to session 2 (squat's
    // first appearance in this alternating history) instead.
    const found = milestones.find((m) => m.pattern === 'squat' && m.label.includes('bodyweight squat'))
    expect(found).toBeDefined()
    expect(found?.sessionNumber).toBe(2)
    expect(found?.kind).toBe('named')
  })

  it('produces at least two genuine rung advances across the two patterns', () => {
    const rungAdvances = milestones.filter(
      (m) => (m.pattern === 'push' || m.pattern === 'squat') && (m.kind === 'rung' || m.label.includes('full push-up')),
    )
    expect(rungAdvances.length).toBeGreaterThanOrEqual(2)
  })

  it('orders milestones newest-first', () => {
    for (let i = 1; i < milestones.length; i++) {
      const prev = milestones[i - 1]
      const curr = milestones[i]
      if (prev && curr) expect(prev.sessionNumber).toBeGreaterThanOrEqual(curr.sessionNumber)
    }
  })
})

// ─── Empty document ─────────────────────────────────────────────────────────

describe('an empty document', () => {
  const doc = docWith([])

  it('produces no milestones, without throwing', () => {
    expect(() => milestonesReached(doc)).not.toThrow()
    expect(milestonesReached(doc)).toEqual([])
  })

  it('produces zero total work, without throwing', () => {
    expect(() => totalWork(doc)).not.toThrow()
    const work = totalWork(doc)
    expect(work).toEqual({
      reps: 0,
      holdSeconds: 0,
      sessions: 0,
      perPattern: {
        push: { reps: 0, holdSeconds: 0 },
        squat: { reps: 0, holdSeconds: 0 },
        hinge: { reps: 0, holdSeconds: 0 },
        core: { reps: 0, holdSeconds: 0 },
        pull: { reps: 0, holdSeconds: 0 },
      },
    })
  })
})

// ─── The top-of-the-ladder ceiling ──────────────────────────────────────────

describe('reaching the top of a ladder', () => {
  // 90 push sessions is enough to climb from the startRungIndex all the way to
  // topRungIndex (reached at push count 70) and sit there for 20 more sessions
  // while the target cycles — the exact scenario the "no special case" note in
  // schedule.ts describes.
  const history = Array.from({ length: 90 }, () => sessionFor('push'))
  const doc = docWith(history, { push: 90 })
  const milestones = milestonesReached(doc)
  const ceilingMilestones = milestones.filter(
    (m) => m.pattern === 'push' && m.label.includes('top of the push ladder'),
  )

  it('emits the ceiling milestone exactly once, not once per subsequent session', () => {
    expect(ceilingMilestones).toHaveLength(1)
  })

  it('attributes it to the session that first reaches the top rung', () => {
    // Cross-checked independently against rungIndexAt/topRungIndex rather than
    // hard-coded, so a future re-tune of sessionsPerRung cannot silently break
    // this test without anyone noticing why.
    let expectedSession = -1
    for (let n = 1; n <= 90; n++) {
      if (rungIndexAt('push', n) === topRungIndex('push') && rungIndexAt('push', n - 1) !== topRungIndex('push')) {
        expectedSession = n
        break
      }
    }
    expect(expectedSession).toBeGreaterThan(0)
    expect(ceilingMilestones[0]?.sessionNumber).toBe(expectedSession)
  })

  it('says the target cycles rather than calling it a plateau', () => {
    const label = ceilingMilestones[0]?.label ?? ''
    expect(label.toLowerCase()).not.toContain('plateau')
    expect(label.toLowerCase()).toContain('cycles')
  })

  it('names the top rung correctly', () => {
    const topRung = getRung('push', topRungIndex('push'))
    expect(ceilingMilestones[0]?.label).toContain(topRung.name)
  })
})

// ─── Total work ─────────────────────────────────────────────────────────────

describe('totalWork', () => {
  it('splits reps and hold-seconds by the ladder unit and never mixes them', () => {
    const doc = docWith([
      {
        completedAt: '2026-01-01T00:00:00.000Z',
        position: 0,
        variant: 'medium',
        exercises: [
          { pattern: 'push', rungId: 'push-00-fixture' as RungId, sets: 3, targetValue: 8 }, // 24 reps
          { pattern: 'core', rungId: 'core-00-fixture' as RungId, sets: 2, targetValue: 30 }, // 60 seconds
        ],
      },
    ])

    const work = totalWork(doc)
    expect(work.reps).toBe(24)
    expect(work.holdSeconds).toBe(60)
    expect(work.sessions).toBe(1)
    expect(work.perPattern.push).toEqual({ reps: 24, holdSeconds: 0 })
    expect(work.perPattern.core).toEqual({ reps: 0, holdSeconds: 60 })
    // The two units never bleed into each other's total.
    expect(work.reps).not.toBe(work.reps + work.holdSeconds)
  })

  it('sums across multiple sessions and multiple exercises of the same pattern', () => {
    const doc = docWith([sessionFor('push', 3, 8), sessionFor('push', 3, 10)])
    const work = totalWork(doc)
    expect(work.reps).toBe(3 * 8 + 3 * 10)
    expect(work.sessions).toBe(2)
  })

  it('produces a bare number of seconds, not a formatted duration — the caller owns formatting', () => {
    const doc = docWith([sessionFor('core', 2, 45)])
    const work = totalWork(doc)
    expect(typeof work.holdSeconds).toBe('number')
    expect(Number.isFinite(work.holdSeconds)).toBe(true)
  })
})
