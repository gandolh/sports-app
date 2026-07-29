/**
 * The wire contract and the document shape — **the only code both runtimes
 * import.**
 *
 * ── What this package is for, and what it is not ─────────────────────────────
 *
 * `shared/` is not "a place for common code". It exists to end a specific
 * duplication: the username rule lived in both `server/db.mjs` and the client
 * codec, kept honest by a test that asserted the two regexes matched. One
 * definition imported twice is strictly better than two definitions plus a test
 * that they agree. See `username.ts`, and
 * corpus/wiki/technical-decisions.md § "Three npm workspaces".
 *
 * The rule that decides what is allowed in here follows from the hard constraint
 * below: **data shapes and validation, never behaviour.**
 *
 * ── The hard constraint ─────────────────────────────────────────────────────
 *
 * **No `node:` imports. No DOM. No behaviour.** This package is a dependency of a
 * browser bundle and of a Node service *simultaneously*, so anything that assumes
 * one runtime breaks the other.
 *
 * That is enforced two ways, neither of them a comment:
 *
 *   1. `eslint.config.js` has a `shared/**` block that fails the lint on a
 *      `node:` import, a DOM global, or an import from `client/` or `server/`.
 *   2. `shared/tsconfig.json` declares `lib: ["ES2022"]` with no `DOM` and no
 *      `types`, so `document` is not even a name here — it is a type error
 *      before it is a lint error.
 *
 * ── What deliberately stayed in the client ──────────────────────────────────
 *
 * `LADDERS`, `CARDIO`, `ROTATION`, `DAILY_BLOCK`, `slotAt`, `Rung`, `Ladder`,
 * `Modifier`, `POSTURAL_NOTICE`, and the whole of `schedule.ts`, `milestones.ts`
 * and `ladders.ts`. Those are the *programme*, and the service has no business
 * knowing it — putting training content here would make the service depend on
 * ladders it never reads.
 *
 * ── The state document is the source of truth AND the backup format ──────────
 *
 * `StateDoc` is serialised to one human-readable JSON file that a person is
 * expected to open in a text editor and hand-edit — a locked decision
 * (corpus/wiki/decisions.md). Two consequences that still bind in v3:
 *
 *   1. Every field must be self-explanatory to someone fixing a wrong number at
 *      2am. Hence `sessionsDone`, not `sd`; readable string discriminants, never
 *      numeric enums.
 *   2. **Out-of-range input is a normal case, not a bug to crash on.** A
 *      hand-edited negative or absurd `cyclePosition` must degrade, not throw —
 *      see `slotAt` in `client/src/domain/types.ts`.
 *
 * The document holds nothing derived, which is the other half of why hand-editing
 * is safe: there is no second number to keep in step with the one you changed.
 */

// ─── Scalars ────────────────────────────────────────────────────────────────

/**
 * The five movement patterns. `pull` is postural-only — see `Ladder.kind` in
 * `client/src/domain/types.ts`.
 */
export type Pattern = 'push' | 'squat' | 'hinge' | 'core' | 'pull'

export const PATTERNS: readonly Pattern[] = ['push', 'squat', 'hinge', 'core', 'pull']

/**
 * Rep-based ladders count reps; core and pull are held, not repped, and count
 * seconds. Both interpolate identically — only the unit, the variant step and the
 * display formatting differ.
 */
export type TargetUnit = 'reps' | 'seconds'

/**
 * The per-session load dial, picked on the home page before training.
 *
 * It is **a dial, never a signal**: it shifts today's target by ±2 reps / ±5
 * seconds and nothing else. It does not touch `sessionsDone`, so an easy day
 * costs no progress and banks no debt (corpus/wiki/decisions.md). Anything that
 * read this to decide a *future* prescription would reintroduce adaptation.
 */
export type Variant = 'easy' | 'medium' | 'hard'

export const VARIANTS: readonly Variant[] = ['easy', 'medium', 'hard']

/**
 * ISO-8601 instant, always supplied by the caller. `client/src/domain/` cannot
 * read the clock, which is what makes the schedule reproducible under test.
 */
export type IsoTimestamp = string

/**
 * Stable rung identifier, e.g. `push-04-full`.
 *
 * These are written into persisted history, so **a rung id is immutable once
 * shipped**. A rung whose *movement* changes gets a NEW id; renaming or reusing
 * one orphans real training records. The template type enforces only the pattern
 * prefix; `client/src/domain/ladders.ts` owns the rest of the convention.
 *
 * ── Why `RungId` is here and `Rung` is not ───────────────────────────────────
 *
 * This split looks arbitrary. It is not, and the deciding question is never "is
 * this a type or is it behaviour" — everything in this file is a type. It is
 * **does the service have to understand this value to do its job?**
 *
 * `RungId` appears inside `ExerciseRecord`, which appears inside `SessionResult`,
 * which is what `history` is made of — and the service validates the document it
 * stores. So a rung *id* is part of the wire contract: both ends have to agree on
 * what one looks like, and `validateRungId` in the client codec and the service's
 * shallow check are both, ultimately, checking a shape declared here.
 *
 * `Rung`, `Ladder` and `Modifier` are the opposite case. **The server never sees a
 * rung.** It stores a document containing rung *ids* and never resolves one to
 * the movement it names — no route reads `cues`, `figureId`, `range` or
 * `safetyCritical`, and none ever should, because interpreting the programme is
 * the client's job. Moving them here would be free today and would quietly make
 * the service a consumer of training content, so that the next person to add a
 * ladder would have to wonder whether the API changed. It did not, and this split
 * is what keeps that true.
 *
 * The short version: **ids cross the wire, content does not.**
 */
export type RungId = `${Pattern}-${string}`

/** An inclusive target span, in the ladder's unit. */
export interface Range {
  readonly min: number
  readonly max: number
}

// ─── Results ────────────────────────────────────────────────────────────────

export interface ExerciseRecord {
  readonly pattern: Pattern
  readonly rungId: RungId
  /**
   * A COUNT, not an array. Nothing per-set is measured, so there is nothing to
   * store per set — three sets of a target is three, not `[t, t, t]`.
   */
  readonly sets: number
  /** What was prescribed, after the variant was applied. Never what was achieved. */
  readonly targetValue: number
}

export interface SessionResult {
  /**
   * Supplied by the caller — `client/src/domain/` may not read the clock. Stored,
   * and **NOTHING in client/src/ui may read it**: there are no dates anywhere in
   * the app, no streak, no heatmap, no missed day (corpus/wiki/decisions.md).
   */
  readonly completedAt: IsoTimestamp
  /**
   * Which rotation slot this session was. Index into `ROTATION`, via `slotAt` —
   * both of which live in the client, because the rotation is programme content.
   * A bare integer is all that crosses the wire.
   */
  readonly position: number
  readonly variant: Variant
  /** Empty on a cardio slot's own work — the daily block still records. */
  readonly exercises: readonly ExerciseRecord[]
}

// ─── State ──────────────────────────────────────────────────────────────────

export interface SyncSettings {
  readonly baseUrl: string
  /** Write-only in the UI: masked and replaceable, never displayed. */
  readonly secret: string
}

export interface Settings {
  /** Result of navigator.storage.persist(). `null` = not yet requested. */
  readonly persistGranted: boolean | null
  readonly sync: SyncSettings | null
}

/**
 * **v3** (2026-07-29): the fixed schedule. `ladders` (four numbers per pattern)
 * collapsed to `sessionsDone` (one), `sessionsCompleted` became derivable from
 * `history.length`, `ExerciseResult.sets` became a count, `day` became
 * `position`, and `variant` appeared. Brief 16 owns the v1/v2 → v3 migration.
 *
 * It lives here rather than in the codec because the service writes it into an
 * indexed column: `schema_version` on every snapshot row. Two runtimes agreeing
 * on the current version is exactly what a shared contract is for.
 */
export const CURRENT_SCHEMA_VERSION = 3

export interface StateDoc {
  readonly schemaVersion: 3
  /** Keys the document. A password is accepted and discarded, never stored. */
  readonly username: string
  /** Integer index into ROTATION. Advances on training, never on a date. */
  readonly cyclePosition: number
  /**
   * **The whole of the mutable state.** Rung index, target, name and cues are all
   * derived from these five integers by `client/src/domain/schedule.ts`.
   *
   * Stored rather than derived from `cyclePosition` — which would be exact, since
   * `sessionsDone.push` is `⌈cyclePosition / 3⌉` for the current rotation —
   * because if the rotation ever changes, derived counters would silently
   * reinterpret every existing user's position mid-programme. One integer per
   * pattern is cheap insurance against a content change rewriting history.
   */
  readonly sessionsDone: Readonly<Record<Pattern, number>>
  readonly history: readonly SessionResult[]
  readonly settings: Settings
}

// ─── Guards ─────────────────────────────────────────────────────────────────

/**
 * Pure guards over the scalars above, and the only functions in this file.
 *
 * They are here rather than in either runtime because both ends narrow the same
 * strings: the codec validating a hand-edited document, and — once the service
 * validates against a schema derived from these types — the service too. A guard
 * over a union declared here is validation, not behaviour.
 */
export function isPattern(value: unknown): value is Pattern {
  return typeof value === 'string' && (PATTERNS as readonly string[]).includes(value)
}

export function isVariant(value: unknown): value is Variant {
  return typeof value === 'string' && (VARIANTS as readonly string[]).includes(value)
}
