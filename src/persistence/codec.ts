/**
 * The state document codec: text ⇄ `StateDoc`.
 *
 * ── Why this file is careful out of proportion to its size ───────────────────
 *
 * The document this codec reads and writes is *both* the app's source of truth
 * *and* its backup format (corpus/wiki/decisions.md). There is one copy, it
 * lives in browser storage, and the progression engine is a pure function of
 * it — so losing it does not degrade the experience, it silently resets every
 * ladder to rung 1 and discards months of training. Every rule below exists to
 * make a wrong document *loud* instead of *quiet*.
 *
 * ── Two hard guarantees ─────────────────────────────────────────────────────
 *
 *   1. `parse` NEVER throws. It returns a result. A human is expected to open
 *      this file in a text editor and fix a wrong rung at 2am, so a bad
 *      hand-edit is an ordinary input, not an exceptional one.
 *   2. `parse` NEVER returns a partially-valid document. There is no silent
 *      repair, no coercion, no filling in of defaults. A half-understood
 *      document that the app then *saves back* is how a hand-edit typo becomes
 *      permanent data loss. Either the whole thing is understood, or the caller
 *      gets an error and the stored text is left exactly as it was.
 *
 * ── Strict, including on `settings` ─────────────────────────────────────────
 *
 * It is tempting to default missing `settings` fields, since a sound toggle
 * carries nothing irreplaceable. We don't. Both failure modes here are
 * recoverable (read-only mode with a precise message vs. a silently reset
 * toggle), and one consistent rule — "every declared field must be present and
 * well-typed" — produces better error messages than a rule with exceptions.
 *
 * ── What is deliberately NOT validated ──────────────────────────────────────
 *
 *   - **`rungId`s in `history` are not checked against the ladder content.**
 *     Rung ids are immutable once shipped precisely because history references
 *     them; a document may legitimately contain a rung id from an older content
 *     revision. Only the `<pattern>-` prefix is checked.
 *   - **`sessionsCompleted` is not required to equal `history.length`.**
 *     It looks like an invariant and isn't: the counter is monotonic and never
 *     resets, while history is a list a user may prune by hand.
 *   - **`target` is not range-checked against the ladder's min/max.** "I can
 *     actually do 20 of these" is a legitimate hand-edit, and the engine
 *     converges from anywhere. Only `rungIndex` gets a bounds check, because an
 *     out-of-range rung index has no meaning at all.
 *   - **Extra keys beginning with `_`** are allowed and dropped, so a human can
 *     leave themselves a `"_note"` in a format that has no comments. Any other
 *     unrecognised key is an error, because it is nearly always a typo of a
 *     real one.
 *
 * ── Serialisation is a feature, not a formality ─────────────────────────────
 *
 * `serialise` is hand-rolled rather than `JSON.stringify(doc, null, 2)` because
 * the output is read by a person: key order is fixed and meaningful (the
 * summary first, the long history tail last), ladder states and set results sit
 * on one line each so history stays scannable, and blank lines separate the
 * top-level sections. All of that is still plain JSON — whitespace between
 * tokens is insignificant to any parser.
 */
import type {
  CycleDay,
  ExerciseResult,
  Ladder,
  LadderState,
  Pattern,
  RungId,
  SessionResult,
  SetResult,
  Settings,
  StateDoc,
  SyncSettings,
} from '../domain/types.ts'
import {
  CURRENT_SCHEMA_VERSION,
  CYCLE_DAYS,
  PATTERNS,
  isCycleDay,
  isPattern,
} from '../domain/types.ts'

// ─── Public surface ─────────────────────────────────────────────────────────

export type ParseResult =
  | { readonly ok: true; readonly doc: StateDoc }
  | { readonly ok: false; readonly error: string }

/**
 * The ladder content, supplied by the caller rather than imported.
 *
 * `parse` needs it for exactly one check (is `rungIndex` in range?) and
 * `emptyDoc` needs it for exactly one thing (what is `targetMin`?). Passing it
 * in keeps the codec unit-testable against synthetic ladders and keeps the
 * content dependency at the edge — `store.ts` is the one place that names the
 * real `LADDERS`.
 */
export type LadderContent = Readonly<Record<Pattern, Ladder>>

export interface ParseOptions {
  /** Omit to validate structure only; `rungIndex` then gets no upper bound. */
  readonly ladders?: LadderContent
}

/** More than this many problems and the list stops being useful. */
const MAX_REPORTED_PROBLEMS = 20

/** Loose ISO-8601 instant check. Exactness is not the point; NaN dates are. */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/

const TOP_LEVEL_KEYS = [
  'schemaVersion',
  'sessionsCompleted',
  'cyclePosition',
  'ladders',
  'settings',
  'history',
] as const

const LADDER_STATE_KEYS = ['rungIndex', 'target', 'cleanAtMax', 'missedStreak'] as const

const SETTINGS_KEYS = [
  'soundEnabled',
  'voiceEnabled',
  'skipWarmupByDefault',
  'persistGranted',
  'sync',
] as const

const SYNC_KEYS = ['baseUrl', 'secret'] as const

const SESSION_KEYS = ['completedAt', 'day', 'exercises'] as const

/**
 * No `effort`. A v1 document has one on every exercise and the v1→v2 migration
 * strips it *before* validation runs, so by the time `checkKeys` sees an exercise
 * a surviving `effort` key is a hand-typed one and correctly reported as unknown.
 */
const EXERCISE_KEYS = ['pattern', 'rungId', 'sets'] as const

const SET_KEYS = ['targetValue', 'actualValue'] as const

// ─── emptyDoc ───────────────────────────────────────────────────────────────

/**
 * A fresh document: every ladder at its **starting rung** with the target at the
 * bottom of the range.
 *
 * Still no onboarding quiz — but calibration is no longer the fast-track, it is
 * descending (corpus/wiki/decisions.md, "No effort input anywhere"). So a
 * brand-new user starts *mid-ladder*, at a rung they plausibly can perform, and
 * three missed sessions walk them down if they cannot.
 *
 * This must agree with `engine.freshLadderStates()` — `store.emptyDoc()` is what
 * a real new user actually gets, and a codec that started them at rung 0 while
 * the engine's own fresh state started at `startRungIndex` would give the
 * simulation and the app two different first sessions.
 */
export function emptyDoc(ladders: LadderContent): StateDoc {
  const ladderStates = {} as Record<Pattern, LadderState>
  for (const pattern of PATTERNS) {
    const ladder = ladders[pattern]
    ladderStates[pattern] = {
      rungIndex: Math.min(ladder.startRungIndex, ladder.rungs.length - 1),
      target: ladder.targetMin,
      cleanAtMax: 0,
      missedStreak: 0,
    }
  }
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    sessionsCompleted: 0,
    cyclePosition: 0,
    ladders: ladderStates,
    history: [],
    settings: {
      soundEnabled: true,
      voiceEnabled: true,
      skipWarmupByDefault: false,
      // `null` means "not asked yet" — store.ts fills this in on first load.
      persistGranted: null,
      sync: null,
    },
  }
}

// ─── Migration ──────────────────────────────────────────────────────────────

export type MigrationResult =
  | { readonly ok: true; readonly value: JsonObject }
  | { readonly ok: false; readonly error: string }

/**
 * One step from version N to N+1, operating on an *unvalidated* plain object.
 *
 * Migration deliberately runs before validation. Validating first would require
 * keeping a validator for every schema version that ever shipped; this way
 * there is exactly one validator, for the current shape, and each migration
 * only has to know how its own version differed.
 */
type MigrationStep = (raw: JsonObject) => JsonObject

/**
 * v1 → v2: drop `ExerciseResult.effort`.
 *
 * The effort input was removed from the app entirely (corpus/wiki/decisions.md,
 * "No effort input anywhere"), so every v1 document carries a field the current
 * shape does not allow. **Dropping it is the whole migration** — the document is
 * otherwise valid v2, and the training history it holds is irreplaceable, so
 * rejecting it over a field nothing reads any more would be the worst possible
 * trade.
 *
 * Written defensively because it runs on *unvalidated* input: anything that is
 * not shaped the way v1 promised is passed through untouched, and the single
 * validator downstream reports it properly. A migration that threw on a
 * malformed history would turn a fixable hand-edit into a hard load failure.
 *
 * It also does not rewrite `schemaVersion`; `validateDoc` stamps the current
 * version on what it returns, so a migration that set it too would be the second
 * place that decides the same thing.
 */
function dropEffortFromExercises(raw: JsonObject): JsonObject {
  const history = raw['history']
  if (!Array.isArray(history)) return raw

  const migrated = history.map((session) => {
    if (!isPlainObject(session)) return session
    const exercises = session['exercises']
    if (!Array.isArray(exercises)) return session
    return {
      ...session,
      exercises: exercises.map((exercise) => {
        if (!isPlainObject(exercise)) return exercise
        if (!('effort' in exercise)) return exercise
        // Rebuilt without the key rather than deleted, because `exercise` is a
        // borrowed reference into the caller's parsed tree.
        const { effort: _dropped, ...rest } = exercise
        return rest
      }),
    }
  })

  return { ...raw, history: migrated }
}

/**
 * Indexed by the version being migrated *from*.
 *
 * This machinery existed and was empty from v1, on purpose. Retrofitting
 * migration onto a file that already holds six months of real training history is
 * a problem you only get to have once — and v2 arriving four briefs later, with
 * one line to register, is the payoff.
 */
const MIGRATIONS: ReadonlyMap<number, MigrationStep> = new Map([[1, dropEffortFromExercises]])

/** Applies every step from `fromVersion` up to the current one. Never throws. */
export function migrate(raw: JsonObject, fromVersion: number): MigrationResult {
  let current = raw
  let version = fromVersion

  while (version < CURRENT_SCHEMA_VERSION) {
    const step = MIGRATIONS.get(version)
    if (!step) {
      return {
        ok: false,
        error:
          `schemaVersion: no migration from version ${version} to ` +
          `${CURRENT_SCHEMA_VERSION}. This document was written by a build ` +
          `whose format this one no longer understands.`,
      }
    }
    try {
      current = step(current)
    } catch (cause) {
      return { ok: false, error: `schemaVersion: migration from version ${version} failed: ${messageOf(cause)}` }
    }
    version += 1
  }

  return { ok: true, value: current }
}

// ─── parse ──────────────────────────────────────────────────────────────────

/**
 * Read text into a `StateDoc`. Never throws; never returns a half-valid doc.
 *
 * The error string is written for a person looking at the file in an editor:
 * every problem is prefixed with the JSON path that has it.
 */
export function parse(text: unknown, options: ParseOptions = {}): ParseResult {
  if (typeof text !== 'string') {
    return { ok: false, error: `expected the document as text, got ${describe(text)}` }
  }
  if (text.trim() === '') {
    return { ok: false, error: 'the document is empty' }
  }

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (cause) {
    // The native message carries a character offset, which is the single most
    // useful thing to hand back after a bad hand-edit (a stray comma, usually).
    return { ok: false, error: `not valid JSON — ${messageOf(cause)}` }
  }

  if (!isPlainObject(raw)) {
    return {
      ok: false,
      error: `the document must be a JSON object, got ${describe(raw)}`,
    }
  }

  // schemaVersion is read before anything else: a document from a future build
  // must be refused rather than misread, and one from a past build must be
  // migrated before it is measured against the current shape.
  const version = raw['schemaVersion']
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return {
      ok: false,
      error:
        `schemaVersion: expected a whole number >= 1, got ${describe(version)}. ` +
        `Every state document carries a schemaVersion; a file without one is ` +
        `probably not a state document at all.`,
    }
  }
  if (version > CURRENT_SCHEMA_VERSION) {
    return {
      ok: false,
      error:
        `schemaVersion: this document is version ${version} but this build ` +
        `understands up to ${CURRENT_SCHEMA_VERSION}. It was written by a newer ` +
        `version of the app — update the app rather than editing the file down.`,
    }
  }

  const migrated = migrate(raw, version)
  if (!migrated.ok) return { ok: false, error: migrated.error }

  const ctx: Ctx = { problems: [], ladders: options.ladders }
  const doc = validateDoc(ctx, migrated.value)

  if (ctx.problems.length > 0 || !doc) {
    return { ok: false, error: formatProblems(ctx.problems) }
  }
  return { ok: true, doc }
}

// ─── serialise ──────────────────────────────────────────────────────────────

/**
 * Pretty-printed JSON with a fixed key order. Round-trips through `parse`.
 *
 * The order is chosen for a human opening the file: the four numbers that say
 * "where am I" come first, then settings, then the long history tail. Note that
 * this is deliberately *not* the declaration order in `types.ts` — `history`
 * moves last because it is the only unbounded section, and a file whose first
 * screen is `sessionsCompleted` and per-ladder rungs is one you can actually
 * fix something in.
 */
export function serialise(doc: StateDoc): string {
  const out: string[] = []

  out.push('{')
  out.push(`  ${key('schemaVersion')}${num(doc.schemaVersion)},`)
  out.push(`  ${key('sessionsCompleted')}${num(doc.sessionsCompleted)},`)
  out.push(`  ${key('cyclePosition')}${num(doc.cyclePosition)},`)
  out.push('')

  // PATTERNS, not Object.keys — key order must not depend on how the object
  // happened to be built.
  out.push(`  ${key('ladders')}{`)
  PATTERNS.forEach((pattern, i) => {
    const state = doc.ladders[pattern]
    const comma = i === PATTERNS.length - 1 ? '' : ','
    const fields = LADDER_STATE_KEYS.map((k) => `${key(k)}${num(state[k])}`).join(', ')
    out.push(`    ${key(pattern)}{ ${fields} }${comma}`)
  })
  out.push('  },')
  out.push('')

  out.push(`  ${key('settings')}{`)
  out.push(`    ${key('soundEnabled')}${bool(doc.settings.soundEnabled)},`)
  out.push(`    ${key('voiceEnabled')}${bool(doc.settings.voiceEnabled)},`)
  out.push(`    ${key('skipWarmupByDefault')}${bool(doc.settings.skipWarmupByDefault)},`)
  out.push(
    `    ${key('persistGranted')}${doc.settings.persistGranted === null ? 'null' : bool(doc.settings.persistGranted)},`,
  )
  const sync = doc.settings.sync
  if (sync === null) {
    out.push(`    ${key('sync')}null`)
  } else {
    out.push(`    ${key('sync')}{`)
    out.push(`      ${key('baseUrl')}${str(sync.baseUrl)},`)
    out.push(`      ${key('secret')}${str(sync.secret)}`)
    out.push('    }')
  }
  out.push('  },')
  out.push('')

  if (doc.history.length === 0) {
    out.push(`  ${key('history')}[]`)
  } else {
    out.push(`  ${key('history')}[`)
    doc.history.forEach((session, si) => {
      const sessionComma = si === doc.history.length - 1 ? '' : ','
      out.push('    {')
      out.push(`      ${key('completedAt')}${str(session.completedAt)},`)
      out.push(`      ${key('day')}${str(session.day)},`)
      if (session.exercises.length === 0) {
        out.push(`      ${key('exercises')}[]`)
      } else {
        out.push(`      ${key('exercises')}[`)
        session.exercises.forEach((exercise, ei) => {
          const exerciseComma = ei === session.exercises.length - 1 ? '' : ','
          out.push('        {')
          out.push(`          ${key('pattern')}${str(exercise.pattern)},`)
          out.push(`          ${key('rungId')}${str(exercise.rungId)},`)
          if (exercise.sets.length === 0) {
            out.push(`          ${key('sets')}[]`)
          } else {
            out.push(`          ${key('sets')}[`)
            exercise.sets.forEach((set, i) => {
              const comma = i === exercise.sets.length - 1 ? '' : ','
              const fields = SET_KEYS.map((k) => `${key(k)}${num(set[k])}`).join(', ')
              out.push(`            { ${fields} }${comma}`)
            })
            out.push('          ]')
          }
          out.push(`        }${exerciseComma}`)
        })
        out.push('      ]')
      }
      out.push(`    }${sessionComma}`)
    })
    out.push('  ]')
  }

  out.push('}')
  // Trailing newline: this file is opened in text editors, and editors that add
  // one on save would otherwise show a spurious diff.
  return out.join('\n') + '\n'
}

function key(name: string): string {
  return `${JSON.stringify(name)}: `
}

function str(value: string): string {
  return JSON.stringify(value)
}

function bool(value: boolean): string {
  return value ? 'true' : 'false'
}

/**
 * A non-finite number would silently become `null` here, which `parse` then
 * rejects as a non-number. That is intentional and is exactly what makes
 * `store.save`'s verify-before-promote step worth having: a doc containing a
 * `NaN` target never reaches the live key.
 */
function num(value: number): string {
  return JSON.stringify(value) ?? 'null'
}

// ─── Validation internals ───────────────────────────────────────────────────

export type JsonObject = { readonly [key: string]: unknown }

interface Ctx {
  readonly problems: string[]
  readonly ladders?: LadderContent | undefined
}

function bad(ctx: Ctx, path: string, message: string): void {
  if (ctx.problems.length < MAX_REPORTED_PROBLEMS) {
    ctx.problems.push(`${path}: ${message}`)
  }
}

function formatProblems(problems: readonly string[]): string {
  if (problems.length === 0) {
    // Defensive: validateDoc returning undefined without a recorded problem
    // would be a bug in this file, and a silent success would be much worse.
    return 'the document could not be read, but no specific problem was recorded'
  }
  if (problems.length === 1) return problems[0] ?? ''
  const shown = problems.map((p) => `  - ${p}`).join('\n')
  const overflow =
    problems.length >= MAX_REPORTED_PROBLEMS ? '\n  - (further problems not listed)' : ''
  return `${problems.length} problems in the state document:\n${shown}${overflow}`
}

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Human-readable rendering of an unexpected value, for error messages. */
function describe(value: unknown): string {
  if (value === undefined) return 'missing'
  if (value === null) return 'null'
  if (Array.isArray(value)) return `an array of ${value.length}`
  if (typeof value === 'object') return 'an object'
  if (typeof value === 'string') return JSON.stringify(truncate(value, 40))
  return String(value)
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/** Rejects any unrecognised key that does not start with `_`. */
function checkKeys(ctx: Ctx, path: string, obj: JsonObject, allowed: readonly string[]): void {
  for (const found of Object.keys(obj)) {
    if (allowed.includes(found) || found.startsWith('_')) continue
    const suggestion = allowed.find((a) => a.toLowerCase() === found.toLowerCase())
    bad(
      ctx,
      path === '' ? found : `${path}.${found}`,
      suggestion
        ? `unknown field — did you mean "${suggestion}"?`
        : `unknown field. Allowed here: ${allowed.join(', ')}. ` +
            `(Keys starting with "_" are ignored, if you wanted a note.)`,
    )
  }
}

function objectAt(ctx: Ctx, path: string, value: unknown): JsonObject | undefined {
  if (!isPlainObject(value)) {
    bad(ctx, path, `expected an object, got ${describe(value)}`)
    return undefined
  }
  return value
}

function arrayAt(ctx: Ctx, path: string, value: unknown): readonly unknown[] | undefined {
  if (!Array.isArray(value)) {
    bad(ctx, path, `expected an array, got ${describe(value)}`)
    return undefined
  }
  return value
}

function intAt(ctx: Ctx, path: string, value: unknown, min: number): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    bad(ctx, path, `expected a whole number, got ${describe(value)}`)
    return undefined
  }
  if (value < min) {
    bad(ctx, path, `expected a whole number >= ${min}, got ${value}`)
    return undefined
  }
  return value
}

function finiteAt(ctx: Ctx, path: string, value: unknown, min: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    bad(ctx, path, `expected a number, got ${describe(value)}`)
    return undefined
  }
  if (value < min) {
    bad(ctx, path, `expected a number >= ${min}, got ${value}`)
    return undefined
  }
  return value
}

function boolAt(ctx: Ctx, path: string, value: unknown): boolean | undefined {
  if (typeof value !== 'boolean') {
    bad(ctx, path, `expected true or false, got ${describe(value)}`)
    return undefined
  }
  return value
}

function stringAt(ctx: Ctx, path: string, value: unknown): string | undefined {
  if (typeof value !== 'string') {
    bad(ctx, path, `expected a string, got ${describe(value)}`)
    return undefined
  }
  return value
}

function validateDoc(ctx: Ctx, raw: JsonObject): StateDoc | undefined {
  checkKeys(ctx, '', raw, TOP_LEVEL_KEYS)

  // Already range-checked in `parse` before migration ran.
  const schemaVersion = CURRENT_SCHEMA_VERSION

  const sessionsCompleted = intAt(ctx, 'sessionsCompleted', raw['sessionsCompleted'], 0)
  const cyclePosition = intAt(ctx, 'cyclePosition', raw['cyclePosition'], 0)
  const ladders = validateLadders(ctx, raw['ladders'])
  const settings = validateSettings(ctx, raw['settings'])
  const history = validateHistory(ctx, raw['history'])

  if (
    sessionsCompleted === undefined ||
    cyclePosition === undefined ||
    !ladders ||
    !settings ||
    !history
  ) {
    return undefined
  }
  return { schemaVersion, sessionsCompleted, cyclePosition, ladders, history, settings }
}

function validateLadders(
  ctx: Ctx,
  value: unknown,
): Readonly<Record<Pattern, LadderState>> | undefined {
  const obj = objectAt(ctx, 'ladders', value)
  if (!obj) return undefined

  checkKeys(ctx, 'ladders', obj, PATTERNS)

  const states = {} as Record<Pattern, LadderState>
  let complete = true

  for (const pattern of PATTERNS) {
    const path = `ladders.${pattern}`
    const entry = obj[pattern]
    if (entry === undefined) {
      bad(
        ctx,
        path,
        `missing — all five ladders (${PATTERNS.join(', ')}) must be present, ` +
          `even ones you never train.`,
      )
      complete = false
      continue
    }
    const state = validateLadderState(ctx, path, entry, pattern)
    if (!state) {
      complete = false
      continue
    }
    states[pattern] = state
  }

  return complete ? states : undefined
}

function validateLadderState(
  ctx: Ctx,
  path: string,
  value: unknown,
  pattern: Pattern,
): LadderState | undefined {
  const obj = objectAt(ctx, path, value)
  if (!obj) return undefined
  checkKeys(ctx, path, obj, LADDER_STATE_KEYS)

  // The upper bound is the one check that needs the ladder content. Without it,
  // `rungIndex` is only checked for being a non-negative integer.
  const rungCount = ctx.ladders?.[pattern].rungs.length
  const rawRungIndex = obj['rungIndex']
  let rungIndex: number | undefined
  if (typeof rawRungIndex !== 'number' || !Number.isInteger(rawRungIndex)) {
    bad(ctx, `${path}.rungIndex`, `expected a whole number, got ${describe(rawRungIndex)}`)
  } else if (rawRungIndex < 0) {
    bad(ctx, `${path}.rungIndex`, `expected a whole number >= 0, got ${rawRungIndex}`)
  } else if (rungCount !== undefined && rawRungIndex > rungCount - 1) {
    // The message has to say what the legal range *is*: "out of range" sends a
    // person back to the source to find out what the range was.
    bad(
      ctx,
      `${path}.rungIndex`,
      `expected a whole number between 0 and ${rungCount - 1} ` +
        `(the ${pattern} ladder has ${rungCount} rungs), got ${rawRungIndex}`,
    )
  } else {
    rungIndex = rawRungIndex
  }

  const target = finiteAt(ctx, `${path}.target`, obj['target'], 1)
  const cleanAtMax = intAt(ctx, `${path}.cleanAtMax`, obj['cleanAtMax'], 0)
  const missedStreak = intAt(ctx, `${path}.missedStreak`, obj['missedStreak'], 0)

  if (
    rungIndex === undefined ||
    target === undefined ||
    cleanAtMax === undefined ||
    missedStreak === undefined
  ) {
    return undefined
  }
  return { rungIndex, target, cleanAtMax, missedStreak }
}

function validateSettings(ctx: Ctx, value: unknown): Settings | undefined {
  const obj = objectAt(ctx, 'settings', value)
  if (!obj) return undefined
  checkKeys(ctx, 'settings', obj, SETTINGS_KEYS)

  const soundEnabled = boolAt(ctx, 'settings.soundEnabled', obj['soundEnabled'])
  const voiceEnabled = boolAt(ctx, 'settings.voiceEnabled', obj['voiceEnabled'])
  const skipWarmupByDefault = boolAt(
    ctx,
    'settings.skipWarmupByDefault',
    obj['skipWarmupByDefault'],
  )

  const rawPersist = obj['persistGranted']
  let persistGranted: boolean | null | undefined
  if (rawPersist === null) {
    persistGranted = null
  } else if (typeof rawPersist === 'boolean') {
    persistGranted = rawPersist
  } else {
    bad(
      ctx,
      'settings.persistGranted',
      `expected true, false, or null (meaning "not requested yet"), got ${describe(rawPersist)}`,
    )
  }

  const sync = validateSync(ctx, obj['sync'])

  if (
    soundEnabled === undefined ||
    voiceEnabled === undefined ||
    skipWarmupByDefault === undefined ||
    persistGranted === undefined ||
    sync === undefined
  ) {
    return undefined
  }
  return { soundEnabled, voiceEnabled, skipWarmupByDefault, persistGranted, sync }
}

/** `undefined` means invalid; `null` is the valid "sync not configured" value. */
function validateSync(ctx: Ctx, value: unknown): SyncSettings | null | undefined {
  if (value === null) return null
  if (value === undefined) {
    bad(
      ctx,
      'settings.sync',
      'missing — expected null (sync not configured) or { "baseUrl": …, "secret": … }',
    )
    return undefined
  }
  const obj = objectAt(ctx, 'settings.sync', value)
  if (!obj) return undefined
  checkKeys(ctx, 'settings.sync', obj, SYNC_KEYS)

  const baseUrl = stringAt(ctx, 'settings.sync.baseUrl', obj['baseUrl'])
  const secret = stringAt(ctx, 'settings.sync.secret', obj['secret'])
  if (baseUrl === undefined || secret === undefined) return undefined
  return { baseUrl, secret }
}

function validateHistory(ctx: Ctx, value: unknown): readonly SessionResult[] | undefined {
  const arr = arrayAt(ctx, 'history', value)
  if (!arr) return undefined

  const sessions: SessionResult[] = []
  let complete = true

  arr.forEach((entry, i) => {
    const session = validateSession(ctx, `history[${i}]`, entry)
    if (!session) {
      complete = false
      return
    }
    sessions.push(session)
  })

  return complete ? sessions : undefined
}

function validateSession(ctx: Ctx, path: string, value: unknown): SessionResult | undefined {
  const obj = objectAt(ctx, path, value)
  if (!obj) return undefined
  checkKeys(ctx, path, obj, SESSION_KEYS)

  const completedAt = validateTimestamp(ctx, `${path}.completedAt`, obj['completedAt'])
  const day = validateDay(ctx, `${path}.day`, obj['day'])

  const rawExercises = arrayAt(ctx, `${path}.exercises`, obj['exercises'])
  const exercises: ExerciseResult[] = []
  let exercisesComplete = rawExercises !== undefined
  rawExercises?.forEach((entry, i) => {
    const exercise = validateExercise(ctx, `${path}.exercises[${i}]`, entry)
    if (!exercise) {
      exercisesComplete = false
      return
    }
    exercises.push(exercise)
  })

  if (completedAt === undefined || day === undefined || !exercisesComplete) return undefined
  return { completedAt, day, exercises }
}

function validateTimestamp(ctx: Ctx, path: string, value: unknown): string | undefined {
  const text = stringAt(ctx, path, value)
  if (text === undefined) return undefined
  if (!ISO_INSTANT.test(text) || !Number.isFinite(Date.parse(text))) {
    bad(
      ctx,
      path,
      `expected an ISO-8601 instant like "2026-07-06T07:12:00.000Z", got ${describe(value)}`,
    )
    return undefined
  }
  return text
}

/**
 * Checked against `CYCLE_DAYS`, derived from `CYCLE`, rather than a literal list.
 * `D` (cardio) became legal when the cycle grew to seven positions, and a codec
 * with its own hardcoded copy of the day letters would have rejected every cardio
 * session the engine prescribes.
 */
function validateDay(ctx: Ctx, path: string, value: unknown): CycleDay | undefined {
  if (isCycleDay(value)) return value
  const quoted = CYCLE_DAYS.map((day) => `"${day}"`)
  const list = `${quoted.slice(0, -1).join(', ')} or ${quoted[quoted.length - 1]}`
  bad(ctx, path, `expected ${list}, got ${describe(value)}`)
  return undefined
}

function validateExercise(ctx: Ctx, path: string, value: unknown): ExerciseResult | undefined {
  const obj = objectAt(ctx, path, value)
  if (!obj) return undefined
  checkKeys(ctx, path, obj, EXERCISE_KEYS)

  const rawPattern = obj['pattern']
  let pattern: Pattern | undefined
  if (isPattern(rawPattern)) {
    pattern = rawPattern
  } else {
    bad(ctx, `${path}.pattern`, `expected one of ${PATTERNS.join(', ')}, got ${describe(rawPattern)}`)
  }

  const rungId = validateRungId(ctx, `${path}.rungId`, obj['rungId'])
  const sets = validateSets(ctx, `${path}.sets`, obj['sets'])

  if (pattern === undefined || rungId === undefined || sets === undefined) {
    return undefined
  }
  return { pattern, rungId, sets }
}

/**
 * Only the `<pattern>-` prefix is checked, never membership in the ladder
 * content — see the "deliberately NOT validated" note in the header.
 */
function validateRungId(ctx: Ctx, path: string, value: unknown): RungId | undefined {
  const text = stringAt(ctx, path, value)
  if (text === undefined) return undefined
  const dash = text.indexOf('-')
  const prefix = dash === -1 ? '' : text.slice(0, dash)
  if (!isPattern(prefix) || text.length <= dash + 1) {
    bad(
      ctx,
      path,
      `expected a rung id like "push-04-full" — one of ${PATTERNS.join(', ')} ` +
        `followed by "-" and an identifier — got ${describe(value)}`,
    )
    return undefined
  }
  return text as RungId
}

function validateSets(ctx: Ctx, path: string, value: unknown): readonly SetResult[] | undefined {
  const arr = arrayAt(ctx, path, value)
  if (!arr) return undefined
  if (arr.length === 0) {
    // An exercise with no sets carries no information: `isCompleted` reads every
    // set, and an empty log is not evidence of success. (A *session* with no
    // exercises is different and perfectly legal — that is a cardio day.)
    bad(ctx, path, 'expected at least one set — an exercise with no sets records nothing')
    return undefined
  }

  const sets: SetResult[] = []
  let complete = true

  arr.forEach((entry, i) => {
    const setPath = `${path}[${i}]`
    const obj = objectAt(ctx, setPath, entry)
    if (!obj) {
      complete = false
      return
    }
    checkKeys(ctx, setPath, obj, SET_KEYS)
    const targetValue = finiteAt(ctx, `${setPath}.targetValue`, obj['targetValue'], 0)
    const actualValue = finiteAt(ctx, `${setPath}.actualValue`, obj['actualValue'], 0)
    if (targetValue === undefined || actualValue === undefined) {
      complete = false
      return
    }
    sets.push({ targetValue, actualValue })
  })

  return complete ? sets : undefined
}

// ─── Summary, for the import confirmation dialog ────────────────────────────

export interface DocSummary {
  readonly sessionsCompleted: number
  readonly cyclePosition: number
  readonly historyLength: number
  readonly lastSessionAt: string | null
  readonly rungs: readonly { readonly pattern: Pattern; readonly rungIndex: number; readonly target: number }[]
}

/**
 * The facts a person needs to decide "is this the file I meant?" before a
 * destructive import. Lives here rather than in the UI because it is a property
 * of the document, and because it is worth a test.
 */
export function summarise(doc: StateDoc): DocSummary {
  const last = doc.history.length > 0 ? doc.history[doc.history.length - 1] : undefined
  return {
    sessionsCompleted: doc.sessionsCompleted,
    cyclePosition: doc.cyclePosition,
    historyLength: doc.history.length,
    lastSessionAt: last?.completedAt ?? null,
    rungs: PATTERNS.map((pattern) => ({
      pattern,
      rungIndex: doc.ladders[pattern].rungIndex,
      target: doc.ladders[pattern].target,
    })),
  }
}
