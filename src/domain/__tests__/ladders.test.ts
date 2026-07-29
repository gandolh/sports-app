/**
 * These tests guard content, not logic — and most of them exist because a content
 * mistake here is invisible at runtime. A rung with a vague cue still renders, the
 * schedule still advances, and the user still trains; it just trains the same thing
 * twice while the app reports progress. So the checks are deliberately pedantic
 * about cue *content*, not only about cue *presence*.
 */
import {
  CARDIO,
  LADDERS,
  NEVER_A_STARTING_RUNG,
  POSTURAL_NOTICE,
  RUNG_ID_PATTERN,
  SESSIONS_PER_RUNG_DAILY,
  SESSIONS_PER_RUNG_ROTATING,
  findRungById,
  getRung,
  topRungIndex,
} from '../ladders.ts'
import { PATTERNS } from '../types.ts'
import type { Ladder, Pattern, Rung } from '../types.ts'

const ladders: readonly [Pattern, Ladder][] = PATTERNS.map((p) => [p, LADDERS[p]])
const allRungs: readonly [Pattern, number, Rung][] = ladders.flatMap(([p, l]) =>
  l.rungs.map((r, i): [Pattern, number, Rung] => [p, i, r]),
)

const NUMBER_WORD: Record<number, string> = { 2: 'two', 3: 'three', 4: 'four', 5: 'five' }

describe('ladder shape', () => {
  it('covers every pattern exactly once', () => {
    expect(Object.keys(LADDERS).sort()).toEqual([...PATTERNS].sort())
  })

  it('has the rung counts the content commits to', () => {
    // Hard-coded on purpose: a silently dropped rung would otherwise pass every
    // other test in this file. Hinge gained a seventh rung when the two
    // couch-anchored nordic negatives became three sliding-curl rungs.
    expect(LADDERS.push.rungs).toHaveLength(9)
    expect(LADDERS.squat.rungs).toHaveLength(8)
    expect(LADDERS.hinge.rungs).toHaveLength(7)
    expect(LADDERS.core.rungs).toHaveLength(6)
    expect(LADDERS.pull.rungs).toHaveLength(6)
  })

  it('declares each ladder under its own pattern key', () => {
    for (const [pattern, ladder] of ladders) {
      expect(ladder.pattern).toBe(pattern)
    }
  })

  it('uses seconds for the daily block and reps for the rotating patterns', () => {
    expect(LADDERS.core.unit).toBe('seconds')
    expect(LADDERS.pull.unit).toBe('seconds')
    expect(LADDERS.push.unit).toBe('reps')
    expect(LADDERS.squat.unit).toBe('reps')
    expect(LADDERS.hinge.unit).toBe('reps')
  })
})

describe('sessions per rung is the law, not a knob', () => {
  it('is 14 on a rotating ladder and 42 on the daily block', () => {
    // sessions of the pattern per week × 6. 2.3×/week → 14, 7×/week → 42.
    expect(SESSIONS_PER_RUNG_ROTATING).toBe(14)
    expect(SESSIONS_PER_RUNG_DAILY).toBe(42)
    expect(LADDERS.push.sessionsPerRung).toBe(SESSIONS_PER_RUNG_ROTATING)
    expect(LADDERS.squat.sessionsPerRung).toBe(SESSIONS_PER_RUNG_ROTATING)
    expect(LADDERS.hinge.sessionsPerRung).toBe(SESSIONS_PER_RUNG_ROTATING)
    expect(LADDERS.core.sessionsPerRung).toBe(SESSIONS_PER_RUNG_DAILY)
    expect(LADDERS.pull.sessionsPerRung).toBe(SESSIONS_PER_RUNG_DAILY)
  })

  it('reproduces the three step sizes the user specified independently', () => {
    // The whole justification for stating one law instead of three constants. If
    // any of these three stops holding, the law has stopped describing the
    // programme. corpus/wiki/progression-engine.md.
    const step = (span: number, sessions: number) => span / sessions
    // Push: 5→12 reps over 14 sessions = +1 rep per 2 sessions.
    expect(step(12 - 5, LADDERS.push.sessionsPerRung)).toBeCloseTo(0.5, 10)
    // Front plank: 20→60s over 42 sessions ≈ +1s per session.
    expect(step(60 - 20, LADDERS.core.sessionsPerRung)).toBeCloseTo(0.952, 3)
    // Prone Y: 10→30s over 42 sessions ≈ +1s per 2 sessions.
    expect(step(30 - 10, LADDERS.pull.sessionsPerRung)).toBeCloseTo(0.476, 3)
  })
})

describe('target ranges', () => {
  it('keeps min strictly below max everywhere', () => {
    for (const [pattern, ladder] of ladders) {
      expect(ladder.range.min, pattern).toBeLessThan(ladder.range.max)
    }
    for (const [pattern, index, rung] of allRungs) {
      if (!rung.range) continue
      expect(rung.range.min, `${pattern}[${index}]`).toBeLessThan(rung.range.max)
    }
  })

  it('makes every `seconds` rung declare its own range', () => {
    // The evidence-based ceilings genuinely differ per exercise — a front plank
    // runs to 60s, a tuck L-sit to 30 — so inheriting one span per ladder would
    // be wrong for most rungs rather than merely imprecise.
    for (const [pattern, index, rung] of allRungs) {
      if (LADDERS[pattern].unit !== 'seconds') continue
      expect(rung.range, `${pattern}[${index}] ${rung.id} declares no range`).toBeDefined()
    }
  })

  it('leaves every rep rung on the ladder default of 5–12', () => {
    for (const [pattern, , rung] of allRungs) {
      if (LADDERS[pattern].unit !== 'reps') continue
      expect(rung.range, `${rung.id} overrides the rep range`).toBeUndefined()
      expect(LADDERS[pattern].range).toEqual({ min: 5, max: 12 })
    }
  })

  it('matches the hold-cap table in corpus/wiki/programme.md rung for rung', () => {
    // Hard-coded from the wiki table. These numbers came out of the isometric
    // literature; a drifting one is a content regression, not a tuning choice.
    const expected: Readonly<Record<string, [number, number]>> = {
      'core-01-dead-bug': [20, 45],
      'core-02-plank': [20, 60],
      'core-03-side-plank': [15, 45],
      'core-04-hollow-hold': [15, 45],
      'core-05-hollow-rock': [15, 45],
      'core-06-tuck-l-sit': [10, 30],
      'pull-01-prone-y': [10, 30],
      'pull-02-prone-t': [10, 30],
      'pull-03-ytw-combo': [20, 45],
      'pull-04-reverse-snow-angel': [20, 45],
      'pull-05-prone-lat-slide': [20, 45],
      'pull-06-end-range-isometric': [20, 45],
    }
    const timed = allRungs
      .filter(([pattern]) => LADDERS[pattern].unit === 'seconds')
      .map(([, , rung]) => rung)
    expect(timed.map((r) => r.id).sort()).toEqual(Object.keys(expected).sort())
    for (const rung of timed) {
      const [min, max] = expected[rung.id]!
      expect([rung.range?.min, rung.range?.max], rung.id).toEqual([min, max])
    }
  })
})

describe('floor only — towels and the floor', () => {
  // Zero equipment means zero furniture. Every one of these words was in a cue
  // before brief 15, and each one made a rung undoable in a bare room.
  const FURNITURE = [
    'chair',
    'couch',
    'sofa',
    'bed',
    'stair',
    'door',
    'table',
    'counter',
    'windowsill',
  ]
  // Suffixes so `doorframe`, `stairs` and `countertop` are caught, while
  // `counterweight` (a real cue, on the squat ladder) is not a false positive.
  const FURNITURE_RE = new RegExp(
    `\\b(${FURNITURE.join('|')})(s|es|frame|frames|top|tops|way|ways|sill|sills|case|cases)?\\b`,
    'i',
  )

  it('names no furniture in any rung cue or name', () => {
    for (const [, , rung] of allRungs) {
      for (const text of [rung.name, ...rung.cues]) {
        const hit = FURNITURE_RE.exec(text)
        expect(hit?.[0], `${rung.id} names furniture: "${hit?.[0]}" in "${text}"`).toBeUndefined()
      }
    }
  })

  it('names no furniture in the cardio protocol either', () => {
    for (const text of [...CARDIO.cues, ...CARDIO.movements, CARDIO.notice]) {
      expect(FURNITURE_RE.exec(text)?.[0], text).toBeUndefined()
    }
  })

  it('still catches the words it is meant to catch', () => {
    // A grep test that cannot fail is worse than no test. These are the exact
    // strings the retired rungs used.
    for (const text of [
      'Hands on a kitchen counter or windowsill at about hip-to-chest height.',
      'Hands on the front edge of a sturdy chair seat or the third stair.',
      'Wedge your heels under the couch frame.',
      'Stand an arm\'s length from a doorframe.',
      'Feet up on the sofa.',
      'Sit on the edge of the bed.',
      'Hands on a low table.',
    ]) {
      expect(FURNITURE_RE.test(text), `missed furniture in "${text}"`).toBe(true)
    }
    expect(FURNITURE_RE.test('arms forward as a counterweight'), 'counterweight').toBe(false)
  })
})

describe('retired rung ids', () => {
  it('are gone from the ladders but still degrade gracefully', () => {
    // The floor-only fix changed six movements, and every one got a NEW id
    // because the old id is sitting in real persisted history. `findRungById`
    // must answer "I do not know that one", not throw.
    const retired = [
      'push-01-hands-high',
      'push-02-hands-low',
      'push-07-feet-elevated',
      'hinge-04-single-leg-feet-elevated',
      'hinge-05-nordic-negative',
      'hinge-06-nordic-negative-long-eccentric',
    ]
    for (const id of retired) {
      expect(() => findRungById(id)).not.toThrow()
      expect(findRungById(id), `${id} was reused rather than retired`).toBeUndefined()
    }
  })

  it('left no nordic rung behind, in id or in cue text', () => {
    // A hamstring cannot be anchored to a floor, so the movement is simply gone.
    for (const [, , rung] of allRungs) {
      expect(rung.id, rung.id).not.toContain('nordic')
      expect(`${rung.name} ${rung.cues.join(' ')}`.toLowerCase(), rung.id).not.toContain('nordic')
    }
  })
})

describe('safetyCritical and the starting-rung cap', () => {
  const safetyCritical = allRungs.filter(([, , r]) => r.safetyCritical === true).map(([, , r]) => r)

  it('agrees exactly with NEVER_A_STARTING_RUNG', () => {
    // Two lists answering the same question ("does failing this hurt you?") are
    // worse than one, so this test is what keeps them a single fact.
    expect(safetyCritical.map((r) => r.id).sort()).toEqual([...NEVER_A_STARTING_RUNG].sort())
  })

  it('flags exactly the six rungs the decision names', () => {
    expect([...NEVER_A_STARTING_RUNG].sort()).toEqual([
      'core-04-hollow-hold',
      'core-05-hollow-rock',
      'core-06-tuck-l-sit',
      'push-09-archer',
      'squat-07-assisted-single-leg',
      'squat-08-pistol-progression',
    ])
  })

  it('names every hollow, l-sit, pistol, archer and single-leg-squat rung in the list', () => {
    // The list has to stay complete or the test above proves nothing.
    const risky = allRungs
      .map(([, , rung]) => rung.id)
      .filter((id) => /pistol|archer|hollow|l-sit|assisted-single-leg/.test(id))
    for (const id of risky) {
      expect(NEVER_A_STARTING_RUNG, `${id} is not flagged safetyCritical`).toContain(id)
    }
    expect(risky.length).toBeGreaterThan(3)
  })

  it('opens every safetyCritical rung with the safety check, in cues[0]', () => {
    // The UI contract brief 19 implements: on these rungs cues[0] renders first
    // and visually separated. It has to actually BE the safety check.
    for (const rung of safetyCritical) {
      const first = rung.cues[0]!
      expect(first, `${rung.id} cues[0] is not a safety check`).toMatch(/safety check/i)
      expect(first, `${rung.id} cues[0] does not say what to do instead`).toMatch(
        /only start|do not start|stay on|if you cannot/i,
      )
    }
  })

  it('leaves the hinge ladder with no safetyCritical rung at all', () => {
    // The nordic negatives were the whole of this ladder's injury risk and they
    // are gone. Recorded as a test so a future edit has to notice it is
    // reintroducing one. corpus/wiki/decisions.md.
    for (const rung of LADDERS.hinge.rungs) {
      expect(rung.safetyCritical, rung.id).toBeFalsy()
    }
  })

  it('sits inside every ladder', () => {
    for (const [pattern, ladder] of ladders) {
      expect(ladder.startRungIndex, pattern).toBeGreaterThanOrEqual(0)
      expect(ladder.startRungIndex, pattern).toBeLessThan(ladder.rungs.length)
      expect(Number.isInteger(ladder.startRungIndex), pattern).toBe(true)
      expect(() => getRung(pattern, ladder.startRungIndex)).not.toThrow()
    }
  })

  it('never starts on a rung whose failure mode is injurious', () => {
    const starting = ladders.map(([pattern, ladder]) => getRung(pattern, ladder.startRungIndex))
    for (const rung of starting) {
      expect(rung.safetyCritical, `${rung.id} is a starting rung`).toBeFalsy()
      expect(NEVER_A_STARTING_RUNG, `${rung.id} is a starting rung`).not.toContain(rung.id)
    }
    for (const banned of NEVER_A_STARTING_RUNG) {
      expect(findRungById(banned), `${banned} is not a real rung id`).toBeDefined()
    }
  })

  it('leaves at least one easier rung below every start', () => {
    for (const [pattern, ladder] of ladders) {
      expect(ladder.startRungIndex, `${pattern} starts at the bottom`).toBeGreaterThan(0)
    }
  })

  it('leaves plenty of ladder above, so nobody is immediately maxed', () => {
    for (const [pattern, ladder] of ladders) {
      const above = ladder.rungs.length - 1 - ladder.startRungIndex
      expect(above, `${pattern} starts too close to the top`).toBeGreaterThanOrEqual(4)
    }
  })

  it('starts each ladder at the rung the reasoning in ladders.ts names', () => {
    // Hard-coded deliberately: these five values each carry a written safety
    // justification, and a silent change to one must fail a test rather than only
    // move a comment out of date.
    expect(getRung('push', LADDERS.push.startRungIndex).id).toBe('push-03-knees')
    expect(getRung('squat', LADDERS.squat.startRungIndex).id).toBe('squat-02-bodyweight')
    expect(getRung('hinge', LADDERS.hinge.startRungIndex).id).toBe(
      'hinge-02-glute-bridge-2s-top-hold',
    )
    expect(getRung('core', LADDERS.core.startRungIndex).id).toBe('core-02-plank')
    expect(getRung('pull', LADDERS.pull.startRungIndex).id).toBe('pull-02-prone-t')
  })

  it('keeps the hinge start bilateral and supine', () => {
    const start = getRung('hinge', LADDERS.hinge.startRungIndex)
    expect(start.modifier?.unilateral).toBeFalsy()
    expect(start.id).toContain('glute-bridge')
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
    expect([...seen].filter(([, n]) => n > 1).map(([id]) => id)).toEqual([])
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
      expect(
        rung.cues.some((c) => /\bstop\b/i.test(c)),
        `${rung.id} has no cue telling the user to stop the set`,
      ).toBe(true)
    }
  })

  it('states a tempo on every rep-based rung', () => {
    // Silence about tempo is how a modifier leaks into a rung that should not
    // carry it. Normal tempo has to be said out loud too.
    for (const [pattern, , rung] of allRungs) {
      if (LADDERS[pattern].unit !== 'reps') continue
      expect(
        rung.cues.some((c) => /tempo|second/i.test(c)),
        `${rung.id} never says how fast to move`,
      ).toBe(true)
    }
  })

  it('locates every pause inside the rep, in words', () => {
    // "2s pause" without a location makes two adjacent rungs identical in
    // practice, which is the whole risk the cue convention exists to avoid.
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
      expect(text, `${rung.id} never states its ${seconds}-second count in words`).toMatch(
        new RegExp(`${word}[ -](full )?second`),
      )
      expect(text, `${rung.id} never says the count applies to the lowering`).toMatch(
        /lower|descen|down|slide out/,
      )
    }
  })

  it('says per-side on every unilateral rep-based rung', () => {
    for (const [pattern, , rung] of allRungs) {
      if (!rung.modifier?.unilateral) continue
      if (LADDERS[pattern].unit !== 'reps') continue
      expect(rung.cues.join(' ').toLowerCase(), `${rung.id} never says how reps count`).toMatch(
        /per (leg|side)|each side|switch|alternate/,
      )
    }
  })

  it('names the neighbouring rung wherever a rung differs only by a modifier', () => {
    // These rungs share a pose and a figure with a neighbour. A cue that does not
    // say what changed leaves the user performing both rungs identically.
    const mustCrossReference: readonly string[] = [
      'push-02-knees-short-lever',
      'push-03-knees',
      'push-05-full-3s-down',
      'push-06-full-3s-down-2s-bottom-hold',
      'push-07-pike',
      'push-08-diamond-hands',
      'squat-03-3s-down',
      'squat-04-3s-down-2s-bottom-hold',
      'squat-05-heels-elevated',
      'squat-06-split',
      'hinge-02-glute-bridge-2s-top-hold',
      'hinge-03-single-leg-bridge',
      'hinge-04-single-leg-heel-far',
      'hinge-06-sliding-curl-eccentric',
      'hinge-07-single-leg-slide',
      'core-05-hollow-rock',
      'pull-05-prone-lat-slide',
    ]
    for (const id of mustCrossReference) {
      const rung = findRungById(id)
      expect(rung, `${id} not found`).toBeDefined()
      expect(rung!.cues.join(' '), `${id} never says what changed from its neighbour`).toMatch(
        /rung \d/i,
      )
    }
  })
})

describe('the pull ladder is postural, not strength', () => {
  // Safety invariant, not a preference: there is no anchor, so labelling this
  // ladder as pull strength would misrepresent what the user is training.
  it('carries kind: postural', () => {
    expect(LADDERS.pull.kind).toBe('postural')
    expect(LADDERS.pull.kind).not.toBe('strength')
  })

  it('is the only postural ladder', () => {
    expect(ladders.filter(([, l]) => l.kind === 'postural').map(([p]) => p)).toEqual(['pull'])
  })

  it('ships wording the UI can surface, saying the gap out loud', () => {
    expect(POSTURAL_NOTICE.toLowerCase()).toContain('postural')
    expect(POSTURAL_NOTICE.toLowerCase()).toContain('not pulling strength')
    expect(POSTURAL_NOTICE.length).toBeGreaterThan(80)
  })

  it('never calls a rung a row, pull-up or pulldown', () => {
    // The angle-based pull ladder is designed and waiting for an anchor. Until one
    // exists, no rung here may borrow its vocabulary in a name.
    for (const rung of LADDERS.pull.rungs) {
      expect(rung.name.toLowerCase(), rung.id).not.toMatch(/\brow\b|pull-?up|pulldown/)
    }
  })
})

describe('the cardio protocol', () => {
  it('is 5 rounds of 60 seconds', () => {
    expect(CARDIO.rounds).toBe(5)
    // 60, not 20: 4×4min gave 6.5% VO2max against 3.3% for 8×20s. Do not Tabata
    // this. corpus/wiki/programme.md#the-cardio-day.
    expect(CARDIO.hardSeconds).toBe(60)
  })

  it('is prescribed by breathlessness and carries no count to hit', () => {
    // The failure mode this guards: a rep target is a number the user can pace
    // themselves down to, and self-pacing to nothing is exactly what makes an
    // interval session worthless. The absence of the field is the guarantee.
    expect(CARDIO.prescribedBy).toBe('breathlessness')
    for (const field of ['reps', 'range', 'unit', 'target', 'targetValue', 'sets']) {
      expect(CARDIO, `cardio must not carry ${field}`).not.toHaveProperty(field)
    }
    for (const cue of CARDIO.cues) {
      expect(cue, `cardio cue prescribes reps: "${cue}"`).not.toMatch(/\breps?\b|\brepetition/i)
    }
    expect(CARDIO.cues.join(' ').toLowerCase()).toMatch(/breath/)
  })

  it('is lower-body only', () => {
    // The push day is upper-body and the core/posture block is daily, so burpees
    // and mountain climbers would collide with both.
    const text = [...CARDIO.movements, ...CARDIO.cues].join(' ').toLowerCase()
    for (const banned of ['burpee', 'mountain climber', 'push-up', 'plank', 'jumping jack']) {
      expect(text, `cardio uses ${banned}`).not.toContain(banned)
    }
    expect(CARDIO.movements.length).toBeGreaterThanOrEqual(2)
    expect(text).toMatch(/high knees|squat/)
  })

  it('states its honest limit rather than hiding it', () => {
    // This protocol reaches ~20–45% of the guideline aerobic minimum. The app
    // says so; that is a locked call.
    expect(CARDIO.notice).toMatch(/20–45%|20-45%/)
    expect(CARDIO.notice.toLowerCase()).toContain('aerobic')
    expect(CARDIO.notice.length).toBeGreaterThan(120)
  })

  it('gives every round a stop signal, like every rung does', () => {
    expect(CARDIO.cues.some((c) => /\bstop\b/i.test(c))).toBe(true)
  })
})

describe('getRung', () => {
  it('returns the rung at a valid index', () => {
    expect(getRung('push', 0).id).toBe('push-01-wall')
    expect(getRung('push', 3).id).toBe('push-04-full')
    expect(getRung('pull', topRungIndex('pull')).id).toBe('pull-06-end-range-isometric')
  })

  it('agrees with the ladder arrays for every pattern and index', () => {
    for (const [pattern, index, rung] of allRungs) {
      expect(getRung(pattern, index)).toBe(rung)
    }
  })

  it('throws loudly rather than returning undefined past the top', () => {
    // A hand-edited counter past the top of a ladder must fail where it is wrong,
    // not render a blank card and get logged against nothing.
    expect(() => getRung('hinge', 7)).toThrow(/hinge has no rung at index 7/)
    expect(() => getRung('hinge', 7)).toThrow(/valid range 0\.\.6/)
    expect(() => getRung('hinge', 7)).toThrow(/sessionsDone/)
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
    expect(findRungById('hinge-05-sliding-leg-curl')?.id).toBe('hinge-05-sliding-leg-curl')
  })

  it('returns undefined for an unknown id instead of throwing', () => {
    expect(findRungById('push-99-jetpack')).toBeUndefined()
    expect(findRungById('')).toBeUndefined()
  })
})
