/**
 * Codec tests.
 *
 * The bar here is not "the happy path works". It is:
 *
 *   - a real document survives a round trip byte-for-byte,
 *   - every malformed input produces a *useful* message rather than a throw,
 *   - and no malformed input ever yields a document.
 *
 * That last one is the load-bearing property: a partially-understood document
 * that the app then saves back is how a hand-edit typo becomes permanent data
 * loss. So `expectRejected` asserts both the failure *and* the absence of a doc,
 * and every case goes through it.
 */
import { describe, expect, it } from 'vitest'
import type { Ladder, Pattern, Rung, RungId, StateDoc } from '../../domain/types.ts'
import { CURRENT_SCHEMA_VERSION, PATTERNS } from '../../domain/types.ts'
import { LADDERS } from '../../domain/ladders.ts'
import { freshLadderStates } from '../../domain/engine.ts'
import { midProgram } from '../../domain/__tests__/fixtures.ts'
import { emptyDoc, migrate, parse, serialise, summarise } from '../codec.ts'
import type { ParseResult } from '../codec.ts'

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Synthetic ladder content, so the codec's bounds checking can be tested
 * without depending on the real rung counts in `src/domain/ladders.ts`. One
 * test below checks the real content separately.
 */
function stubLadders(rungCounts: Record<Pattern, number>): Readonly<Record<Pattern, Ladder>> {
  const out = {} as Record<Pattern, Ladder>
  for (const pattern of PATTERNS) {
    const count = rungCounts[pattern]
    const rungs: Rung[] = Array.from({ length: count }, (_, i) => ({
      id: `${pattern}-${String(i).padStart(2, '0')}-stub` as RungId,
      name: `${pattern} stub ${i}`,
      cues: ['stub cue one', 'stub cue two'],
    }))
    out[pattern] = {
      pattern,
      unit: pattern === 'core' || pattern === 'pull' ? 'seconds' : 'reps',
      kind: pattern === 'pull' ? 'postural' : 'strength',
      // Mirrors the real content's shape — mid-ladder, and `push` a rung higher
      // than the rest — so `emptyDoc` is exercised against a non-zero start.
      startRungIndex: pattern === 'push' ? 2 : 1,
      targetMin: pattern === 'core' || pattern === 'pull' ? 20 : 5,
      targetMax: pattern === 'core' || pattern === 'pull' ? 45 : 12,
      rungs,
    }
  }
  return out
}

const STUB = stubLadders({ push: 9, squat: 8, hinge: 6, core: 6, pull: 6 })

/** Serialised `midProgram`, re-parsed into a mutable tree for corruption. */
function mutableDoc(): Record<string, unknown> {
  return JSON.parse(serialise(midProgram)) as Record<string, unknown>
}

function corrupt(mutate: (doc: Record<string, unknown>) => void): string {
  const doc = mutableDoc()
  mutate(doc)
  return JSON.stringify(doc, null, 2)
}

/**
 * Asserts the three things that matter at once: no throw, `ok: false`, and no
 * document handed back under any key.
 */
function expectRejected(text: unknown, ...expectedFragments: string[]): string {
  let result: ParseResult | undefined
  expect(() => {
    result = parse(text, { ladders: STUB })
  }).not.toThrow()
  if (!result) throw new Error('parse returned nothing')
  expect(result.ok).toBe(false)
  // No partially-valid document, under any name.
  expect(Object.keys(result)).toEqual(['ok', 'error'])
  if (result.ok) throw new Error('unreachable')
  for (const fragment of expectedFragments) {
    expect(result.error).toContain(fragment)
  }
  // A message with no content is as bad as a throw.
  expect(result.error.length).toBeGreaterThan(10)
  return result.error
}

/**
 * A v2 document rendered back into the **v1** shape it would have been stored in:
 * `schemaVersion: 1`, and an `effort` rating on every exercise.
 *
 * Built from `midProgram` rather than checked in as a text blob so it cannot drift
 * away from the current fixture — the whole point of the round-trip test is that
 * migration turns this into exactly `midProgram`. The ratings cycle through the
 * three v1 values deterministically; nothing reads them, which is why the field
 * was deleted.
 */
function asV1(doc: StateDoc): Record<string, unknown> {
  const V1_EFFORTS = ['easy', 'ok', 'hard'] as const
  const raw = JSON.parse(serialise(doc)) as Record<string, unknown>
  let n = 0
  raw['schemaVersion'] = 1
  for (const session of raw['history'] as Record<string, unknown>[]) {
    for (const exercise of session['exercises'] as Record<string, unknown>[]) {
      exercise['effort'] = V1_EFFORTS[n % V1_EFFORTS.length]
      n += 1
    }
  }
  return raw
}

function expectAccepted(text: string, ladders = STUB): StateDoc {
  const result = parse(text, { ladders })
  if (!result.ok) throw new Error(`expected a valid document, got: ${result.error}`)
  return result.doc
}

// ─── Round trip ─────────────────────────────────────────────────────────────

describe('round trip on the mid-program fixture', () => {
  it('serialises and parses back to a deeply equal document', () => {
    const doc = expectAccepted(serialise(midProgram))
    expect(doc).toEqual(midProgram)
  })

  it('is stable: re-serialising a parsed document produces identical text', () => {
    const first = serialise(midProgram)
    const second = serialise(expectAccepted(first))
    expect(second).toBe(first)
  })

  it('validates against the real ladder content, so the fixture is in bounds', () => {
    const doc = expectAccepted(serialise(midProgram), LADDERS)
    expect(doc).toEqual(midProgram)
  })

  it('key order does not depend on how the object was built', () => {
    // Same data, opposite insertion order. `serialise` must not care.
    const reordered = {
      settings: midProgram.settings,
      history: midProgram.history,
      ladders: {
        pull: midProgram.ladders.pull,
        core: midProgram.ladders.core,
        hinge: midProgram.ladders.hinge,
        squat: midProgram.ladders.squat,
        push: midProgram.ladders.push,
      },
      cyclePosition: midProgram.cyclePosition,
      sessionsCompleted: midProgram.sessionsCompleted,
      schemaVersion: midProgram.schemaVersion,
    } as StateDoc
    expect(serialise(reordered)).toBe(serialise(midProgram))
  })

  it('round-trips an empty document', () => {
    const fresh = emptyDoc(STUB)
    expect(expectAccepted(serialise(fresh))).toEqual(fresh)
  })

  it('round-trips configured sync settings', () => {
    const withSync: StateDoc = {
      ...midProgram,
      settings: { ...midProgram.settings, sync: { baseUrl: 'https://x.example/s', secret: 'shh' } },
    }
    expect(expectAccepted(serialise(withSync))).toEqual(withSync)
  })

  it('round-trips a document whose history has been pruned by hand', () => {
    // sessionsCompleted is monotonic; history is a list a user may trim. The two
    // are deliberately not required to agree.
    const pruned: StateDoc = { ...midProgram, history: midProgram.history.slice(-2) }
    const doc = expectAccepted(serialise(pruned))
    expect(doc.sessionsCompleted).toBe(midProgram.sessionsCompleted)
    expect(doc.history).toHaveLength(2)
  })
})

// ─── Serialised form is human-readable ──────────────────────────────────────

describe('serialised form', () => {
  const text = serialise(midProgram)

  it('is valid JSON and ends with a newline', () => {
    expect(() => JSON.parse(text)).not.toThrow()
    expect(text.endsWith('\n')).toBe(true)
  })

  it('leads with the summary and puts history last', () => {
    const lines = text.split('\n')
    expect(lines[1]).toContain('"schemaVersion"')
    expect(lines[2]).toContain('"sessionsCompleted"')
    expect(text.indexOf('"history"')).toBeGreaterThan(text.indexOf('"ladders"'))
    expect(text.indexOf('"history"')).toBeGreaterThan(text.indexOf('"settings"'))
  })

  it('keeps each ladder state and each set on one line, so history is scannable', () => {
    expect(text).toContain('"push": { "rungIndex": 3, "target": 7, "cleanAtMax": 0, "missedStreak": 0 }')
    expect(text).toContain('{ "targetValue": 10, "actualValue": 10 }')
  })

  it('writes a cardio day as a session with an empty exercises array', () => {
    // One line, and no `"exercises": [ ... ]` block to scroll past. A cardio day
    // is a real completed session, so it has to appear in history.
    expect(text).toContain('"day": "D"')
    expect(text).toContain('"exercises": []')
  })

  it('carries no effort field anywhere', () => {
    expect(text).not.toContain('effort')
  })

  it('is small enough that localStorage is not a constraint', () => {
    // 21 sessions. Five years of three-a-week training is ~500 sessions.
    const perSession = text.length / midProgram.history.length
    expect(perSession * 500).toBeLessThan(1_000_000)
  })
})

// ─── Malformed input: never throws, never yields a document ─────────────────

describe('parse rejects malformed input', () => {
  it('non-string input', () => {
    expectRejected(undefined, 'expected the document as text')
    expectRejected(null, 'expected the document as text')
    expectRejected(42, 'expected the document as text')
    expectRejected({ schemaVersion: 1 }, 'expected the document as text')
  })

  it('empty or whitespace-only text', () => {
    expectRejected('', 'empty')
    expectRejected('   \n  ', 'empty')
  })

  it('a truncated file', () => {
    const cut = serialise(midProgram).slice(0, 200)
    expectRejected(cut, 'not valid JSON')
  })

  it('a stray trailing comma, the classic hand-edit slip', () => {
    expectRejected('{ "schemaVersion": 1, }', 'not valid JSON')
  })

  it('JSON that is not an object', () => {
    expectRejected('[]', 'must be a JSON object')
    expectRejected('"a string"', 'must be a JSON object')
    expectRejected('null', 'must be a JSON object')
    expectRejected('12', 'must be a JSON object')
  })

  it('an unrelated JSON file', () => {
    const error = expectRejected(
      '{ "name": "some-package", "version": "1.0.0" }',
      'schemaVersion',
      'probably not a state document',
    )
    expect(error).not.toContain('history')
  })

  it('a missing, non-integer or zero schemaVersion', () => {
    expectRejected(corrupt((d) => delete d['schemaVersion']), 'schemaVersion', 'missing')
    expectRejected(corrupt((d) => (d['schemaVersion'] = 0)), 'schemaVersion')
    expectRejected(corrupt((d) => (d['schemaVersion'] = 1.5)), 'schemaVersion')
    expectRejected(corrupt((d) => (d['schemaVersion'] = '1')), 'schemaVersion', '"1"')
  })

  it('a document from a newer build, without misreading it', () => {
    const error = expectRejected(
      corrupt((d) => (d['schemaVersion'] = CURRENT_SCHEMA_VERSION + 1)),
      'newer version of the app',
    )
    expect(error).toContain('update the app')
  })

  it('a missing ladder', () => {
    expectRejected(
      corrupt((d) => delete (d['ladders'] as Record<string, unknown>)['hinge']),
      'ladders.hinge',
      'missing',
    )
  })

  it('ladders that is not an object', () => {
    expectRejected(corrupt((d) => (d['ladders'] = [])), 'ladders', 'expected an object')
  })

  it('a rungIndex past the top of the ladder', () => {
    const error = expectRejected(
      corrupt((d) => ((d['ladders'] as Record<string, Record<string, unknown>>)['push']!['rungIndex'] = 47)),
      'ladders.push.rungIndex',
      '47',
    )
    // The message must say what the legal range actually is — "out of range"
    // sends the reader back to the source to find out what the range was.
    expect(error).toContain('between 0 and 8')
    expect(error).toContain('the push ladder has 9 rungs')
    // And it is one problem, not two.
    expect(error).not.toContain('problems in the state document')
  })

  it('a negative or fractional rungIndex', () => {
    expectRejected(
      corrupt((d) => ((d['ladders'] as Record<string, Record<string, unknown>>)['squat']!['rungIndex'] = -1)),
      'ladders.squat.rungIndex',
    )
    expectRejected(
      corrupt((d) => ((d['ladders'] as Record<string, Record<string, unknown>>)['squat']!['rungIndex'] = 2.5)),
      'ladders.squat.rungIndex',
      'whole number',
    )
  })

  it('a target that is not a number', () => {
    expectRejected(
      corrupt((d) => ((d['ladders'] as Record<string, Record<string, unknown>>)['core']!['target'] = null)),
      'ladders.core.target',
      'expected a number',
    )
    expectRejected(
      corrupt((d) => ((d['ladders'] as Record<string, Record<string, unknown>>)['core']!['target'] = '35')),
      'ladders.core.target',
    )
  })

  it('an unknown key inside a ladder state', () => {
    expectRejected(
      corrupt((d) => ((d['ladders'] as Record<string, Record<string, unknown>>)['pull']!['rungIdx'] = 2)),
      'ladders.pull.rungIdx',
      'unknown field',
    )
  })

  it('history that is not an array', () => {
    expectRejected(corrupt((d) => (d['history'] = {})), 'history', 'expected an array')
    expectRejected(corrupt((d) => delete d['history']), 'history', 'missing')
  })

  it('a history entry that is not an object', () => {
    expectRejected(
      corrupt((d) => ((d['history'] as unknown[])[2] = 'a session')),
      'history[2]',
      'expected an object',
    )
  })

  it('a bad cycle day', () => {
    expectRejected(
      corrupt((d) => ((d['history'] as Record<string, unknown>[])[1]!['day'] = 'E')),
      'history[1].day',
      '"A", "B", "C" or "D"',
    )
  })

  it('but not "D", which became legal when the cycle grew a cardio day', () => {
    // The codec derives the legal days from CYCLE. If it kept its own list, every
    // cardio session the engine prescribes would fail to load.
    const doc = expectAccepted(
      corrupt((d) => ((d['history'] as Record<string, unknown>[])[1]!['day'] = 'D')),
    )
    expect(doc.history[1]?.day).toBe('D')
  })

  it('a completedAt that is not an ISO instant', () => {
    expectRejected(
      corrupt((d) => ((d['history'] as Record<string, unknown>[])[0]!['completedAt'] = 'last tuesday')),
      'history[0].completedAt',
      'ISO-8601',
    )
    expectRejected(
      corrupt((d) => ((d['history'] as Record<string, unknown>[])[0]!['completedAt'] = '2026-13-45T99:00:00.000Z')),
      'history[0].completedAt',
    )
  })

  it('a bad pattern or rungId inside an exercise', () => {
    const exercise = (d: Record<string, unknown>): Record<string, unknown> =>
      ((d['history'] as Record<string, unknown>[])[0]!['exercises'] as Record<string, unknown>[])[0]!

    expectRejected(
      corrupt((d) => (exercise(d)['pattern'] = 'bench')),
      'history[0].exercises[0].pattern',
      'push, squat, hinge, core, pull',
    )
    expectRejected(
      corrupt((d) => (exercise(d)['rungId'] = 'pushup-3')),
      'history[0].exercises[0].rungId',
      'push-04-full',
    )
    expectRejected(
      corrupt((d) => (exercise(d)['rungId'] = 'push-')),
      'history[0].exercises[0].rungId',
    )
  })

  it('an effort field hand-typed into a v2 document', () => {
    // v2 has no effort. Migration strips it from a v1 document, but a document
    // already claiming v2 has no excuse, and the field is reported as the unknown
    // key it is rather than silently dropped.
    expectRejected(
      corrupt(
        (d) =>
          (((d['history'] as Record<string, unknown>[])[0]!['exercises'] as Record<
            string,
            unknown
          >[])[0]!['effort'] = 'hard'),
      ),
      'history[0].exercises[0].effort',
      'unknown field',
    )
  })

  it('an exercise with no sets at all', () => {
    expectRejected(
      corrupt(
        (d) =>
          (((d['history'] as Record<string, unknown>[])[0]!['exercises'] as Record<string, unknown>[])[0]![
            'sets'
          ] = []),
      ),
      'history[0].exercises[0].sets',
      'at least one set',
    )
  })

  it('a set whose values are not numbers', () => {
    expectRejected(
      corrupt(
        (d) =>
          ((
            ((d['history'] as Record<string, unknown>[])[0]!['exercises'] as Record<string, unknown>[])[0]![
              'sets'
            ] as Record<string, unknown>[]
          )[1]!['actualValue'] = 'ten'),
      ),
      'history[0].exercises[0].sets[1].actualValue',
      'expected a number',
    )
  })

  it('every settings field, when missing or mistyped', () => {
    const settings = (d: Record<string, unknown>): Record<string, unknown> =>
      d['settings'] as Record<string, unknown>

    expectRejected(corrupt((d) => delete settings(d)['soundEnabled']), 'settings.soundEnabled', 'missing')
    expectRejected(corrupt((d) => (settings(d)['voiceEnabled'] = 'yes')), 'settings.voiceEnabled', 'true or false')
    expectRejected(
      corrupt((d) => delete settings(d)['skipWarmupByDefault']),
      'settings.skipWarmupByDefault',
    )
    expectRejected(
      corrupt((d) => (settings(d)['persistGranted'] = 'granted')),
      'settings.persistGranted',
      'not requested yet',
    )
    expectRejected(corrupt((d) => delete settings(d)['sync']), 'settings.sync', 'missing')
    expectRejected(corrupt((d) => delete d['settings']), 'settings', 'missing')
  })

  it('half-configured sync settings', () => {
    expectRejected(
      corrupt((d) => ((d['settings'] as Record<string, unknown>)['sync'] = { baseUrl: 'https://x' })),
      'settings.sync.secret',
      'missing',
    )
    expectRejected(
      corrupt((d) => ((d['settings'] as Record<string, unknown>)['sync'] = { baseUrl: 5, secret: 'x' })),
      'settings.sync.baseUrl',
      'expected a string',
    )
  })

  it('a negative or fractional session counter', () => {
    expectRejected(corrupt((d) => (d['sessionsCompleted'] = -1)), 'sessionsCompleted')
    expectRejected(corrupt((d) => (d['cyclePosition'] = 1.5)), 'cyclePosition', 'whole number')
  })

  it('a misspelled top-level key, and says what it probably meant', () => {
    const error = expectRejected(
      corrupt((d) => {
        d['sessionscompleted'] = d['sessionsCompleted']
        delete d['sessionsCompleted']
      }),
      'sessionscompleted',
      'did you mean "sessionsCompleted"',
    )
    // And still reports the field that is now missing.
    expect(error).toContain('sessionsCompleted: expected a whole number')
  })

  it('an unrecognised top-level key', () => {
    expectRejected(corrupt((d) => (d['streak'] = 12)), 'streak', 'unknown field')
  })

  it('reports several problems at once, because a hand-edit rarely breaks one thing', () => {
    const error = expectRejected(
      corrupt((d) => {
        d['sessionsCompleted'] = 'nine'
        d['cyclePosition'] = null
        ;(d['settings'] as Record<string, unknown>)['soundEnabled'] = 1
      }),
      'problems in the state document',
    )
    expect(error).toContain('sessionsCompleted')
    expect(error).toContain('cyclePosition')
    expect(error).toContain('settings.soundEnabled')
  })
})

// ─── Deliberate leniency ────────────────────────────────────────────────────

describe('parse is lenient exactly where it should be', () => {
  it('allows a hand-written note under an underscore key, and drops it', () => {
    const doc = expectAccepted(
      corrupt((d) => {
        d['_note'] = 'bumped push to rung 4 by hand on 2026-07-20'
      }),
    )
    expect(doc).toEqual(midProgram)
    expect(serialise(doc)).not.toContain('_note')
  })

  it('accepts a hand-raised target above the ladder maximum', () => {
    // "I can actually do 20 of these" is a legitimate edit; the engine converges
    // from anywhere, so rejecting it would make the file less hand-editable for
    // the exact reason it is hand-editable.
    const doc = expectAccepted(
      corrupt((d) => ((d['ladders'] as Record<string, Record<string, unknown>>)['push']!['target'] = 20)),
    )
    expect(doc.ladders.push.target).toBe(20)
  })

  it('accepts a rungId from an older content revision', () => {
    // Rung ids are immutable so history can reference them forever. Validating
    // them against current content would reject a legitimately old document.
    const doc = expectAccepted(
      corrupt(
        (d) =>
          (((d['history'] as Record<string, unknown>[])[0]!['exercises'] as Record<string, unknown>[])[0]![
            'rungId'
          ] = 'push-99-retired-variant'),
      ),
    )
    expect(doc.history[0]?.exercises[0]?.rungId).toBe('push-99-retired-variant')
  })

  it('accepts an empty history', () => {
    const doc = expectAccepted(corrupt((d) => (d['history'] = [])))
    expect(doc.history).toEqual([])
  })

  it('checks only that rungIndex is a non-negative integer when no ladders are supplied', () => {
    const text = corrupt(
      (d) => ((d['ladders'] as Record<string, Record<string, unknown>>)['push']!['rungIndex'] = 47),
    )
    expect(parse(text).ok).toBe(true)
    expect(parse(text, { ladders: STUB }).ok).toBe(false)
  })
})

// ─── Never throws, on anything ──────────────────────────────────────────────

describe('parse never throws', () => {
  it('on every prefix of a valid document', () => {
    const full = serialise(midProgram)
    for (let end = 0; end < full.length; end += 7) {
      const prefix = full.slice(0, end)
      let result: ParseResult | undefined
      expect(() => {
        result = parse(prefix, { ladders: STUB })
      }).not.toThrow()
      // Any proper prefix is an incomplete document. (The one exception is a
      // prefix that only drops the trailing newline, which is still valid JSON.)
      if (prefix.trim() !== full.trim()) expect(result?.ok).toBe(false)
    }
    expect(parse(full, { ladders: STUB }).ok).toBe(true)
  })

  it('on hostile and degenerate input', () => {
    const inputs: unknown[] = [
      '{}',
      '{"schemaVersion":1}',
      '[[[[[[[[[[]]]]]]]]]]',
      '{"schemaVersion":1,"ladders":{"push":{"rungIndex":{"rungIndex":1}}}}',
      '{"__proto__":{"polluted":true},"schemaVersion":1}',
      ' ',
      '{"schemaVersion":1,"history":[[[]]]}',
      Number.NaN,
      Symbol('nope'),
      () => 'not text',
      new Map(),
      Object.create(null),
    ]
    for (const input of inputs) {
      expect(() => parse(input, { ladders: STUB })).not.toThrow()
      expect(parse(input, { ladders: STUB }).ok).toBe(false)
    }
    // Prototype pollution via a "__proto__" key must not have happened either.
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined()
  })
})

// ─── emptyDoc ───────────────────────────────────────────────────────────────

describe('emptyDoc', () => {
  const fresh = emptyDoc(LADDERS)

  it('starts every ladder at its startRungIndex with the target at the minimum', () => {
    // Descending calibration: mid-ladder movement, bottom-of-range volume.
    for (const pattern of PATTERNS) {
      expect(fresh.ladders[pattern].rungIndex, pattern).toBe(LADDERS[pattern].startRungIndex)
      expect(fresh.ladders[pattern].target).toBe(LADDERS[pattern].targetMin)
      expect(fresh.ladders[pattern].cleanAtMax).toBe(0)
      expect(fresh.ladders[pattern].missedStreak).toBe(0)
    }
  })

  it('agrees exactly with the engine’s own fresh state', () => {
    // `store.emptyDoc()` is what a real new user gets and `freshLadderStates()` is
    // what the simulation starts from. If they disagreed, every measured number
    // would describe a first session the app never actually prescribes.
    expect(fresh.ladders).toEqual(freshLadderStates())
  })

  it('honours a synthetic ladder’s own start rung, not the real content’s', () => {
    const stub = emptyDoc(STUB)
    for (const pattern of PATTERNS) {
      expect(stub.ladders[pattern].rungIndex, pattern).toBe(STUB[pattern].startRungIndex)
    }
  })

  it('has no history, no sessions, and has not asked about persistence yet', () => {
    expect(fresh.history).toEqual([])
    expect(fresh.sessionsCompleted).toBe(0)
    expect(fresh.cyclePosition).toBe(0)
    expect(fresh.settings.persistGranted).toBeNull()
    expect(fresh.settings.sync).toBeNull()
  })

  it('is itself a valid document', () => {
    expect(parse(serialise(fresh), { ladders: LADDERS }).ok).toBe(true)
  })
})

// ─── migrate ────────────────────────────────────────────────────────────────

/**
 * The migration path built in brief 05 and empty until now, exercised for real.
 *
 * A v1 document is a v2 document plus an `effort` string on every exercise. The
 * whole point of the design was that this could land without a second validator,
 * so these tests check both halves: the field goes away, and *nothing else does*.
 */
describe('migrate', () => {
  it('is the identity for the current version', () => {
    const raw = mutableDoc()
    const result = migrate(raw, CURRENT_SCHEMA_VERSION)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe(raw)
  })

  it('refuses a version it has no path from, rather than guessing', () => {
    const result = migrate(mutableDoc(), 0)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('no migration from version 0')
  })

  it('strips effort from every exercise of a v1 document', () => {
    const v1 = asV1(midProgram)
    const result = migrate(v1, 1)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')

    const history = result.value['history'] as Record<string, unknown>[]
    const exercises = history.flatMap((s) => s['exercises'] as Record<string, unknown>[])
    expect(exercises.length).toBeGreaterThan(20)
    for (const exercise of exercises) {
      expect('effort' in exercise, 'effort survived the migration').toBe(false)
      // And the fields that carry the actual training record are untouched.
      expect(Object.keys(exercise).sort()).toEqual(['pattern', 'rungId', 'sets'])
    }
  })

  it('does not mutate the document it was handed', () => {
    // `parse` hands `migrate` its own freshly-parsed tree, but a migration that
    // mutated in place would be a trap for any other caller.
    const v1 = asV1(midProgram)
    const firstExercise = (
      (v1['history'] as Record<string, unknown>[])[0]!['exercises'] as Record<string, unknown>[]
    )[0]!
    migrate(v1, 1)
    expect('effort' in firstExercise).toBe(true)
  })

  it('leaves a malformed history to the validator rather than throwing on it', () => {
    // Migration runs before validation, on unvalidated input. Anything not shaped
    // the way v1 promised must pass straight through.
    for (const history of [undefined, null, 42, 'nope', {}, [null], [{ exercises: 7 }], [[]]]) {
      const result = migrate({ schemaVersion: 1, history }, 1)
      expect(result.ok, JSON.stringify(history)).toBe(true)
    }
  })
})

describe('a v1 document round-trips as v2', () => {
  // The acceptance test for the whole migration path: a real v1 file — nine
  // sessions of history with an effort rating on every exercise — loads, and what
  // comes back out is a valid v2 document that serialises cleanly.
  const v1Text = JSON.stringify(asV1(midProgram), null, 2)

  it('loads without complaint', () => {
    const doc = expectAccepted(v1Text, LADDERS)
    expect(doc.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
  })

  it('produces exactly the v2 document, with the effort ratings dropped', () => {
    expect(expectAccepted(v1Text, LADDERS)).toEqual(midProgram)
  })

  it('re-serialises as v2, so the next save is a clean v2 file', () => {
    const reserialised = serialise(expectAccepted(v1Text, LADDERS))
    expect(reserialised).toBe(serialise(midProgram))
    expect(reserialised).toContain('"schemaVersion": 2')
    expect(reserialised).not.toContain('effort')
    // And the v2 text loads again, so the migration is genuinely idempotent
    // rather than only surviving one pass.
    expect(expectAccepted(reserialised, LADDERS)).toEqual(midProgram)
  })

  it('keeps the cardio sessions a v1 file could not have contained', () => {
    // v1's cycle had three positions and no cardio day, so `day: "D"` is new in
    // v2. The migration does not have to add anything for it — but a v1 file that
    // somehow has one must still load, because refusing would cost real history.
    const doc = expectAccepted(v1Text, LADDERS)
    expect(doc.history.filter((s) => s.day === 'D')).toHaveLength(6)
  })

  it('refuses a v1 document that is broken for reasons other than its version', () => {
    // Migration must not become a repair tool. A v1 file with a bad ladder is
    // still a bad file.
    const broken = asV1(midProgram)
    ;(broken['ladders'] as Record<string, Record<string, unknown>>)['push']!['rungIndex'] = 'three'
    expectRejected(JSON.stringify(broken), 'ladders.push.rungIndex')
  })
})

// ─── summarise ──────────────────────────────────────────────────────────────

describe('summarise', () => {
  it('reports the facts needed to confirm a destructive import', () => {
    const summary = summarise(midProgram)
    expect(summary.sessionsCompleted).toBe(midProgram.sessionsCompleted)
    expect(summary.historyLength).toBe(midProgram.history.length)
    expect(summary.lastSessionAt).toBe(midProgram.history.at(-1)?.completedAt)

    // Derived from the fixture rather than restated. The earlier version
    // hardcoded these numbers, so repairing the fixture broke a test that was
    // really only asserting the fixture's own contents back to itself — what
    // matters here is that `summarise` reports ladder state in PATTERNS order.
    expect(summary.rungs).toEqual(
      PATTERNS.map((pattern) => ({
        pattern,
        rungIndex: midProgram.ladders[pattern].rungIndex,
        target: midProgram.ladders[pattern].target,
      })),
    )
  })

  it('handles a fresh document', () => {
    const summary = summarise(emptyDoc(LADDERS))
    expect(summary.sessionsCompleted).toBe(0)
    expect(summary.lastSessionAt).toBeNull()
    expect(summary.rungs).toHaveLength(PATTERNS.length)
  })
})
