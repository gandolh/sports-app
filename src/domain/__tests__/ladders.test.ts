/**
 * These tests guard content, not logic — and most of them exist because a content
 * mistake here is invisible at runtime. A rung with a vague cue still renders, the
 * engine still advances, and the user still trains; it just trains the same thing
 * twice while the app reports progress. So the checks are deliberately pedantic
 * about cue *content*, not only about cue *presence*.
 */
import {
  LADDERS,
  NEVER_A_STARTING_RUNG,
  POSTURAL_NOTICE,
  RUNG_ID_PATTERN,
  findRungById,
  getRung,
  topRungIndex,
} from '../ladders.ts'
import { PATTERNS } from '../types.ts'
import type { Ladder, Pattern, Rung } from '../types.ts'
import { midProgramHistory } from './fixtures.ts'

const ladders: readonly [Pattern, Ladder][] = PATTERNS.map((p) => [p, LADDERS[p]])
const allRungs: readonly [Pattern, number, Rung][] = ladders.flatMap(([p, l]) =>
  l.rungs.map((r, i): [Pattern, number, Rung] => [p, i, r]),
)

const NUMBER_WORD: Record<number, string> = { 2: 'two', 3: 'three', 4: 'four', 5: 'five' }

describe('ladder shape', () => {
  it('covers every pattern exactly once', () => {
    expect(Object.keys(LADDERS).sort()).toEqual([...PATTERNS].sort())
  })

  it('has the rung counts SPEC.md specifies', () => {
    // Hard-coded on purpose: a silently dropped rung would otherwise pass every
    // other test in this file.
    expect(LADDERS.push.rungs).toHaveLength(9)
    expect(LADDERS.squat.rungs).toHaveLength(8)
    expect(LADDERS.hinge.rungs).toHaveLength(6)
    expect(LADDERS.core.rungs).toHaveLength(6)
    expect(LADDERS.pull.rungs).toHaveLength(6)
  })

  it('has no empty ladder', () => {
    for (const [pattern, ladder] of ladders) {
      expect(ladder.rungs.length, `${pattern} ladder is empty`).toBeGreaterThan(0)
    }
  })

  it('declares each ladder under its own pattern key', () => {
    for (const [pattern, ladder] of ladders) {
      expect(ladder.pattern).toBe(pattern)
    }
  })

  it('uses seconds for the time-based ladders and reps for the rest', () => {
    expect(LADDERS.core.unit).toBe('seconds')
    expect(LADDERS.pull.unit).toBe('seconds')
    expect(LADDERS.push.unit).toBe('reps')
    expect(LADDERS.squat.unit).toBe('reps')
    expect(LADDERS.hinge.unit).toBe('reps')
  })
})

describe('targets', () => {
  it('keeps targetMin strictly below targetMax', () => {
    for (const [pattern, ladder] of ladders) {
      expect(ladder.targetMin, `${pattern}`).toBeLessThan(ladder.targetMax)
    }
  })

  it('uses 5–12 reps and 20–45 seconds', () => {
    for (const [pattern, ladder] of ladders) {
      const expected = ladder.unit === 'reps' ? [5, 12] : [20, 45]
      expect([ladder.targetMin, ladder.targetMax], `${pattern}`).toEqual(expected)
    }
  })
})

describe('starting rungs are a safety cap', () => {
  // Calibration is descending: a new document starts mid-ladder and the 3-miss
  // regress rule walks the user down. That makes `startRungIndex` a number a
  // beginner is *expected* to fail against, so the binding constraint is what
  // failing costs — not how hard the rung is.
  it('sits inside every ladder', () => {
    for (const [pattern, ladder] of ladders) {
      expect(ladder.startRungIndex, pattern).toBeGreaterThanOrEqual(0)
      expect(ladder.startRungIndex, pattern).toBeLessThan(ladder.rungs.length)
      expect(Number.isInteger(ladder.startRungIndex), pattern).toBe(true)
      expect(() => getRung(pattern, ladder.startRungIndex)).not.toThrow()
    }
  })

  it('never starts on a rung whose failure mode is injurious', () => {
    // The rule, asserted as a rule. A future content edit that reorders a ladder
    // cannot quietly slide a nordic negative or a pistol into an entry position.
    const starting = ladders.map(([pattern, ladder]) => getRung(pattern, ladder.startRungIndex).id)
    for (const banned of NEVER_A_STARTING_RUNG) {
      expect(findRungById(banned), `${banned} is not a real rung id`).toBeDefined()
      expect(starting, `${banned} must never be a starting rung`).not.toContain(banned)
    }
  })

  it('names every nordic, pistol, archer and hollow rung in the banned list', () => {
    // The list has to stay complete or the test above proves nothing. Anything
    // whose id matches these mechanisms must be in it.
    const risky = allRungs
      .map(([, , rung]) => rung.id)
      .filter((id) => /nordic|pistol|archer|single-leg-squat|hollow|l-sit/.test(id))
    for (const id of risky) {
      expect(NEVER_A_STARTING_RUNG, `${id} is not in NEVER_A_STARTING_RUNG`).toContain(id)
    }
    expect(risky.length).toBeGreaterThan(3)
  })

  it('leaves at least one easier rung below, so the regress rule has somewhere to go', () => {
    // A start at rung 0 would make descending calibration a no-op on that ladder:
    // the user could only ever have the target stepped down, never the movement.
    for (const [pattern, ladder] of ladders) {
      expect(ladder.startRungIndex, `${pattern} has no rung below its start`).toBeGreaterThan(0)
    }
  })

  it('leaves plenty of ladder above, so a capable user is not immediately maxed', () => {
    for (const [pattern, ladder] of ladders) {
      const above = ladder.rungs.length - 1 - ladder.startRungIndex
      expect(above, `${pattern} starts too close to the top`).toBeGreaterThanOrEqual(4)
    }
  })

  it('starts each ladder at the rung the reasoning in ladders.ts names', () => {
    // Hard-coded deliberately, exactly like the rung counts above: these five
    // values each carry a written safety justification, and a silent change to one
    // must fail a test rather than only move a comment out of date.
    expect(getRung('push', LADDERS.push.startRungIndex).id).toBe('push-03-knees')
    expect(getRung('squat', LADDERS.squat.startRungIndex).id).toBe('squat-02-bodyweight')
    expect(getRung('hinge', LADDERS.hinge.startRungIndex).id).toBe(
      'hinge-02-glute-bridge-2s-top-hold',
    )
    expect(getRung('core', LADDERS.core.startRungIndex).id).toBe('core-02-plank')
    expect(getRung('pull', LADDERS.pull.startRungIndex).id).toBe('pull-02-prone-t')
  })

  it('keeps the hinge start bilateral, the one pattern with a named injury risk', () => {
    // Every hinge rung above index 1 is either unilateral or a nordic negative,
    // and a hamstring strain is the failure this ladder actually produces.
    const start = getRung('hinge', LADDERS.hinge.startRungIndex)
    expect(start.modifier?.unilateral).toBeFalsy()
    expect(start.id).not.toContain('nordic')
    for (const rung of LADDERS.hinge.rungs.slice(LADDERS.hinge.startRungIndex + 1)) {
      const unsafeToStart = rung.modifier?.unilateral === true || rung.id.includes('nordic')
      expect(unsafeToStart, `${rung.id} would have been a legal start`).toBe(true)
    }
  })
})

describe('rung ids', () => {
  it('are globally unique', () => {
    // Uniqueness must hold across ladders, not just within one: history stores a
    // rungId with no ladder qualifier, so a collision silently merges two
    // exercises' training records.
    const ids = allRungs.map(([, , r]) => r.id)
    const seen = new Map<string, number>()
    for (const id of ids) seen.set(id, (seen.get(id) ?? 0) + 1)
    const duplicates = [...seen].filter(([, n]) => n > 1).map(([id]) => id)
    expect(duplicates).toEqual([])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('match the documented <pattern>-<NN>-<slug> convention', () => {
    for (const [, , rung] of allRungs) {
      expect(rung.id, `${rung.id} does not match ${RUNG_ID_PATTERN}`).toMatch(RUNG_ID_PATTERN)
    }
  })

  it('carry their own pattern as the prefix', () => {
    for (const [pattern, , rung] of allRungs) {
      expect(rung.id.startsWith(`${pattern}-`), `${rung.id} is in the ${pattern} ladder`).toBe(true)
    }
  })

  it('number themselves by 1-based ladder position', () => {
    // The number is for humans reading a hand-edited state file. It has to be
    // right or it misleads exactly when someone is debugging a wrong rung.
    for (const [pattern, index, rung] of allRungs) {
      const expected = String(index + 1).padStart(2, '0')
      expect(rung.id, `${pattern} index ${index}`).toMatch(new RegExp(`^${pattern}-${expected}-`))
    }
  })

  it('still contains every id the shared fixture already committed to', () => {
    // fixtures.ts predates this file and its ids are written into a persisted-
    // history fixture, so they were adopted rather than renamed. Renaming one now
    // would orphan real history the same way it orphans this fixture.
    const fixtureIds = new Set(midProgramHistory.flatMap((s) => s.exercises.map((e) => e.rungId)))
    expect(fixtureIds.size).toBeGreaterThan(0)
    for (const id of fixtureIds) {
      expect(findRungById(id), `fixture rung id ${id} is missing from LADDERS`).toBeDefined()
    }
  })
})

describe('cues', () => {
  it('gives every rung 2–4 cues', () => {
    for (const [pattern, index, rung] of allRungs) {
      expect(rung.cues.length, `${pattern}[${index}] ${rung.id}`).toBeGreaterThanOrEqual(2)
      expect(rung.cues.length, `${pattern}[${index}] ${rung.id}`).toBeLessThanOrEqual(4)
    }
  })

  it('writes each cue as a trimmed, capitalised, full sentence', () => {
    for (const [, , rung] of allRungs) {
      for (const cue of rung.cues) {
        expect(cue, `${rung.id}: untrimmed cue`).toBe(cue.trim())
        expect(cue[0], `${rung.id}: "${cue}" must start capitalised`).toMatch(/[A-Z]/)
        expect(cue, `${rung.id}: "${cue}" must end in a full stop`).toMatch(/\.$/)
        // Long enough to actually coach, short enough to read mid-set.
        expect(cue.length, `${rung.id}: "${cue}" is too terse to coach from`).toBeGreaterThan(40)
        expect(cue.length, `${rung.id}: "${cue}" is too long to read mid-set`).toBeLessThan(400)
      }
    }
  })

  it('gives every rung a failure signal that says stop', () => {
    // Without this the card tells you how to do the movement but never when to
    // quit, which is how a sagging plank becomes a lower-back complaint.
    for (const [, , rung] of allRungs) {
      const hasStop = rung.cues.some((c) => /\bstop\b/i.test(c))
      expect(hasStop, `${rung.id} has no cue telling the user to stop the set`).toBe(true)
    }
  })

  it('states a tempo on every rep-based rung', () => {
    // Silence about tempo is how a modifier leaks into a rung that should not
    // carry it. Normal tempo has to be said out loud too.
    for (const [pattern, , rung] of allRungs) {
      if (LADDERS[pattern].unit !== 'reps') continue
      const hasTempo = rung.cues.some((c) => /tempo|second/i.test(c))
      expect(hasTempo, `${rung.id} never says how fast to move`).toBe(true)
    }
  })

  it('locates every pause inside the rep, in words', () => {
    // The whole risk this brief exists to avoid: "2s pause" without a location
    // makes two adjacent rungs identical in practice.
    for (const [, , rung] of allRungs) {
      const { pauseSeconds, pauseAt } = rung.modifier ?? {}
      if (pauseSeconds === undefined) continue
      expect(pauseAt, `${rung.id} has pauseSeconds but no pauseAt`).toBeDefined()
      const text = rung.cues.join(' ').toLowerCase()
      const word = NUMBER_WORD[pauseSeconds]
      expect(word, `no number word for ${pauseSeconds}s`).toBeDefined()
      expect(text, `${rung.id} never says the pause is ${pauseSeconds} seconds long`).toContain(
        `${word} second`,
      )
      expect(text, `${rung.id} never says the pause happens at the ${pauseAt}`).toContain(
        String(pauseAt),
      )
    }
  })

  it('spells out every eccentric count in words', () => {
    for (const [, , rung] of allRungs) {
      const seconds = rung.modifier?.eccentricSeconds
      if (seconds === undefined) continue
      const text = rung.cues.join(' ').toLowerCase()
      const word = NUMBER_WORD[seconds]
      expect(word, `no number word for ${seconds}s`).toBeDefined()
      expect(text, `${rung.id} never states its ${seconds}-second lowering in words`).toMatch(
        new RegExp(`${word}[ -](full )?second`),
      )
      expect(text, `${rung.id} never says the count applies to the lowering`).toMatch(
        /lower|descen|down/,
      )
    }
  })

  it('says per-side on every unilateral rep-based rung', () => {
    for (const [pattern, , rung] of allRungs) {
      if (!rung.modifier?.unilateral) continue
      if (LADDERS[pattern].unit !== 'reps') continue
      const text = rung.cues.join(' ').toLowerCase()
      expect(text, `${rung.id} never says whether reps count per side`).toMatch(
        /per (leg|side)|each side|switch|alternate/,
      )
    }
  })

  it('names the neighbouring rung wherever a rung differs only by a modifier', () => {
    // These pairs share a pose and a figure. A cue that does not say what changed
    // leaves the user performing both rungs identically.
    const mustCrossReference: readonly string[] = [
      'push-02-hands-low',
      'push-05-full-3s-down',
      'push-06-full-3s-down-2s-bottom-hold',
      'push-07-feet-elevated',
      'squat-03-3s-down',
      'squat-04-3s-down-2s-bottom-hold',
      'squat-05-heels-elevated',
      'squat-06-split',
      'hinge-02-glute-bridge-2s-top-hold',
      'hinge-03-single-leg-bridge',
      'hinge-04-single-leg-feet-elevated',
      'hinge-06-nordic-negative-long-eccentric',
      'core-05-hollow-rock',
      'pull-05-prone-lat-slide',
    ]
    for (const id of mustCrossReference) {
      const rung = findRungById(id)
      expect(rung, `${id} not found`).toBeDefined()
      expect(rung!.cues.join(' '), `${id} never says what changed from its neighbour`).toMatch(
        /rung \d/,
      )
    }
  })
})

describe('the pull ladder is postural, not strength', () => {
  // Safety invariant, not a preference: v1 has no anchor, so labelling this
  // ladder as pull strength would misrepresent what the user is training.
  // corpus/wiki/decisions.md#zero-equipment-and-the-pull-gap.
  it('carries kind: postural', () => {
    expect(LADDERS.pull.kind).toBe('postural')
    expect(LADDERS.pull.kind).not.toBe('strength')
  })

  it('is the only postural ladder', () => {
    const postural = ladders.filter(([, l]) => l.kind === 'postural').map(([p]) => p)
    expect(postural).toEqual(['pull'])
  })

  it('ships wording the UI can surface, saying the gap out loud', () => {
    expect(POSTURAL_NOTICE.toLowerCase()).toContain('postural')
    expect(POSTURAL_NOTICE.toLowerCase()).toContain('not pulling strength')
    expect(POSTURAL_NOTICE.length).toBeGreaterThan(80)
  })

  it('never calls a rung a row, pull-up or pulldown', () => {
    // The angle-based pull ladder (standing towel row → table row → …) is
    // designed and waiting for an anchor. Until one exists, no rung here may
    // borrow its vocabulary in a name.
    for (const rung of LADDERS.pull.rungs) {
      expect(rung.name.toLowerCase(), rung.id).not.toMatch(/\brow\b|pull-?up|pulldown/)
    }
  })
})

describe('the nordic rungs cue their own risk', () => {
  // An uncontrolled nordic negative is a real hamstring-strain mechanism, and
  // these are the top two rungs of a ladder the engine will walk a beginner up to.
  const nordics = LADDERS.hinge.rungs.filter((r) => r.id.includes('nordic'))

  it('exist as the top two hinge rungs', () => {
    expect(nordics.map((r) => r.id)).toEqual([
      'hinge-05-nordic-negative',
      'hinge-06-nordic-negative-long-eccentric',
    ])
  })

  it.each(nordics.map((r) => [r.id, r] as const))('%s cues anchor, eccentric and bail-out', (_id, rung) => {
    const text = rung.cues.join(' ').toLowerCase()
    expect(text, 'no anchoring cue').toMatch(/wedge|anchor|under the couch|couch frame/)
    expect(text, 'no check that the anchor holds').toMatch(/tug|pull free/)
    expect(text, 'no slow-eccentric cue').toMatch(/slowly|as slowly as|resist/)
    expect(text, 'no bail-out onto the hands').toMatch(/hands? (on the floor|and catch)|catch yourself/)
    expect(text, 'no hamstring-specific stop signal').toMatch(/sharp/)
    expect(rung.modifier?.eccentricSeconds, 'eccentric length not encoded').toBeGreaterThanOrEqual(3)
  })

  it('lengthens the eccentric from rung 5 to rung 6', () => {
    const [five, six] = nordics
    expect(six!.modifier!.eccentricSeconds!).toBeGreaterThan(five!.modifier!.eccentricSeconds!)
  })
})

describe('getRung', () => {
  it('returns the rung at a valid index', () => {
    expect(getRung('push', 0).id).toBe('push-01-hands-high')
    expect(getRung('push', 3).id).toBe('push-04-full')
    expect(getRung('pull', topRungIndex('pull')).id).toBe('pull-06-end-range-isometric')
  })

  it('agrees with the ladder arrays for every pattern and index', () => {
    for (const [pattern, index, rung] of allRungs) {
      expect(getRung(pattern, index)).toBe(rung)
    }
  })

  it('throws loudly rather than returning undefined past the top', () => {
    // A hand-edited rungIndex past the top of a ladder is an expected input. It
    // must fail where it is wrong, not render a blank card and log against
    // nothing.
    expect(() => getRung('hinge', 6)).toThrow(/hinge has no rung at index 6/)
    expect(() => getRung('hinge', 6)).toThrow(/valid range 0\.\.5/)
    expect(() => getRung('hinge', 6)).toThrow(/rungIndex/)
  })

  it('throws on a negative or non-integer index', () => {
    expect(() => getRung('push', -1)).toThrow(/no rung at index -1/)
    expect(() => getRung('push', 1.5)).toThrow(/no rung at index 1.5/)
    expect(() => getRung('push', Number.NaN)).toThrow(/no rung at index NaN/)
  })

  it('reports the top index of each ladder', () => {
    for (const [pattern, ladder] of ladders) {
      expect(topRungIndex(pattern)).toBe(ladder.rungs.length - 1)
      expect(() => getRung(pattern, topRungIndex(pattern))).not.toThrow()
      expect(() => getRung(pattern, topRungIndex(pattern) + 1)).toThrow()
    }
  })
})

describe('findRungById', () => {
  it('finds a rung in any ladder', () => {
    expect(findRungById('core-02-plank')?.name).toBe('Front plank')
    expect(findRungById('squat-08-pistol-progression')?.id).toBe('squat-08-pistol-progression')
  })

  it('returns undefined for an unknown id instead of throwing', () => {
    // Display path only: an unrecognised id from a future or hand-edited state
    // file should degrade to "Last time: —", not break the screen.
    expect(findRungById('push-99-jetpack')).toBeUndefined()
    expect(findRungById('')).toBeUndefined()
  })
})
