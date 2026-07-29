/**
 * The local store: the one place a state document is read from and written to
 * browser storage.
 *
 * ── One document per username ───────────────────────────────────────────────
 *
 * v3 made the app multi-user (corpus/wiki/technical-decisions.md, "Authentication
 * is a nameplate, not a boundary"), so this module holds one document *per
 * username* rather than one document. Every function therefore names its subject:
 * `load` and `readMeta` take a username, and `save` reads it from the document it
 * was handed. That last one is deliberate — taking a username *and* a document
 * would create a pair that can disagree, and the disagreement would write one
 * person's training history into another person's key.
 *
 * "Which username is this browser acting as" is a different question and is
 * answered by exactly one module, `session.ts`. Nothing here reaches for it.
 *
 * ── Why `localStorage` and not IndexedDB ────────────────────────────────────
 *
 * This is a deliberate choice, not an oversight, and it should not be
 * "upgraded" by reflex:
 *
 *   - **Size is a non-issue.** The document is one JSON object holding a few
 *     hundred sessions. Nine sessions serialise to ~4 KB; five years of daily
 *     training lands in the low hundreds of KB, comfortably inside the ~5 MB
 *     localStorage budget every browser gives an origin — and v3's records are
 *     *smaller* than v2's, because a set is now a count rather than an object.
 *   - **The API is synchronous**, so `load()` cannot be half-done when the first
 *     render happens, and there is no await-ordering hazard between a session
 *     save and a navigation away.
 *   - **It is trivially testable.** A three-method fake replaces it completely,
 *     which is what lets the crash-safety paths below be tested rather than
 *     reasoned about.
 *   - **IndexedDB's complexity buys nothing here.** Object stores, versioned
 *     `onupgradeneeded` schema migrations, transactions, and cursors are the
 *     right tools for many records with partial reads. We have one record per
 *     user and always read all of it.
 *
 * IndexedDB is *not* more durable, either — it is evicted under storage
 * pressure and cleared by "clear site data" just like localStorage. Durability
 * comes from the export file and from the SQLite sync service, not from picking a
 * different browser API.
 *
 * ── Crash-safe save ────────────────────────────────────────────────────────
 *
 * `save` writes to a shadow key, verifies the value reads back and parses, and
 * only then promotes it to the live key. The shadow key is removed last.
 *
 * The threat this actually defends against is not a torn `setItem` — that write
 * is synchronous and atomic per key. It is **promoting a document that is
 * already wrong**: a `NaN` counter, a negative `cyclePosition` after a bad edit,
 * a serialiser bug. Those pass `setItem` happily and destroy the only copy of
 * the history. Verify-then-promote turns that into a refused save with an error
 * message, leaving the previous good document exactly where it was. The shadow
 * key additionally means an interrupted save leaves a complete, parseable copy
 * that `load()` picks up (see `status: 'recovered'`).
 *
 * ── Never overwrite a document you could not read ──────────────────────────
 *
 * If a live key holds text that fails to `parse`, this module goes read-only for
 * **that username** and refuses to write it. The corrupt text is the user's only
 * copy of their training history and is usually hand-repairable — a stray comma,
 * a deleted line. An app that "recovers" by writing a fresh empty document over
 * it has destroyed months of work to avoid showing an error message. Overwriting
 * requires an explicit `allowOverwriteCorrupt`, which only the confirmed import
 * flow passes.
 *
 * The latch is per username because one person's broken file must not lock
 * everybody else out of a shared browser.
 */
import type { IsoTimestamp, StateDoc } from '../domain/types.ts'
import type { ParseResult } from './codec.ts'
import { emptyDoc as buildEmptyDoc, parse, serialise } from './codec.ts'

// ─── Keys ───────────────────────────────────────────────────────────────────

/**
 * Versioned by schema generation, so a breaking format lands *beside* the old one
 * rather than on top of it. That promise is what makes the v2→v3 upgrade safe:
 * see `LEGACY_STORAGE_KEYS`.
 *
 * Exported because sync, the import/export flow and any manual devtools rescue
 * need to name them.
 */
export const STORAGE_KEYS = {
  /** The live document for one user. The only copy that matters. */
  live: (username: string): string => `sports-app.state.v3.${encodeUsernameForKey(username)}`,
  /** Written and verified before that user's live key is touched. */
  shadow: (username: string): string =>
    `sports-app.state.shadow.v3.${encodeUsernameForKey(username)}`,
  /** Advisory only — last save time. Losing it costs nothing. */
  meta: (username: string): string => `sports-app.meta.v3.${encodeUsernameForKey(username)}`,
} as const

/**
 * The single-document keys used up to v2, **read and never written**.
 *
 * Before v3 a browser held exactly one document and the key said nothing about
 * whose it was. `load` falls back to these when the requested user has no v3
 * document, so upgrading the app does not make six months of training invisible —
 * that fallback is the only reason the v2→v3 migration in `codec.ts` is reachable
 * in production at all.
 *
 * **Nothing ever removes them.** It is tempting to retire the old key after the
 * first successful v3 save, and it would be wrong: on a shared browser the first
 * person to log in after the upgrade may not be the person whose document that
 * is, and their save would then delete somebody else's only copy. A few
 * kilobytes of stale text is a much better outcome. `load` returns
 * `status: 'migrated'` so the UI can ask whose it is rather than assuming.
 */
export const LEGACY_STORAGE_KEYS = {
  live: 'sports-app.state.v1',
  shadow: 'sports-app.state.shadow.v1',
} as const

/**
 * The characters a username may contribute to a storage key directly. Anything
 * else is percent-encoded.
 *
 * Note what is missing: **`.` is not safe here**, even though it is legal in a
 * username. The key format is `<prefix>.<encoded username>`, and the prefixes
 * differ from each other only in dot-separated segments — so if `.` survived
 * encoding, the username `shadow.v3.alice` would produce a *live* key byte-identical
 * to the *shadow* key of user `alice`, and one user could stage a save straight
 * into another user's promotion path. Percent-encoding `.` is what makes the
 * number of segments in a key fixed, and the encoded username therefore
 * unambiguously the whole final segment.
 */
const KEY_SAFE_CHARACTER = /^[a-z0-9_-]$/

/**
 * Injective, and deliberately not reversible in code.
 *
 * Injective because `%` itself is not in the safe set, so it is escaped to `%25`
 * before any escape sequence exists — no input can forge the encoding of a
 * different input. Not reversible because nothing needs to enumerate users:
 * `session.ts` stores the current username as plain text, so a decoder would be
 * an unused function that a future reader would trust.
 *
 * The empty string encodes to the empty string, giving a key that ends in its
 * separator. That is a legal, distinct, unreachable-by-any-valid-username key —
 * an empty username never passes `isValidUsername`, so it can only arrive from a
 * caller that skipped validation, and answering with an isolated key is a better
 * failure than throwing inside a storage helper.
 */
function encodeUsernameForKey(username: string): string {
  let out = ''
  // Iterating the string yields whole code points, so an astral character is
  // encoded as one UTF-8 sequence rather than two broken halves.
  for (const character of username) {
    out += KEY_SAFE_CHARACTER.test(character) ? character : percentEncode(character)
  }
  return out
}

function percentEncode(character: string): string {
  let out = ''
  for (const byte of new TextEncoder().encode(character)) {
    out += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`
  }
  return out
}

// ─── Storage plumbing ───────────────────────────────────────────────────────

/** The three methods this module uses. A test fake implements exactly this. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface StoreOptions {
  /** Defaults to `localStorage`. Injected in tests. */
  readonly storage?: StorageLike | undefined
}

/**
 * Accessing `localStorage` can *throw*, not merely be absent — Safari with
 * cookies blocked and some embedded webviews do exactly that. So even reaching
 * for it is wrapped.
 *
 * Exported for `session.ts`, which stores the current username and needs the same
 * guard; a second copy of this `try` is a second place to get it wrong.
 */
export function resolveStorage(options: StoreOptions): StorageLike | null {
  if (options.storage) return options.storage
  try {
    const candidate = globalThis.localStorage
    return candidate ?? null
  } catch {
    return null
  }
}

// ─── Read-only latch ────────────────────────────────────────────────────────

/**
 * Keyed by username: one person's unreadable document must not stop anybody else
 * from saving. Absent means "will write".
 */
const readOnlyReasons = new Map<string, string>()

/**
 * True when this module will refuse to write `username`'s document. Set when
 * their live document cannot be parsed, or when storage is unavailable. The UI
 * surfaces it as a banner — silently dropping saves would be far worse than a
 * visible read-only mode.
 */
export function isReadOnly(username: string): boolean {
  return readOnlyReasons.has(username)
}

export function readOnlyReason(username: string): string | null {
  return readOnlyReasons.get(username) ?? null
}

/**
 * Release the latch. Called on a successful `load` and after a confirmed
 * import — i.e. only once the app is holding a document it fully understands.
 *
 * With no argument it releases *every* user's latch, which is what a logout and a
 * test `beforeEach` want. That is safe rather than a shortcut: the latch is a
 * memory of a failed read, not the guard itself — `save` re-reads the live key and
 * re-latches if it is still unreadable (step 3), so clearing it can at worst cost
 * one refused save.
 */
export function clearReadOnly(username?: string): void {
  if (username === undefined) readOnlyReasons.clear()
  else readOnlyReasons.delete(username)
}

// ─── load ───────────────────────────────────────────────────────────────────

export type LoadResult =
  /** Normal path. */
  | { readonly status: 'loaded'; readonly doc: StateDoc }
  /**
   * The live key was absent but a complete shadow copy was there: a save was
   * interrupted between writing the shadow and promoting it.
   */
  | { readonly status: 'recovered'; readonly doc: StateDoc }
  /**
   * This user has no v3 document, but the browser holds the single pre-v3
   * document from before the app had accounts. It has been migrated to v3 and
   * **attributed to the username that asked for it** — v2 had one user, so there
   * is no owner recorded anywhere to recover. Nothing was written: the caller
   * should save, and may want to confirm with the user first, because on a shared
   * browser the document may not be theirs.
   */
  | { readonly status: 'migrated'; readonly doc: StateDoc }
  /** Nothing stored for this user. First run, or storage was cleared. */
  | { readonly status: 'empty' }
  /**
   * The stored text is present and unreadable — or readable and belongs to
   * somebody else. `rawText` is the stored bytes, unmodified — hand it to the
   * user for repair or export. Nothing was written.
   */
  | { readonly status: 'corrupt'; readonly error: string; readonly rawText: string }
  /** Storage itself is unreachable. The app runs, in memory, read-only. */
  | { readonly status: 'unavailable'; readonly error: string }

/** Reads one user's live document. Never throws. Never writes. */
export function load(username: string, options: StoreOptions = {}): LoadResult {
  const storage = resolveStorage(options)
  if (!storage) {
    const reason =
      'Browser storage is unavailable, so nothing can be saved. ' +
      'Private browsing or blocked cookies are the usual cause. Export before you close the tab.'
    readOnlyReasons.set(username, reason)
    return { status: 'unavailable', error: reason }
  }

  let liveText: string | null
  try {
    liveText = storage.getItem(STORAGE_KEYS.live(username))
  } catch (cause) {
    const reason = `Browser storage could not be read: ${messageOf(cause)}`
    readOnlyReasons.set(username, reason)
    return { status: 'unavailable', error: reason }
  }

  if (liveText !== null) {
    return acceptLive(username, liveText)
  }

  // No live document. A parseable shadow means a save was interrupted after the
  // shadow was written but before promotion — that copy is verified-good, so use
  // it rather than starting from zero. A shadow that does *not* parse is ignored
  // rather than reported: it is a staging copy the live key never took, so it is
  // not evidence that anybody's history is broken.
  const shadow = readAndParse(storage, STORAGE_KEYS.shadow(username), username)
  if (shadow?.ok === true && shadow.doc.username === username) {
    clearReadOnly(username)
    return { status: 'recovered', doc: shadow.doc }
  }

  // Nothing of this user's under the v3 keys. The pre-v3 single-document keys are
  // the last place a real history can be, and the one place the v2→v3 migration
  // gets to run for real.
  for (const legacyKey of [LEGACY_STORAGE_KEYS.live, LEGACY_STORAGE_KEYS.shadow]) {
    const legacyText = read(storage, legacyKey)
    if (legacyText === null) continue
    const parsed = parseDoc(legacyText, username)
    if (parsed.ok) {
      // A genuinely pre-v3 document carries no owner, so the migration attributed
      // it to this user and this comparison is automatic. It can only fail if
      // somebody pasted a *v3* document into the old key — in which case it is
      // somebody else's, and skipping it is right: it is not evidence that this
      // user's history is broken.
      if (parsed.doc.username !== username) continue
      clearReadOnly(username)
      return { status: 'migrated', doc: parsed.doc }
    }
    if (legacyKey === LEGACY_STORAGE_KEYS.live) {
      // Loud, not silent. This text is somebody's entire training history in a
      // format this build understands; failing to read it is worth read-only mode
      // and an error a person can act on, even for a user who has never saved.
      const reason =
        `A training history saved before this app had accounts could not be read, ` +
        `so the app is read-only to avoid writing over it. The stored file is ` +
        `untouched.\n\n${parsed.error}`
      readOnlyReasons.set(username, reason)
      return { status: 'corrupt', error: parsed.error, rawText: legacyText }
    }
  }

  clearReadOnly(username)
  return { status: 'empty' }
}

/**
 * Parse stored text and confirm it belongs to the user we asked about.
 *
 * The ownership check is not paranoia about the encoding: a hand-edit that
 * changes `username` inside the file, or a document pasted into the wrong key by
 * hand in devtools, both land here. Treating it as corrupt is right — the text is
 * perfectly readable, but it is *not this user's document*, and writing this
 * user's session into that key would overwrite whoever it does belong to.
 */
function acceptLive(username: string, text: string): LoadResult {
  const result = parseDoc(text, username)
  if (result.ok && result.doc.username === username) {
    clearReadOnly(username)
    return { status: 'loaded', doc: result.doc }
  }

  if (result.ok) {
    const error =
      `The stored document says it belongs to "${result.doc.username}", not ` +
      `"${username}". Nothing was changed.`
    readOnlyReasons.set(
      username,
      `${error} The app is read-only rather than overwriting a document that may ` +
        `be somebody else's only copy.`,
    )
    return { status: 'corrupt', error, rawText: text }
  }

  // Do not touch the stored key. Not to repair it, not to move it aside, not to
  // back it up — any write is a chance to make it worse, and the caller can
  // export `rawText` verbatim if it wants a copy.
  readOnlyReasons.set(
    username,
    `The saved training history could not be read, so the app is read-only to ` +
      `avoid overwriting it. The stored file is untouched.\n\n${result.error}`,
  )
  return { status: 'corrupt', error: result.error, rawText: text }
}

function read(storage: StorageLike, key: string): string | null {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

function readAndParse(storage: StorageLike, key: string, username: string): ParseResult | null {
  const text = read(storage, key)
  if (text === null) return null
  return parseDoc(text, username)
}

/**
 * `username` is only consulted for a **pre-v3** document, which has no owner
 * recorded in it. A v3 document carries its own, and `accept` compares the two.
 */
function parseDoc(text: string, username: string): ParseResult {
  return parse(text, { username })
}

/**
 * A fresh document for `username`: every counter at zero.
 *
 * A one-line delegation, kept so the shell has a single module to import for
 * "read, write, or start a document". It used to inject the ladder content;
 * `codec.emptyDoc` no longer needs any, because v3 stores nothing derived.
 */
export function emptyDoc(username: string): StateDoc {
  return buildEmptyDoc(username)
}

// ─── save ───────────────────────────────────────────────────────────────────

export type SaveResult =
  | { readonly ok: true; readonly savedAt: IsoTimestamp; readonly bytes: number }
  | { readonly ok: false; readonly error: string }

export interface SaveOptions extends StoreOptions {
  /**
   * Overwrite a live document that fails to parse. Only the import flow passes
   * this, and only after the user has confirmed a summary of what replaces it.
   */
  readonly allowOverwriteCorrupt?: boolean | undefined
  /** Injected in tests; defaults to the wall clock. */
  readonly now?: IsoTimestamp | undefined
}

/**
 * Write the document. Never throws. The keys come from `doc.username`.
 *
 * Order matters and each step is a guard, not ceremony:
 *
 *   1. serialise
 *   2. parse the serialised text — refuse a document that cannot be read back
 *   3. refuse if the existing live document is unreadable (unless forced)
 *   4. write the shadow key
 *   5. read the shadow back, compare byte-for-byte, and parse it
 *   6. promote to the live key, and verify that too
 *   7. remove the shadow
 *
 * A failure at any step before 6 leaves the live key exactly as it was. A
 * failure at 6 leaves the shadow in place, and `load()` will recover from it.
 */
export function save(doc: StateDoc, options: SaveOptions = {}): SaveResult {
  const storage = resolveStorage(options)
  if (!storage) {
    return {
      ok: false,
      error:
        'Browser storage is unavailable, so this could not be saved. ' +
        'Export the document to a file before closing the tab.',
    }
  }

  const username = doc.username
  const liveKey = STORAGE_KEYS.live(username)
  const shadowKey = STORAGE_KEYS.shadow(username)

  // 1 — serialise
  let text: string
  try {
    text = serialise(doc)
  } catch (cause) {
    return { ok: false, error: `Could not serialise the document: ${messageOf(cause)}` }
  }

  // 2 — verify the text reads back as the same shape before it goes anywhere
  // near storage. This is the step that catches a NaN counter or a username the
  // sync service would refuse, while the previous good document is still intact.
  const verified = parseDoc(text, username)
  if (!verified.ok) {
    return {
      ok: false,
      error:
        `Refusing to save: the document did not read back correctly, so it was ` +
        `not written and the previously saved history is untouched.\n\n${verified.error}`,
    }
  }

  // 3 — never write over something we could not read, unless told to.
  if (options.allowOverwriteCorrupt !== true) {
    const latched = readOnlyReasons.get(username)
    if (latched !== undefined) {
      return { ok: false, error: `Refusing to save while read-only.\n\n${latched}` }
    }
    const existing = readAndParse(storage, liveKey, username)
    if (existing !== null && existing.ok === false) {
      readOnlyReasons.set(
        username,
        `The saved training history could not be read, so the app is read-only to ` +
          `avoid overwriting it. The stored file is untouched.\n\n${existing.error}`,
      )
      return {
        ok: false,
        error: `Refusing to save over a document that could not be read.\n\n${existing.error}`,
      }
    }
  }

  // 4 — shadow write
  try {
    storage.setItem(shadowKey, text)
  } catch (cause) {
    return {
      ok: false,
      error:
        `Could not write to browser storage: ${messageOf(cause)}. ` +
        `Nothing was changed — the previously saved history is intact. ` +
        `If storage is full, export and then clear other site data.`,
    }
  }

  // 5 — read the shadow back. A storage layer that quietly truncated or dropped
  // the value must not be trusted with the live key.
  let shadowText: string | null
  try {
    shadowText = storage.getItem(shadowKey)
  } catch (cause) {
    return { ok: false, error: `Could not read back the staged save: ${messageOf(cause)}` }
  }
  if (shadowText !== text) {
    return {
      ok: false,
      error:
        `Refusing to save: the staged copy read back different from what was ` +
        `written (${text.length} bytes out, ${shadowText === null ? 'nothing' : `${shadowText.length} bytes`} back). ` +
        `The previously saved history is untouched.`,
    }
  }
  const shadowParsed = parseDoc(shadowText, username)
  if (!shadowParsed.ok) {
    return {
      ok: false,
      error: `Refusing to save: the staged copy did not parse.\n\n${shadowParsed.error}`,
    }
  }

  // 6 — promote, then verify the promotion actually took.
  try {
    storage.setItem(liveKey, shadowText)
  } catch (cause) {
    return {
      ok: false,
      error:
        `Could not promote the staged save: ${messageOf(cause)}. ` +
        `A complete copy is staged and will be recovered on next load.`,
    }
  }
  let liveText: string | null
  try {
    liveText = storage.getItem(liveKey)
  } catch (cause) {
    return { ok: false, error: `Could not verify the save: ${messageOf(cause)}` }
  }
  if (liveText !== text) {
    return {
      ok: false,
      error:
        `The save did not verify: storage returned different content than was ` +
        `written. A complete copy is staged and will be recovered on next load.`,
    }
  }

  // 7 — the shadow has served its purpose. Removing it last means there is never
  // a moment where neither key holds a complete document.
  try {
    storage.removeItem(shadowKey)
  } catch {
    // Harmless: a stale shadow is only ever read when the live key is missing.
  }

  const savedAt = options.now ?? new Date().toISOString()
  writeMeta(storage, username, { lastSavedAt: savedAt })
  clearReadOnly(username)
  return { ok: true, savedAt, bytes: text.length }
}

// ─── Advisory metadata ──────────────────────────────────────────────────────

export interface StoreMeta {
  readonly lastSavedAt: IsoTimestamp | null
}

/**
 * Kept out of the state document on purpose: "when did this browser last write"
 * is a property of *this device*, not of the training history, and `types.ts` is
 * a cross-brief contract this module may not edit. A synced document must not
 * carry another device's save time.
 */
export function readMeta(username: string, options: StoreOptions = {}): StoreMeta {
  const storage = resolveStorage(options)
  if (!storage) return { lastSavedAt: null }
  try {
    const text = storage.getItem(STORAGE_KEYS.meta(username))
    if (text === null) return { lastSavedAt: null }
    const raw: unknown = JSON.parse(text)
    if (typeof raw === 'object' && raw !== null && 'lastSavedAt' in raw) {
      const value = (raw as { lastSavedAt: unknown }).lastSavedAt
      if (typeof value === 'string') return { lastSavedAt: value }
    }
  } catch {
    // Advisory only. An unreadable meta key must never block a load.
  }
  return { lastSavedAt: null }
}

function writeMeta(storage: StorageLike, username: string, meta: StoreMeta): void {
  try {
    storage.setItem(STORAGE_KEYS.meta(username), JSON.stringify(meta))
  } catch {
    // Never fail a good save because the advisory metadata would not fit.
  }
}

// ─── navigator.storage.persist() ────────────────────────────────────────────

export interface PersistenceOutcome {
  /** `null` means the browser has no Storage Manager — nothing was requested. */
  readonly granted: boolean | null
  /** True when `doc` differs from the input and should be saved. */
  readonly changed: boolean
  readonly doc: StateDoc
  readonly note: string
}

/**
 * Ask the browser to exempt this origin from eviction, once.
 *
 * "Once" is the point: `settings.persistGranted` starts at `null` (never asked)
 * and is written with the answer, so a denial is remembered instead of
 * re-prompting on every launch. The result is recorded *in the document* so it
 * is visible in Settings and in the exported file — a user whose history
 * silently evaporated deserves to be able to see that the browser had refused
 * to protect it.
 *
 * Persistence is granted per origin, not per user, so the first user to ask
 * settles it for everybody; the answer is still recorded in each document,
 * because each document is separately exportable and the fact belongs with it.
 *
 * Never throws, and a missing Storage Manager leaves `persistGranted` at `null`
 * rather than writing `false`: "this browser cannot say" and "this browser said
 * no" are different facts.
 */
export async function requestPersistentStorage(doc: StateDoc): Promise<PersistenceOutcome> {
  if (doc.settings.persistGranted !== null) {
    return {
      granted: doc.settings.persistGranted,
      changed: false,
      doc,
      note: doc.settings.persistGranted
        ? 'Storage is marked persistent; the browser should not evict it.'
        : 'The browser previously declined persistent storage. Export or sync regularly.',
    }
  }

  const manager = readStorageManager()
  if (!manager) {
    return {
      granted: null,
      changed: false,
      doc,
      note: 'This browser has no persistent-storage API, so eviction cannot be ruled out. Export or sync regularly.',
    }
  }

  let granted: boolean
  try {
    granted = (await manager.persisted?.()) === true ? true : (await manager.persist()) === true
  } catch {
    return {
      granted: null,
      changed: false,
      doc,
      note: 'The persistent-storage request failed. Export or sync regularly.',
    }
  }

  return {
    granted,
    changed: true,
    doc: { ...doc, settings: { ...doc.settings, persistGranted: granted } },
    note: granted
      ? 'Storage is now marked persistent; the browser should not evict it.'
      : 'The browser declined persistent storage. Your history can be evicted — export or sync regularly.',
  }
}

interface StorageManagerLike {
  persist(): Promise<boolean>
  persisted?: () => Promise<boolean>
}

function readStorageManager(): StorageManagerLike | null {
  try {
    const nav = globalThis.navigator as Navigator | undefined
    const storage = nav?.storage as StorageManagerLike | undefined
    if (!storage || typeof storage.persist !== 'function') return null
    return storage
  } catch {
    return null
  }
}

// ─── Shared ─────────────────────────────────────────────────────────────────

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}
