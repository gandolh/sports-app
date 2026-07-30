/**
 * The state document codec: text ⇄ `StateDoc`.
 *
 * ── Why this file is careful out of proportion to its size ───────────────────
 *
 * The document this codec reads and writes is *both* the app's source of truth
 * *and* its backup format (corpus/wiki/technical-decisions.md). There is one copy
 * per user, it lives in browser storage, and the schedule is a pure function of
 * it — so losing it does not degrade the experience, it silently resets every
 * ladder to its starting rung and discards months of training. Every rule below
 * exists to make a wrong document *loud* instead of *quiet*.
 *
 * ── Two hard guarantees ─────────────────────────────────────────────────────
 *
 *   1. `parse` NEVER throws. It returns a result. A human is expected to open
 *      this file in a text editor and fix a wrong counter at 2am, so a bad
 *      hand-edit is an ordinary input, not an exceptional one.
 *   2. `parse` NEVER returns a partially-valid document. There is no silent
 *      repair, no coercion, no filling in of defaults. A half-understood
 *      document that the app then *saves back* is how a hand-edit typo becomes
 *      permanent data loss. Either the whole thing is understood, or the caller
 *      gets an error and the stored text is left exactly as it was.
 *
 * ── Strict, including on `settings` ─────────────────────────────────────────
 *
 * It is tempting to default missing `settings` fields, since a persistence flag
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
 *   - **`sessionsDone` has no upper bound.** The top rung cycles forever
 *     (`schedule.targetAt`), so every non-negative integer names a real
 *     prescription. "I have done this 4000 times" is a fact, not a typo.
 *   - **`history.length` need not agree with anything.** History is a list a user
 *     may prune by hand; `cyclePosition` is a counter that never resets.
 *   - **Extra keys beginning with `_`** are allowed and dropped, so a human can
 *     leave themselves a `"_note"` in a format that has no comments. Any other
 *     unrecognised key is an error, because it is nearly always a typo of a
 *     real one.
 *
 * ── What v3 stopped validating, and why that is not a loss ──────────────────
 *
 * v2 took the ladder content as a `ParseOptions.ladders` argument for exactly
 * one check: is `rungIndex` inside the ladder? **v3's document holds nothing
 * derived** (corpus/wiki/progression-engine.md#state-is-one-integer-per-pattern),
 * so there is no stored rung index, no stored target, and therefore nothing in
 * the document that content could contradict. The parameter is gone rather than
 * kept and ignored: a validation hook that validates nothing is worse than no
 * hook, because the next reader trusts it. The whole of `client/src/persistence/`
 * is now independent of `client/src/domain/ladders.ts`.
 *
 * The check the content used to buy is not missing — it moved into the shape.
 * `rungIndexAt` clamps, so an absurd `sessionsDone` degrades to the top rung
 * instead of indexing past the end of an array.
 *
 * ── Serialisation is a feature, not a formality ─────────────────────────────
 *
 * `serialise` is hand-rolled rather than `JSON.stringify(doc, null, 2)` because
 * the output is read by a person: key order is fixed and meaningful (the whole of
 * the mutable state first, the long history tail last), `sessionsDone` and each
 * exercise record sit on one line so history stays scannable, and blank lines
 * separate the top-level sections. All of that is still plain JSON — whitespace
 * between tokens is insignificant to any parser.
 */
import type {
  ExerciseRecord,
  Pattern,
  RungId,
  SessionResult,
  Settings,
  StateDoc,
  SyncSettings,
  Variant,
} from '@sports-app/shared/types.ts'
import {
  CURRENT_SCHEMA_VERSION,
  PATTERNS,
  VARIANTS,
  isPattern,
  isVariant,
} from '@sports-app/shared/types.ts'
import {
  LEGACY_USERNAME,
  USERNAME_RULE,
  isValidUsername,
} from '@sports-app/shared/username.ts'
// `ROTATION` is programme content, so it stays in the client — the v2→v3
// migration needs its length to turn a session's index into a slot position.
import { ROTATION } from '../domain/types.ts'

// ─── Public surface ─────────────────────────────────────────────────────────

export type ParseResult =
  | { readonly ok: true; readonly doc: StateDoc }
  | { readonly ok: false; readonly error: string }

export interface ParseOptions {
  /**
   * Who a **pre-v3** document belongs to. Ignored for a v3 document, which
   * carries its own `username`.
   *
   * `parse` does not check a v3 document's username against this: only the caller
   * that chose the storage key knows which user it *meant* to read, so that
   * comparison lives in `store.load`.
   */
  readonly username?: string | undefined
}

/** More than this many problems and the list stops being useful. */
const MAX_REPORTED_PROBLEMS = 20

/** Loose ISO-8601 instant check. Exactness is not the point; NaN dates are. */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/

const TOP_LEVEL_KEYS = [
  'schemaVersion',
  'username',
  'cyclePosition',
  'sessionsDone',
  'settings',
  'history',
] as const

/**
 * No `soundEnabled`, `voiceEnabled` or `skipWarmupByDefault`. Audio and the
 * guided warmup are out of v3 scope, and the v2→v3 migration strips all three
 * *before* validation runs — so by the time `checkKeys` sees one it is a
 * hand-typed key and correctly reported as unknown.
 */
const SETTINGS_KEYS = ['persistGranted', 'sync'] as const

const SYNC_KEYS = ['baseUrl', 'secret'] as const

const SESSION_KEYS = ['completedAt', 'position', 'variant', 'exercises'] as const

/**
 * No `effort` (v1) and no per-set array (v2). `sets` is a count in v3, because
 * nothing per-set is measured — see `ExerciseRecord`.
 */
const EXERCISE_KEYS = ['pattern', 'rungId', 'sets', 'targetValue'] as const

// ─── Usernames ──────────────────────────────────────────────────────────────
//
// The rule itself is **not here any more**. It lives in
// `@sports-app/shared/username.ts` as a single definition that this codec and the
// service both import — see the header of that file for why the duplication
// existed and what it cost. Nothing in this file restates it, and nothing should:
// the reason `parse` rejects a bad username at all is that the service will, and
// a second copy of the rule is a way for those two answers to differ.
//
// `USERNAME_MAX_LENGTH`, `USERNAME_PATTERN`, `USERNAME_RULE`, `isValidUsername`
// and `LEGACY_USERNAME` are therefore imported at the top of this file rather than
// re-exported from it. Callers that used to reach them through the codec — the
// login form, `session.ts` — now import from `shared/` directly, so there is one
// name and one path for one rule.

// ─── emptyDoc ───────────────────────────────────────────────────────────────

/**
 * A fresh document for `username`: every counter at zero.
 *
 * That really is all of it. There is no onboarding quiz, no calibration and no
 * per-ladder seeding, because every ladder's starting rung is a property of the
 * *content* (`Ladder.startRungIndex`) that `rungIndexAt` applies to a zero
 * counter. v2's `emptyDoc` had to copy `startRungIndex` and `targetMin` into the
 * document and keep them in step with the engine's own fresh state; there is
 * nothing left to keep in step.
 *
 * The username is trusted here rather than validated, because this function
 * cannot report a failure. `serialise` → `parse` is the enforcement point, and
 * `store.save` runs it before anything reaches storage.
 */
export function emptyDoc(username: string): StateDoc {
  const sessionsDone = {} as Record<Pattern, number>
  for (const pattern of PATTERNS) sessionsDone[pattern] = 0
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    username,
    cyclePosition: 0,
    sessionsDone,
    history: [],
    settings: {
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

export interface MigrateOptions {
  /** Who a pre-v3 document belongs to. Defaults to `LEGACY_USERNAME`. */
  readonly username?: string | undefined
}

/**
 * One step from version N to N+1, operating on an *unvalidated* plain object.
 *
 * Migration deliberately runs before validation. Validating first would require
 * keeping a validator for every schema version that ever shipped; this way
 * there is exactly one validator, for the current shape, and each migration
 * only has to know how its own version differed.
 */
type MigrationStep = (raw: JsonObject, options: MigrateOptions) => JsonObject

/**
 * v1 → v2: drop `ExerciseResult.effort`.
 *
 * The effort input was removed from the app entirely (corpus/wiki/adherence.md,
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
 * v2 → v3: the adaptive engine's state is deleted and the schedule becomes a pure
 * function of how many sessions of each pattern have been completed.
 *
 * This is the first migration that **drops a required field**, so the reasoning
 * matters more than the code:
 *
 *   - **`sessionsDone` is reconstructed from history, not carried over from
 *     `rungIndex`.** That looks like an oversight and is not. A v2 rung index was
 *     reached by an adaptive rule that no longer exists — three clean sets at the
 *     top of a range advanced it, three misses walked it back — so it is a
 *     position in a system with different laws. Carrying it over would put the
 *     user on a rung the v3 schedule disagrees with, *and the disagreement would
 *     be invisible*, because v3 derives the rung from the counter and would then
 *     have no way to notice the counter and the rung disagreed. Counting the
 *     sessions each pattern appears in is the only self-consistent answer, and it
 *     is a faithful reconstruction rather than an estimate: "how many sessions of
 *     this pattern have I done" is exactly what the history records.
 *
 *     The cost is honest and worth stating: a user who pruned their history by
 *     hand loses ladder position in proportion to what they pruned. There is no
 *     way to have both, because the pruned sessions are simply gone.
 *
 *   - **`cleanAtMax`, `missedStreak` and `target` are dropped outright.** All
 *     three are inputs to rules that no longer exist. `target` in particular is
 *     now derived by interpolation across the rung, so a stored one is a second
 *     source of truth for a number the schedule computes.
 *
 *   - **`actualValue` is discarded and each `sets` array collapses to its
 *     length.** The app never learns what happened, so there is nothing per set
 *     to keep. The length is *measured* rather than assumed to be 3: a v2
 *     document written before the daily block existed has two-set entries, and a
 *     hand-edited one may have anything.
 *
 *   - **`variant` did not exist in v2**, so historical sessions default to
 *     `medium` — the value that means "the schedule's own number", which is what
 *     v2 always prescribed.
 *
 *   - **`day` becomes `position` from the session's index, modulo the rotation.**
 *     v2's cycle had seven positions and four day letters; v3's rotation has
 *     three slots. No mapping between them is truthful, so none is invented.
 *     `position` on a *historical* session is only ever used to label a past
 *     session for display; nothing derives a prescription from it (`recordSession`
 *     reads it for a session that is happening now, which a migrated one is not).
 *
 *   - **`cyclePosition` is carried over unchanged.** It is a bare counter in both
 *     schemas — `slotAt` takes it modulo three and nothing else reads it — so the
 *     only consequence is that the next session may be an unexpected slot once.
 *     Resetting it to zero would be an equally arbitrary choice that also throws
 *     away the session count it happens to carry.
 *
 * Defensive throughout, for the same reason as the v1 step: it runs on
 * unvalidated input, and anything not shaped the way v2 promised is passed
 * through for the single validator to report.
 */
function collapseAdaptiveState(raw: JsonObject, options: MigrateOptions): JsonObject {
  const history = Array.isArray(raw['history']) ? raw['history'] : null

  // `ladders` and `sessionsCompleted` are removed by omission: the first is the
  // adaptive state itself, the second is `history.length` in v3.
  const { ladders: _ladders, sessionsCompleted: _sessionsCompleted, ...rest } = raw

  return {
    ...rest,
    // A *valid* hand-added username survives; anything else is treated as absent,
    // because this field does not exist in v2 and whatever we write here is ours
    // rather than a repair of something the user meant. A v2 document written by
    // the app never has one — v2 had exactly one user, which is why the fallback
    // is "whoever is loading this".
    username: isValidUsername(raw['username'])
      ? raw['username']
      : (options.username ?? LEGACY_USERNAME),
    sessionsDone: countSessionsPerPattern(history),
    settings: dropRetiredSettings(raw['settings']),
    history: history === null ? raw['history'] : history.map(migrateSession),
  }
}

/**
 * How many sessions each pattern appears in.
 *
 * A `Set` per session, so an exercise recorded twice in one session — which a
 * hand-edit can produce — counts once. `sessionsDone` counts *sessions*, and the
 * schedule divides it by `sessionsPerRung`, so double-counting would advance a
 * ladder for free.
 */
function countSessionsPerPattern(history: readonly unknown[] | null): Record<Pattern, number> {
  const counts = {} as Record<Pattern, number>
  for (const pattern of PATTERNS) counts[pattern] = 0
  if (history === null) return counts

  for (const session of history) {
    if (!isPlainObject(session)) continue
    const exercises = session['exercises']
    if (!Array.isArray(exercises)) continue
    const seen = new Set<Pattern>()
    for (const exercise of exercises) {
      if (!isPlainObject(exercise)) continue
      const pattern = exercise['pattern']
      if (isPattern(pattern)) seen.add(pattern)
    }
    for (const pattern of seen) counts[pattern] += 1
  }
  return counts
}

function migrateSession(session: unknown, index: number): unknown {
  if (!isPlainObject(session)) return session
  const { day: _day, ...rest } = session
  const exercises = session['exercises']
  return {
    ...rest,
    // Display only. See the note about `day` above.
    position: index % ROTATION.length,
    variant: isVariant(session['variant']) ? session['variant'] : 'medium',
    exercises: Array.isArray(exercises) ? exercises.map(migrateExercise) : exercises,
  }
}

function migrateExercise(exercise: unknown): unknown {
  if (!isPlainObject(exercise)) return exercise
  const sets = exercise['sets']
  // Not an array means this is not the v2 shape. Pass it through so the validator
  // reports what it actually is, rather than guessing a count.
  if (!Array.isArray(sets)) return exercise

  const { sets: _sets, ...rest } = exercise
  // Every set of one v2 exercise carried the same `targetValue` — the engine
  // prescribed one target per exercise and repeated it — so the first set's value
  // *is* the exercise's target. When it is missing the field is left out
  // entirely, so the validator says `targetValue: missing` instead of inventing 0.
  const first = sets[0]
  const targetValue = isPlainObject(first) ? first['targetValue'] : undefined

  return {
    ...rest,
    sets: sets.length,
    ...(targetValue === undefined ? {} : { targetValue }),
  }
}

function dropRetiredSettings(value: unknown): unknown {
  if (!isPlainObject(value)) return value
  const {
    soundEnabled: _sound,
    voiceEnabled: _voice,
    skipWarmupByDefault: _skipWarmup,
    ...rest
  } = value
  return rest
}

/**
 * Indexed by the version being migrated *from*.
 *
 * This machinery existed and was empty from v1, on purpose. Retrofitting
 * migration onto a file that already holds six months of real training history is
 * a problem you only get to have once — and v2 arriving four briefs later, then
 * v3 arriving five after that, each with one line to register, is the payoff.
 */
const MIGRATIONS: ReadonlyMap<number, MigrationStep> = new Map<number, MigrationStep>([
  [1, dropEffortFromExercises],
  [2, collapseAdaptiveState],
])

/**
 * Applies every step from `fromVersion` up to the current one. Never throws.
 *
 * **One step at a time, never a jump.** A v1 document reaches v3 by running both
 * steps in order, so each step only has to know how its own version differed from
 * the next. A direct v1→v3 shortcut would be a third thing to keep correct.
 */
export function migrate(
  raw: JsonObject,
  fromVersion: number,
  options: MigrateOptions = {},
): MigrationResult {
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
      current = step(current, options)
    } catch (cause) {
      return {
        ok: false,
        error: `schemaVersion: migration from version ${version} failed: ${messageOf(cause)}`,
      }
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

  const migrated = migrate(raw, version, { username: options.username })
  if (!migrated.ok) return { ok: false, error: migrated.error }

  const ctx: Ctx = { problems: [] }
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
 * The order is chosen for a human opening the file: who this is and where they
 * are comes first — and in v3 that is the *whole* of the mutable state, five
 * integers on one line — then settings, then the long history tail. Note that
 * this is deliberately *not* the declaration order in `types.ts`: `history` moves
 * last because it is the only unbounded section, and a file whose first screen is
 * `sessionsDone` is one you can actually fix something in.
 */
export function serialise(doc: StateDoc): string {
  const out: string[] = []

  out.push('{')
  out.push(`  ${key('schemaVersion')}${num(doc.schemaVersion)},`)
  out.push(`  ${key('username')}${str(doc.username)},`)
  out.push(`  ${key('cyclePosition')}${num(doc.cyclePosition)},`)
  out.push('')

  // PATTERNS, not Object.keys — key order must not depend on how the object
  // happened to be built. One line: this is the entire mutable state, and seeing
  // all five numbers at once is the point.
  const counters = PATTERNS.map((pattern) => `${key(pattern)}${num(doc.sessionsDone[pattern])}`)
  out.push(`  ${key('sessionsDone')}{ ${counters.join(', ')} },`)
  out.push('')

  out.push(`  ${key('settings')}{`)
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
      out.push(`      ${key('position')}${num(session.position)},`)
      out.push(`      ${key('variant')}${str(session.variant)},`)
      if (session.exercises.length === 0) {
        // A cardio slot records no exercises of its own; the daily block still
        // records, so a genuinely empty list only happens on a hand-edit.
        out.push(`      ${key('exercises')}[]`)
      } else {
        out.push(`      ${key('exercises')}[`)
        session.exercises.forEach((exercise, ei) => {
          const comma = ei === session.exercises.length - 1 ? '' : ','
          // One line per exercise. In v3 an exercise record is four scalars, so
          // a session is four lines plus its exercises and a year of history
          // stays scannable in an editor.
          const fields = [
            `${key('pattern')}${str(exercise.pattern)}`,
            `${key('rungId')}${str(exercise.rungId)}`,
            `${key('sets')}${num(exercise.sets)}`,
            `${key('targetValue')}${num(exercise.targetValue)}`,
          ].join(', ')
          out.push(`        { ${fields} }${comma}`)
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
 * `NaN` session counter never reaches the live key.
 */
function num(value: number): string {
  return JSON.stringify(value) ?? 'null'
}

// ─── Validation internals ───────────────────────────────────────────────────

export type JsonObject = { readonly [key: string]: unknown }

interface Ctx {
  readonly problems: string[]
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

  const username = validateUsername(ctx, raw['username'])
  const cyclePosition = intAt(ctx, 'cyclePosition', raw['cyclePosition'], 0)
  const sessionsDone = validateSessionsDone(ctx, raw['sessionsDone'])
  const settings = validateSettings(ctx, raw['settings'])
  const history = validateHistory(ctx, raw['history'])

  if (
    username === undefined ||
    cyclePosition === undefined ||
    !sessionsDone ||
    !settings ||
    !history
  ) {
    return undefined
  }
  return { schemaVersion, username, cyclePosition, sessionsDone, history, settings }
}

/**
 * The username is validated against the same allowlist the sync service uses —
 * literally the same one since brief 21, not a matching copy — so a document this
 * codec accepts is a document that can be pushed. See
 * `@sports-app/shared/username.ts`.
 */
function validateUsername(ctx: Ctx, value: unknown): string | undefined {
  const text = stringAt(ctx, 'username', value)
  if (text === undefined) return undefined
  if (!isValidUsername(text)) {
    bad(ctx, 'username', `expected ${USERNAME_RULE}, got ${describe(value)}`)
    return undefined
  }
  return text
}

/**
 * All five counters, every one a non-negative integer.
 *
 * A missing pattern is an error rather than a zero: `sessionsDone` is the whole
 * of the mutable state, so "this key is absent" and "this pattern has never been
 * trained" are the same shape and very different facts, and defaulting the first
 * to the second would silently reset a ladder.
 *
 * Note the *lower* bound and nothing above it. `slotAt` and `rungIndexAt` both
 * tolerate an absurd counter on purpose — the file is hand-editable, so the
 * domain must degrade rather than throw — but tolerating it downstream is not a
 * reason to accept it here. A precise message about a negative counter, with the
 * file left untouched, beats silently training a wrong rung.
 */
function validateSessionsDone(
  ctx: Ctx,
  value: unknown,
): Readonly<Record<Pattern, number>> | undefined {
  const obj = objectAt(ctx, 'sessionsDone', value)
  if (!obj) return undefined

  checkKeys(ctx, 'sessionsDone', obj, PATTERNS)

  const counts = {} as Record<Pattern, number>
  let complete = true

  for (const pattern of PATTERNS) {
    const path = `sessionsDone.${pattern}`
    if (obj[pattern] === undefined) {
      bad(
        ctx,
        path,
        `missing — all five counters (${PATTERNS.join(', ')}) must be present, ` +
          `even for a pattern you have never trained (use 0).`,
      )
      complete = false
      continue
    }
    const count = intAt(ctx, path, obj[pattern], 0)
    if (count === undefined) {
      complete = false
      continue
    }
    counts[pattern] = count
  }

  return complete ? counts : undefined
}

function validateSettings(ctx: Ctx, value: unknown): Settings | undefined {
  const obj = objectAt(ctx, 'settings', value)
  if (!obj) return undefined
  checkKeys(ctx, 'settings', obj, SETTINGS_KEYS)

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

  if (persistGranted === undefined || sync === undefined) return undefined
  return { persistGranted, sync }
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
  const position = intAt(ctx, `${path}.position`, obj['position'], 0)
  const variant = validateVariant(ctx, `${path}.variant`, obj['variant'])

  const rawExercises = arrayAt(ctx, `${path}.exercises`, obj['exercises'])
  const exercises: ExerciseRecord[] = []
  let exercisesComplete = rawExercises !== undefined
  rawExercises?.forEach((entry, i) => {
    const exercise = validateExercise(ctx, `${path}.exercises[${i}]`, entry)
    if (!exercise) {
      exercisesComplete = false
      return
    }
    exercises.push(exercise)
  })

  if (
    completedAt === undefined ||
    position === undefined ||
    variant === undefined ||
    !exercisesComplete
  ) {
    return undefined
  }
  return { completedAt, position, variant, exercises }
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
 * Checked against `VARIANTS` rather than a literal list, so the codec cannot
 * reject a load dial the domain has added.
 */
function validateVariant(ctx: Ctx, path: string, value: unknown): Variant | undefined {
  if (isVariant(value)) return value
  const quoted = VARIANTS.map((variant) => `"${variant}"`)
  const list = `${quoted.slice(0, -1).join(', ')} or ${quoted[quoted.length - 1]}`
  bad(ctx, path, `expected ${list}, got ${describe(value)}`)
  return undefined
}

function validateExercise(ctx: Ctx, path: string, value: unknown): ExerciseRecord | undefined {
  const obj = objectAt(ctx, path, value)
  if (!obj) return undefined
  checkKeys(ctx, path, obj, EXERCISE_KEYS)

  const rawPattern = obj['pattern']
  let pattern: Pattern | undefined
  if (isPattern(rawPattern)) {
    pattern = rawPattern
  } else {
    bad(
      ctx,
      `${path}.pattern`,
      `expected one of ${PATTERNS.join(', ')}, got ${describe(rawPattern)}`,
    )
  }

  const rungId = validateRungId(ctx, `${path}.rungId`, obj['rungId'])
  // At least one set: an exercise recorded as zero sets records nothing, which is
  // a hand-edit slip rather than a fact. (A *session* with no exercises is
  // different and perfectly legal — that is a cardio slot.)
  const sets = intAt(ctx, `${path}.sets`, obj['sets'], 1)
  const targetValue = finiteAt(ctx, `${path}.targetValue`, obj['targetValue'], 0)

  if (
    pattern === undefined ||
    rungId === undefined ||
    sets === undefined ||
    targetValue === undefined
  ) {
    return undefined
  }
  return { pattern, rungId, sets, targetValue }
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

// ─── Summary, for the import confirmation dialog ────────────────────────────

export interface DocSummary {
  readonly username: string
  readonly cyclePosition: number
  readonly historyLength: number
  readonly lastSessionAt: string | null
  readonly sessionsDone: readonly { readonly pattern: Pattern; readonly sessions: number }[]
}

/**
 * The facts a person needs to decide "is this the file I meant?" before a
 * destructive import. Lives here rather than in the UI because it is a property
 * of the document, and because it is worth a test.
 *
 * `sessionsDone` rather than rung indices, even though a rung index is the number
 * a person recognises: deriving one needs the ladder content, and the whole of
 * `client/src/persistence/` is deliberately content-free in v3. The screen that shows
 * this summary already has the content and can derive rungs itself if it wants —
 * `username` and the counters are the facts that identify the *document*.
 */
export function summarise(doc: StateDoc): DocSummary {
  const last = doc.history.length > 0 ? doc.history[doc.history.length - 1] : undefined
  return {
    username: doc.username,
    cyclePosition: doc.cyclePosition,
    historyLength: doc.history.length,
    lastSessionAt: last?.completedAt ?? null,
    sessionsDone: PATTERNS.map((pattern) => ({ pattern, sessions: doc.sessionsDone[pattern] })),
  }
}
