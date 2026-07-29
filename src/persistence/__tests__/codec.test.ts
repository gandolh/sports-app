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
 *
 * Two things are new in v3 and get their own sections at the bottom:
 *
 *   1. **The v2 → v3 migration**, which is the first one to drop a required
 *      field. The v2 fixture is built here rather than imported, because the
 *      shape it describes no longer exists anywhere in `src/`.
 *   2. **The service's own shallow check**, imported from `server/` and run over
 *      this codec's output. Nothing else in the tree proves that what `serialise`
 *      writes is something `PUT /api/state` will accept, and a client that saves
 *      documents the service refuses would look fine until the day someone
 *      needed the backup.
 */
import { describe, expect, it } from 'vitest'
import type { Pattern, StateDoc } from '../../domain/types.ts'
import { CURRENT_SCHEMA_VERSION, PATTERNS } from '../../domain/types.ts'
import { midProgram } from '../../domain/__tests__/fixtures.ts'
import {
  LEGACY_USERNAME,
  USERNAME_MAX_LENGTH,
  USERNAME_PATTERN,
  emptyDoc,
  isValidUsername,
  migrate,
  parse,
  serialise,
  summarise,
} from '../codec.ts'
import type { JsonObject, ParseResult } from '../codec.ts'
// The state service is deliberately zero-dependency plain `.mjs`, outside
// `tsconfig.json`'s `include` and outside the bundle — so it has no types and
// cannot be imported without this. Importing the *real* thing is the entire point
// of the contract tests at the bottom of this file: a restated copy of the check
// would prove only that the copy agrees with itself.
// @ts-expect-error untyped .mjs, imported on purpose
import { checkDocument } from '../../../server/state-server.mjs'
// Kept on one line each: `@ts-expect-error` suppresses the line that *reports*
// the error, which for an untyped module is the specifier, not the `import {`.
// @ts-expect-error untyped .mjs, imported on purpose
import { LEGACY_USERNAME as SERVER_LEGACY_USERNAME, USERNAME_PATTERN as SERVER_USERNAME_PATTERN } from '../../../server/db.mjs'

// ─── Helpers ────────────────────────────────────────────────────────────────

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
    result = parse(text)
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

function expectAccepted(text: string, username?: string): StateDoc {
  const result = username === undefined ? parse(text) : parse(text, { username })
  if (!result.ok) throw new Error(`expected a valid document, got: ${result.error}`)
  return result.doc
}

function sessionAt(doc: Record<string, unknown>, index: number): Record<string, unknown> {
  return (doc['history'] as Record<string, unknown>[])[index] as Record<string, unknown>
}

function exerciseAt(
  doc: Record<string, unknown>,
  session: number,
  index: number,
): Record<string, unknown> {
  return (sessionAt(doc, session)['exercises'] as Record<string, unknown>[])[
    index
  ] as Record<string, unknown>
}

// ─── Round trip ─────────────────────────────────────────────────────────────

describe('round trip on the mid-program fixture', () => {
  it('serialises and parses back to a deeply equal document', () => {
    expect(expectAccepted(serialise(midProgram))).toEqual(midProgram)
  })

  it('is stable: re-serialising a parsed document produces identical text', () => {
    const first = serialise(midProgram)
    const second = serialise(expectAccepted(first))
    expect(second).toBe(first)
  })

  it('key order does not depend on how the object was built', () => {
    // Same data, opposite insertion order. `serialise` must not care.
    const reordered = {
      settings: midProgram.settings,
      history: midProgram.history,
      sessionsDone: {
        pull: midProgram.sessionsDone.pull,
        core: midProgram.sessionsDone.core,
        hinge: midProgram.sessionsDone.hinge,
        squat: midProgram.sessionsDone.squat,
        push: midProgram.sessionsDone.push,
      },
      cyclePosition: midProgram.cyclePosition,
      username: midProgram.username,
      schemaVersion: midProgram.schemaVersion,
    } as StateDoc
    expect(serialise(reordered)).toBe(serialise(midProgram))
  })

  it('round-trips an empty document', () => {
    const fresh = emptyDoc('alice')
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
    // `sessionsDone` is the state; history is a list a user may trim. The two are
    // deliberately not required to agree, so pruning must not invalidate the file.
    const pruned: StateDoc = { ...midProgram, history: midProgram.history.slice(-1) }
    const doc = expectAccepted(serialise(pruned))
    expect(doc.sessionsDone).toEqual(midProgram.sessionsDone)
    expect(doc.history).toHaveLength(1)
  })

  it('round-trips a counter far past the top of its ladder', () => {
    // The top rung cycles forever, so a four-figure counter is a fact rather than
    // a typo and there is deliberately no upper bound to trip over.
    const veteran: StateDoc = {
      ...midProgram,
      sessionsDone: { ...midProgram.sessionsDone, core: 4000 },
    }
    expect(expectAccepted(serialise(veteran)).sessionsDone.core).toBe(4000)
  })
})

// ─── Serialised form is human-readable ──────────────────────────────────────

describe('serialised form', () => {
  const text = serialise(midProgram)

  it('is valid JSON and ends with a newline', () => {
    expect(() => JSON.parse(text)).not.toThrow()
    expect(text.endsWith('\n')).toBe(true)
  })

  it('leads with who and where, and puts history last', () => {
    const lines = text.split('\n')
    expect(lines[1]).toContain('"schemaVersion"')
    expect(lines[2]).toContain('"username"')
    expect(lines[3]).toContain('"cyclePosition"')
    expect(text.indexOf('"history"')).toBeGreaterThan(text.indexOf('"sessionsDone"'))
    expect(text.indexOf('"history"')).toBeGreaterThan(text.indexOf('"settings"'))
  })

  it('puts the whole of the mutable state on one line', () => {
    // Five integers, in PATTERNS order, visible at a glance. This is the line a
    // person edits when the schedule has them on the wrong rung.
    expect(text).toContain(
      '"sessionsDone": { "push": 30, "squat": 31, "hinge": 29, "core": 90, "pull": 90 },',
    )
  })

  it('keeps each exercise record on one line, so history stays scannable', () => {
    expect(text).toContain(
      '{ "pattern": "push", "rungId": "push-05-full-3s-down", "sets": 3, "targetValue": 8 }',
    )
  })

  it('carries none of the fields v3 deleted', () => {
    for (const gone of [
      'effort',
      'actualValue',
      'ladders',
      'rungIndex',
      'cleanAtMax',
      'missedStreak',
      'sessionsCompleted',
      'soundEnabled',
      'voiceEnabled',
      'skipWarmupByDefault',
      '"day"',
    ]) {
      expect(text, gone).not.toContain(gone)
    }
  })

  it('is small enough that localStorage is not a constraint', () => {
    // Five years of daily training is ~1800 sessions.
    const perSession = text.length / midProgram.history.length
    expect(perSession * 1800).toBeLessThan(1_000_000)
  })
})

// ─── Malformed input: never throws, never yields a document ─────────────────

describe('parse rejects malformed input', () => {
  it('non-string input', () => {
    expectRejected(undefined, 'expected the document as text')
    expectRejected(null, 'expected the document as text')
    expectRejected(42, 'expected the document as text')
    expectRejected({ schemaVersion: 3 }, 'expected the document as text')
  })

  it('empty or whitespace-only text', () => {
    expectRejected('', 'empty')
    expectRejected('   \n  ', 'empty')
  })

  it('a truncated file', () => {
    expectRejected(serialise(midProgram).slice(0, 200), 'not valid JSON')
  })

  it('a stray trailing comma, the classic hand-edit slip', () => {
    expectRejected('{ "schemaVersion": 3, }', 'not valid JSON')
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
    expectRejected(corrupt((d) => (d['schemaVersion'] = 2.5)), 'schemaVersion')
    expectRejected(corrupt((d) => (d['schemaVersion'] = '3')), 'schemaVersion', '"3"')
  })

  it('a document from a newer build, without misreading it', () => {
    // v4 does not exist. It must be refused, never coerced down to v3 — a field
    // v4 renamed would otherwise be read as the v3 field of the same name.
    const error = expectRejected(
      corrupt((d) => (d['schemaVersion'] = 4)),
      'newer version of the app',
    )
    expect(error).toContain('update the app')
    expect(error).toContain('version 4')
  })

  it('a missing or misspelled username', () => {
    expectRejected(corrupt((d) => delete d['username']), 'username', 'missing')
    expectRejected(corrupt((d) => (d['username'] = 'Alice')), 'username', 'lowercase')
    expectRejected(corrupt((d) => (d['username'] = '')), 'username')
    expectRejected(corrupt((d) => (d['username'] = 'a'.repeat(USERNAME_MAX_LENGTH + 1))), 'username')
    expectRejected(corrupt((d) => (d['username'] = 42)), 'username', 'expected a string')
  })

  it('a missing counter', () => {
    expectRejected(
      corrupt((d) => delete (d['sessionsDone'] as Record<string, unknown>)['hinge']),
      'sessionsDone.hinge',
      'missing',
    )
  })

  it('sessionsDone that is not an object', () => {
    expectRejected(corrupt((d) => (d['sessionsDone'] = [])), 'sessionsDone', 'expected an object')
    expectRejected(corrupt((d) => delete d['sessionsDone']), 'sessionsDone', 'missing')
  })

  it('a negative or fractional counter', () => {
    expectRejected(
      corrupt((d) => ((d['sessionsDone'] as Record<string, unknown>)['push'] = -1)),
      'sessionsDone.push',
      '>= 0',
    )
    expectRejected(
      corrupt((d) => ((d['sessionsDone'] as Record<string, unknown>)['core'] = 2.5)),
      'sessionsDone.core',
      'whole number',
    )
    expectRejected(
      corrupt((d) => ((d['sessionsDone'] as Record<string, unknown>)['pull'] = null)),
      'sessionsDone.pull',
    )
  })

  it('an unknown key inside sessionsDone', () => {
    expectRejected(
      corrupt((d) => ((d['sessionsDone'] as Record<string, unknown>)['pushup'] = 2)),
      'sessionsDone.pushup',
      'unknown field',
    )
  })

  it('history that is not an array', () => {
    expectRejected(corrupt((d) => (d['history'] = {})), 'history', 'expected an array')
    expectRejected(corrupt((d) => delete d['history']), 'history', 'missing')
  })

  it('a history entry that is not an object', () => {
    expectRejected(
      corrupt((d) => ((d['history'] as unknown[])[1] = 'a session')),
      'history[1]',
      'expected an object',
    )
  })

  it('a bad variant', () => {
    expectRejected(
      corrupt((d) => (sessionAt(d, 1)['variant'] = 'brutal')),
      'history[1].variant',
      '"easy", "medium" or "hard"',
    )
    expectRejected(corrupt((d) => delete sessionAt(d, 1)['variant']), 'history[1].variant')
  })

  it('a bad position', () => {
    expectRejected(
      corrupt((d) => (sessionAt(d, 0)['position'] = -1)),
      'history[0].position',
      '>= 0',
    )
    expectRejected(
      corrupt((d) => (sessionAt(d, 0)['position'] = 'A')),
      'history[0].position',
      'whole number',
    )
  })

  it('a completedAt that is not an ISO instant', () => {
    expectRejected(
      corrupt((d) => (sessionAt(d, 0)['completedAt'] = 'last tuesday')),
      'history[0].completedAt',
      'ISO-8601',
    )
    expectRejected(
      corrupt((d) => (sessionAt(d, 0)['completedAt'] = '2026-13-45T99:00:00.000Z')),
      'history[0].completedAt',
    )
  })

  it('a bad pattern or rungId inside an exercise', () => {
    expectRejected(
      corrupt((d) => (exerciseAt(d, 0, 0)['pattern'] = 'bench')),
      'history[0].exercises[0].pattern',
      'push, squat, hinge, core, pull',
    )
    expectRejected(
      corrupt((d) => (exerciseAt(d, 0, 0)['rungId'] = 'pushup-3')),
      'history[0].exercises[0].rungId',
      'push-04-full',
    )
    expectRejected(
      corrupt((d) => (exerciseAt(d, 0, 0)['rungId'] = 'push-')),
      'history[0].exercises[0].rungId',
    )
  })

  it('a v2 set array left in place of a set count', () => {
    // The shape v2 wrote. It is not silently accepted and not silently collapsed:
    // only `migrate` collapses, and only for a document that says it is v2.
    expectRejected(
      corrupt(
        (d) =>
          (exerciseAt(d, 0, 0)['sets'] = [
            { targetValue: 8, actualValue: 8 },
            { targetValue: 8, actualValue: 7 },
          ]),
      ),
      'history[0].exercises[0].sets',
      'whole number',
    )
  })

  it('an exercise recorded as zero sets', () => {
    expectRejected(
      corrupt((d) => (exerciseAt(d, 0, 0)['sets'] = 0)),
      'history[0].exercises[0].sets',
      '>= 1',
    )
  })

  it('a missing or non-numeric targetValue', () => {
    expectRejected(
      corrupt((d) => delete exerciseAt(d, 0, 1)['targetValue']),
      'history[0].exercises[1].targetValue',
      'missing',
    )
    expectRejected(
      corrupt((d) => (exerciseAt(d, 0, 1)['targetValue'] = 'eight')),
      'history[0].exercises[1].targetValue',
      'expected a number',
    )
  })

  it('an effort field hand-typed into a v3 document', () => {
    // Migration strips it from a v1 document; a document already claiming v3 has
    // no excuse, and the field is reported as the unknown key it is rather than
    // silently dropped.
    expectRejected(
      corrupt((d) => (exerciseAt(d, 0, 0)['effort'] = 'hard')),
      'history[0].exercises[0].effort',
      'unknown field',
    )
  })

  it('every settings field, when missing or mistyped', () => {
    const settings = (d: Record<string, unknown>): Record<string, unknown> =>
      d['settings'] as Record<string, unknown>

    expectRejected(
      corrupt((d) => (settings(d)['persistGranted'] = 'granted')),
      'settings.persistGranted',
      'not requested yet',
    )
    expectRejected(corrupt((d) => delete settings(d)['persistGranted']), 'settings.persistGranted')
    expectRejected(corrupt((d) => delete settings(d)['sync']), 'settings.sync', 'missing')
    expectRejected(corrupt((d) => delete d['settings']), 'settings', 'missing')
  })

  it('a v2 settings field left behind', () => {
    // Audio and the guided warmup are out of v3 scope. A v2 *document* is
    // migrated; a v3 document with `soundEnabled` in it is a hand-edit.
    expectRejected(
      corrupt((d) => ((d['settings'] as Record<string, unknown>)['soundEnabled'] = true)),
      'settings.soundEnabled',
      'unknown field',
    )
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

  it('a negative or fractional cyclePosition', () => {
    expectRejected(corrupt((d) => (d['cyclePosition'] = -1)), 'cyclePosition')
    expectRejected(corrupt((d) => (d['cyclePosition'] = 1.5)), 'cyclePosition', 'whole number')
  })

  it('a misspelled top-level key, and says what it probably meant', () => {
    const error = expectRejected(
      corrupt((d) => {
        d['sessionsdone'] = d['sessionsDone']
        delete d['sessionsDone']
      }),
      'sessionsdone',
      'did you mean "sessionsDone"',
    )
    // And still reports the field that is now missing.
    expect(error).toContain('sessionsDone: expected an object')
  })

  it('an unrecognised top-level key', () => {
    expectRejected(corrupt((d) => (d['streak'] = 12)), 'streak', 'unknown field')
  })

  it('reports several problems at once, because a hand-edit rarely breaks one thing', () => {
    const error = expectRejected(
      corrupt((d) => {
        d['cyclePosition'] = null
        d['username'] = 'NOPE'
        ;(d['sessionsDone'] as Record<string, unknown>)['squat'] = 'nine'
      }),
      'problems in the state document',
    )
    expect(error).toContain('cyclePosition')
    expect(error).toContain('username')
    expect(error).toContain('sessionsDone.squat')
  })
})

// ─── Deliberate leniency ────────────────────────────────────────────────────

describe('parse is lenient exactly where it should be', () => {
  it('allows a hand-written note under an underscore key, and drops it', () => {
    const doc = expectAccepted(
      corrupt((d) => {
        d['_note'] = 'bumped push by hand on 2026-07-20'
      }),
    )
    expect(doc).toEqual(midProgram)
    expect(serialise(doc)).not.toContain('_note')
  })

  it('accepts a rungId from an older content revision', () => {
    // Rung ids are immutable so history can reference them forever. Validating
    // them against current content would reject a legitimately old document.
    const doc = expectAccepted(
      corrupt((d) => (exerciseAt(d, 0, 0)['rungId'] = 'push-99-retired-variant')),
    )
    expect(doc.history[0]?.exercises[0]?.rungId).toBe('push-99-retired-variant')
  })

  it('accepts an empty history', () => {
    expect(expectAccepted(corrupt((d) => (d['history'] = []))).history).toEqual([])
  })

  it('accepts a session with no exercises, which is what a hand-pruned cardio day looks like', () => {
    const doc = expectAccepted(corrupt((d) => (sessionAt(d, 2)['exercises'] = [])))
    expect(doc.history[2]?.exercises).toEqual([])
  })

  it('accepts a target above any ladder maximum', () => {
    // "I can actually do 20 of these" is a legitimate record of what was
    // prescribed; history is not re-derived, so nothing downstream disagrees.
    const doc = expectAccepted(corrupt((d) => (exerciseAt(d, 0, 0)['targetValue'] = 200)))
    expect(doc.history[0]?.exercises[0]?.targetValue).toBe(200)
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
        result = parse(prefix)
      }).not.toThrow()
      // Any proper prefix is an incomplete document. (The one exception is a
      // prefix that only drops the trailing newline, which is still valid JSON.)
      if (prefix.trim() !== full.trim()) expect(result?.ok).toBe(false)
    }
    expect(parse(full).ok).toBe(true)
  })

  it('on hostile and degenerate input', () => {
    const inputs: unknown[] = [
      '{}',
      '{"schemaVersion":3}',
      '[[[[[[[[[[]]]]]]]]]]',
      '{"schemaVersion":3,"sessionsDone":{"push":{"push":1}}}',
      '{"__proto__":{"polluted":true},"schemaVersion":3}',
      '{"schemaVersion":2,"history":[[[]]]}',
      ' ',
      Number.NaN,
      Symbol('nope'),
      () => 'not text',
      new Map(),
      Object.create(null),
    ]
    for (const input of inputs) {
      expect(() => parse(input)).not.toThrow()
      expect(parse(input).ok).toBe(false)
    }
    // Prototype pollution via a "__proto__" key must not have happened either.
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined()
  })
})

// ─── emptyDoc ───────────────────────────────────────────────────────────────

describe('emptyDoc', () => {
  const fresh = emptyDoc('alice')

  it('starts every counter at zero, which is the whole of a fresh document', () => {
    for (const pattern of PATTERNS) {
      expect(fresh.sessionsDone[pattern], pattern).toBe(0)
    }
    expect(fresh.history).toEqual([])
    expect(fresh.cyclePosition).toBe(0)
  })

  it('belongs to the username it was asked for', () => {
    expect(fresh.username).toBe('alice')
    expect(emptyDoc('bob').username).toBe('bob')
  })

  it('has not asked about persistence yet, and has no sync configured', () => {
    expect(fresh.settings.persistGranted).toBeNull()
    expect(fresh.settings.sync).toBeNull()
  })

  it('is itself a valid document', () => {
    expect(parse(serialise(fresh)).ok).toBe(true)
  })
})

// ─── The v2 fixture ─────────────────────────────────────────────────────────

/**
 * A realistic v2 document, built here because the shape it describes no longer
 * exists anywhere in `src/` — v3 deleted `LadderState`, `SetResult` and the
 * seven-position cycle, so there is nothing left to construct it from and the
 * fixture it used to be built from (`midProgramHistory`) is gone.
 *
 * Chosen so the migration has something to get wrong:
 *
 *   - **The five patterns appear a different number of times** (push 3, squat 3,
 *     hinge 2, core 9, pull 9), so a reconstruction that counted *sessions*
 *     rather than appearances-per-pattern, or that copied one pattern's count
 *     into all five, fails rather than passing by coincidence. The legs day at
 *     index 4 records squat and no hinge, which is what a session someone
 *     abandoned half way looks like.
 *   - **Set counts vary** (3 on the rotating patterns, 2 on the daily block, and
 *     a 2-set hinge on the last legs day), so `sets: 3` cannot be assumed.
 *   - **`actualValue` differs from `targetValue`** on the last set of every
 *     exercise, so a migration that folded the achieved number into `targetValue`
 *     is visible.
 *   - **`ladders` disagrees with the history it sits next to**: the rung indices
 *     are higher than nine sessions could have earned. That is the whole point —
 *     a v2 rung index was reached by adaptive rules, and the migration must
 *     ignore it rather than carry it over.
 */
function v2Sets(count: number, target: number): Record<string, number>[] {
  return Array.from({ length: count }, (_, i) => ({
    targetValue: target,
    // The last set falls short. Nothing in v3 records this, and this fixture is
    // where that becomes provable rather than assumed.
    actualValue: i === count - 1 ? target - 1 : target,
  }))
}

function v2Exercise(
  pattern: Pattern,
  rungId: string,
  sets: number,
  target: number,
): Record<string, unknown> {
  return { pattern, rungId, sets: v2Sets(sets, target) }
}

const V2_DAILY_BLOCK = [
  v2Exercise('core', 'core-03-front-plank', 2, 35),
  v2Exercise('pull', 'pull-02-prone-t', 2, 22),
]

function v2Session(day: string, at: string, own: Record<string, unknown>[]): Record<string, unknown> {
  return { completedAt: at, day, exercises: [...own, ...V2_DAILY_BLOCK] }
}

const V2_HISTORY: Record<string, unknown>[] = [
  v2Session('A', '2026-06-01T07:05:00.000Z', [v2Exercise('push', 'push-04-full', 3, 7)]),
  v2Session('B', '2026-06-02T07:11:00.000Z', [
    v2Exercise('squat', 'squat-03-full', 3, 9),
    v2Exercise('hinge', 'hinge-03-single-leg-heel-near', 3, 6),
  ]),
  // A cardio day trains no ladder of its own; the daily block still records.
  v2Session('D', '2026-06-03T18:40:00.000Z', []),
  v2Session('A', '2026-06-04T07:02:00.000Z', [v2Exercise('push', 'push-04-full', 3, 8)]),
  // Abandoned half way: squat done, hinge never started.
  v2Session('B', '2026-06-05T07:20:00.000Z', [v2Exercise('squat', 'squat-03-full', 3, 10)]),
  v2Session('D', '2026-06-06T19:02:00.000Z', []),
  v2Session('A', '2026-06-07T07:00:00.000Z', [v2Exercise('push', 'push-04-full', 3, 8)]),
  v2Session('B', '2026-06-08T07:14:00.000Z', [
    v2Exercise('squat', 'squat-03-full', 3, 10),
    // Two sets, not three.
    v2Exercise('hinge', 'hinge-03-single-leg-heel-near', 2, 7),
  ]),
  v2Session('C', '2026-06-09T07:33:00.000Z', []),
]

function v2Doc(): JsonObject {
  return {
    schemaVersion: 2,
    sessionsCompleted: 9,
    cyclePosition: 4,
    ladders: {
      push: { rungIndex: 4, target: 8, cleanAtMax: 1, missedStreak: 0 },
      squat: { rungIndex: 3, target: 10, cleanAtMax: 2, missedStreak: 0 },
      hinge: { rungIndex: 3, target: 7, cleanAtMax: 0, missedStreak: 1 },
      core: { rungIndex: 2, target: 35, cleanAtMax: 0, missedStreak: 0 },
      pull: { rungIndex: 2, target: 22, cleanAtMax: 3, missedStreak: 0 },
    },
    settings: {
      soundEnabled: true,
      voiceEnabled: false,
      skipWarmupByDefault: true,
      persistGranted: true,
      sync: { baseUrl: 'http://127.0.0.1:8787', secret: 'shared' },
    },
    history: structuredClone(V2_HISTORY),
  }
}

/** The same document as v1: `schemaVersion: 1` and an `effort` on every exercise. */
function v1Doc(): JsonObject {
  const V1_EFFORTS = ['easy', 'ok', 'hard'] as const
  const raw = v2Doc() as Record<string, unknown>
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

/** Sessions in which `pattern` appears — the definition of `sessionsDone`. */
function appearances(pattern: Pattern): number {
  return V2_HISTORY.filter((session) =>
    (session['exercises'] as Record<string, unknown>[]).some((e) => e['pattern'] === pattern),
  ).length
}

// ─── migrate ────────────────────────────────────────────────────────────────

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

  it('does not mutate the document it was handed', () => {
    // `parse` hands `migrate` its own freshly-parsed tree, but a migration that
    // mutated in place would be a trap for any other caller.
    const raw = v2Doc() as Record<string, unknown>
    migrate(raw, 2)
    expect(raw['ladders']).toBeDefined()
    expect(raw['sessionsCompleted']).toBe(9)
    const first = (raw['history'] as Record<string, unknown>[])[0] as Record<string, unknown>
    expect(first['day']).toBe('A')
    expect(Array.isArray((first['exercises'] as Record<string, unknown>[])[0]?.['sets'])).toBe(true)
  })

  it('leaves a malformed history to the validator rather than throwing on it', () => {
    // Migration runs before validation, on unvalidated input. Anything not shaped
    // the way v2 promised must pass straight through.
    for (const history of [undefined, null, 42, 'nope', {}, [null], [{ exercises: 7 }], [[]]]) {
      for (const from of [1, 2]) {
        const result = migrate({ schemaVersion: from, history }, from)
        expect(result.ok, `${from}: ${JSON.stringify(history)}`).toBe(true)
      }
    }
  })

  it('counts a pattern recorded twice in one session once', () => {
    // A hand-edit can duplicate an exercise. `sessionsDone` counts sessions, and
    // the schedule divides it by sessionsPerRung, so double-counting would
    // advance a ladder for free.
    const result = migrate(
      {
        schemaVersion: 2,
        history: [
          {
            completedAt: '2026-06-01T07:05:00.000Z',
            day: 'A',
            exercises: [
              v2Exercise('push', 'push-04-full', 3, 7),
              v2Exercise('push', 'push-04-full', 3, 7),
            ],
          },
        ],
      },
      2,
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect((result.value['sessionsDone'] as Record<string, number>)['push']).toBe(1)
  })
})

describe('a v2 document migrates to v3', () => {
  const doc = expectAccepted(JSON.stringify(v2Doc(), null, 2), 'dana')

  it('reconstructs every counter from the history, not from the rung indices', () => {
    // The acceptance criterion, stated as the definition rather than as five
    // literals: `sessionsDone[p]` is the number of sessions `p` appears in.
    for (const pattern of PATTERNS) {
      expect(doc.sessionsDone[pattern], pattern).toBe(appearances(pattern))
    }
    // And concretely, so a bug in `appearances` cannot make this vacuous.
    expect(doc.sessionsDone).toEqual({ push: 3, squat: 3, hinge: 2, core: 9, pull: 9 })
  })

  it('ignores the v2 rung indices completely', () => {
    // The document said push was on rung 4 and core on rung 2. Those numbers were
    // produced by adaptive rules that no longer exist, so nothing about them may
    // survive — including into the counters, where they would be invisible.
    const serialised = serialise(doc)
    expect(serialised).not.toContain('rungIndex')
    expect(serialised).not.toContain('cleanAtMax')
    expect(serialised).not.toContain('missedStreak')
    // Rung 4 of push at 14 sessions per rung would have meant ~28 sessions.
    expect(doc.sessionsDone.push).toBe(3)
  })

  it('collapses each set array to its measured length', () => {
    const sets = doc.history.flatMap((session) =>
      session.exercises.map((e) => `${e.pattern}:${e.sets}`),
    )
    // Three on the rotating patterns, two on the daily block — and the two-set
    // hinge on the last legs day, which is why the length is measured.
    expect(sets).toContain('push:3')
    expect(sets).toContain('core:2')
    expect(sets).toContain('hinge:2')
    expect(sets).toContain('hinge:3')
    expect(new Set(doc.history.flatMap((s) => s.exercises.map((e) => e.sets)))).toEqual(
      new Set([2, 3]),
    )
  })

  it('keeps what was prescribed and discards what was achieved', () => {
    // Every v2 set carried the same target and the last one fell short of it, so
    // a targetValue of 7 on the first push session proves the prescribed number
    // survived and the achieved 6 did not.
    expect(doc.history[0]?.exercises[0]).toEqual({
      pattern: 'push',
      rungId: 'push-04-full',
      sets: 3,
      targetValue: 7,
    })
    expect(serialise(doc)).not.toContain('actualValue')
  })

  it('numbers historical sessions by their index in history, modulo the rotation', () => {
    // Not a mapping from the old day letters — there isn't one. The value is only
    // ever used to label a past session.
    expect(doc.history.map((s) => s.position)).toEqual([0, 1, 2, 0, 1, 2, 0, 1, 2])
  })

  it('defaults every historical session to the medium variant', () => {
    // v2 had no variant, and `medium` means "the schedule's own number" — which
    // is what v2 always prescribed.
    expect(doc.history.every((s) => s.variant === 'medium')).toBe(true)
  })

  it('takes the username from the caller, because a v2 document has none', () => {
    expect(doc.username).toBe('dana')
  })

  it('falls back to a documented constant when the caller does not say', () => {
    // Matches the service's own name for pre-username rows, so a client that
    // migrates offline and a database that migrated on the server agree.
    expect(expectAccepted(JSON.stringify(v2Doc())).username).toBe(LEGACY_USERNAME)
    expect(LEGACY_USERNAME).toBe('local')
  })

  it('drops the retired settings and keeps the rest', () => {
    expect(doc.settings).toEqual({
      persistGranted: true,
      sync: { baseUrl: 'http://127.0.0.1:8787', secret: 'shared' },
    })
  })

  it('carries cyclePosition over unchanged', () => {
    // A bare counter in both schemas: `slotAt` takes it modulo three and nothing
    // else reads it, so there is nothing to remap and nothing to invent.
    expect(doc.cyclePosition).toBe(4)
  })

  it('re-serialises as clean v3 that loads again', () => {
    const text = serialise(doc)
    expect(text).toContain('"schemaVersion": 3')
    expect(expectAccepted(text)).toEqual(doc)
  })

  it('refuses a v2 document that is broken for reasons other than its version', () => {
    // Migration must not become a repair tool. A v2 file with a broken timestamp
    // is still a broken file.
    const broken = v2Doc() as Record<string, unknown>
    ;(broken['history'] as Record<string, unknown>[])[3]!['completedAt'] = 'thursday'
    expectRejected(JSON.stringify(broken), 'history[3].completedAt')
  })
})

describe('a v1 document migrates all the way to v3 in one call', () => {
  it('composes both steps rather than needing a v1→v3 shortcut', () => {
    const v3 = expectAccepted(JSON.stringify(v1Doc(), null, 2), 'dana')
    // Identical to the v2 document's outcome: the effort ratings the first step
    // strips are the only difference between the two inputs.
    expect(v3).toEqual(expectAccepted(JSON.stringify(v2Doc(), null, 2), 'dana'))
    expect(serialise(v3)).not.toContain('effort')
  })

  it('runs one step at a time, so each step only knows its own version', () => {
    const once = migrate(v1Doc(), 1)
    expect(once.ok).toBe(true)
    if (!once.ok) throw new Error('unreachable')
    // The v1 step ran (no effort survives) and so did the v2 step (no ladders).
    expect(JSON.stringify(once.value)).not.toContain('effort')
    expect(once.value['ladders']).toBeUndefined()
    expect(once.value['sessionsDone']).toBeDefined()
  })
})

// ─── summarise ──────────────────────────────────────────────────────────────

describe('summarise', () => {
  it('reports the facts needed to confirm a destructive import', () => {
    const summary = summarise(midProgram)
    expect(summary.username).toBe(midProgram.username)
    expect(summary.cyclePosition).toBe(midProgram.cyclePosition)
    expect(summary.historyLength).toBe(midProgram.history.length)
    expect(summary.lastSessionAt).toBe(midProgram.history.at(-1)?.completedAt)
    // Derived from the fixture rather than restated, so repairing the fixture
    // cannot break a test that is really only asserting the fixture back to
    // itself. What matters is that the counters are reported in PATTERNS order.
    expect(summary.sessionsDone).toEqual(
      PATTERNS.map((pattern) => ({ pattern, sessions: midProgram.sessionsDone[pattern] })),
    )
  })

  it('handles a fresh document', () => {
    const summary = summarise(emptyDoc('alice'))
    expect(summary.historyLength).toBe(0)
    expect(summary.lastSessionAt).toBeNull()
    expect(summary.sessionsDone.every((entry) => entry.sessions === 0)).toBe(true)
  })
})

// ─── The service's contract ─────────────────────────────────────────────────

/**
 * The gap brief 17 left on purpose: its own tests import nothing from `src/`
 * (deliberately — the service is version-agnostic and must not be coupled to the
 * bundle), so **nothing proved that a document this codec serialises is a document
 * `PUT /api/state` accepts.** That test belongs here, on the client side of the
 * contract, and it runs the real `checkDocument` rather than a restatement of it.
 */
describe('the sync service accepts what serialise writes', () => {
  it('passes the shallow check, with the fields the receipt is built from', () => {
    expect(checkDocument(serialise(midProgram))).toEqual({
      ok: true,
      schemaVersion: 3,
      username: midProgram.username,
      historyLength: midProgram.history.length,
    })
  })

  it('passes for a fresh document and for a migrated v2 one', () => {
    expect(checkDocument(serialise(emptyDoc('alice')))).toMatchObject({
      ok: true,
      username: 'alice',
      historyLength: 0,
    })
    const migrated = expectAccepted(JSON.stringify(v2Doc()), 'dana')
    expect(checkDocument(serialise(migrated))).toMatchObject({
      ok: true,
      schemaVersion: 3,
      username: 'dana',
      historyLength: 9,
    })
  })

  it('uses the same username rule the service enforces, character for character', () => {
    // Restated in `codec.ts` rather than imported, because the service is
    // zero-dependency `.mjs` and importing it would drag `node:sqlite` into a
    // browser build. This is the test that stops the two copies drifting.
    expect(USERNAME_PATTERN.source).toBe(SERVER_USERNAME_PATTERN.source)
    expect(USERNAME_PATTERN.flags).toBe(SERVER_USERNAME_PATTERN.flags)
    expect(LEGACY_USERNAME).toBe(SERVER_LEGACY_USERNAME)
  })

  it('agrees with the service about which usernames are legal', () => {
    const cases = [
      'alice',
      'a',
      '0',
      'a.b-c_d',
      'local',
      'a'.repeat(USERNAME_MAX_LENGTH),
      // …and the ones both must refuse.
      '',
      'Alice',
      '.hidden',
      '-dash',
      '_score',
      'a b',
      'a/b',
      'a'.repeat(USERNAME_MAX_LENGTH + 1),
      'düsseldorf',
    ]
    for (const candidate of cases) {
      const doc = serialise({ ...emptyDoc('placeholder'), username: candidate })
      const serverSaysOk = (checkDocument(doc) as { ok: boolean }).ok
      expect(isValidUsername(candidate), candidate).toBe(serverSaysOk)
      expect(parse(doc).ok, candidate).toBe(serverSaysOk)
    }
  })
})
