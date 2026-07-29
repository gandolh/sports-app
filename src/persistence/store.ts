/**
 * The local store: the one place the state document is read from and written to
 * browser storage.
 *
 * ── Why `localStorage` and not IndexedDB ────────────────────────────────────
 *
 * This is a deliberate choice, not an oversight, and it should not be
 * "upgraded" by reflex:
 *
 *   - **Size is a non-issue.** The document is one JSON object holding a few
 *     hundred sessions. Nine sessions serialise to ~5 KB; five years of
 *     three-a-week training lands in the low hundreds of KB, comfortably inside
 *     the ~5 MB localStorage budget every browser gives an origin.
 *   - **The API is synchronous**, so `load()` cannot be half-done when the first
 *     render happens, and there is no await-ordering hazard between a session
 *     save and a navigation away.
 *   - **It is trivially testable.** A three-method fake replaces it completely,
 *     which is what lets the crash-safety paths below be tested rather than
 *     reasoned about.
 *   - **IndexedDB's complexity buys nothing here.** Object stores, versioned
 *     `onupgradeneeded` schema migrations, transactions, and cursors are the
 *     right tools for many records with partial reads. We have exactly one
 *     record and always read all of it.
 *
 * IndexedDB is *not* more durable, either — it is evicted under storage
 * pressure and cleared by "clear site data" just like localStorage. Durability
 * comes from the export file and from the SQLite sync service (brief 11), not
 * from picking a different browser API.
 *
 * ── Crash-safe save ────────────────────────────────────────────────────────
 *
 * `save` writes to a shadow key, verifies the value reads back and parses, and
 * only then promotes it to the live key. The shadow key is removed last.
 *
 * The threat this actually defends against is not a torn `setItem` — that write
 * is synchronous and atomic per key. It is **promoting a document that is
 * already wrong**: a `NaN` target, an out-of-range rung index after a bad edit,
 * a serialiser bug. Those pass `setItem` happily and destroy the only copy of
 * the history. Verify-then-promote turns that into a refused save with an error
 * message, leaving the previous good document exactly where it was. The shadow
 * key additionally means an interrupted save leaves a complete, parseable copy
 * that `load()` picks up (see `status: 'recovered'`).
 *
 * ── Never overwrite a document you could not read ──────────────────────────
 *
 * If the live key holds text that fails to `parse`, this module goes read-only
 * and refuses to write. The corrupt text is the user's only copy of their
 * training history and is usually hand-repairable — a stray comma, a deleted
 * line. An app that "recovers" by writing a fresh empty document over it has
 * destroyed months of work to avoid showing an error message. Overwriting
 * requires an explicit `allowOverwriteCorrupt`, which only the confirmed import
 * flow passes.
 */
import type { IsoTimestamp, StateDoc } from '../domain/types.ts'
import { LADDERS } from '../domain/ladders.ts'
import type { ParseResult } from './codec.ts'
import { emptyDoc as buildEmptyDoc, parse, serialise } from './codec.ts'

// ─── Keys ───────────────────────────────────────────────────────────────────

/**
 * Versioned by schema generation, so a future breaking format can land beside
 * the old one rather than on top of it. Exported because brief 11's sync and any
 * manual devtools rescue need to name them.
 */
export const STORAGE_KEYS = {
  /** The live document. The only copy that matters. */
  live: 'sports-app.state.v1',
  /** Written and verified before the live key is touched. */
  shadow: 'sports-app.state.shadow.v1',
  /** Advisory only — last save time. Losing it costs nothing. */
  meta: 'sports-app.meta.v1',
} as const

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
 */
function resolveStorage(options: StoreOptions): StorageLike | null {
  if (options.storage) return options.storage
  try {
    const candidate = globalThis.localStorage
    return candidate ?? null
  } catch {
    return null
  }
}

// ─── Read-only latch ────────────────────────────────────────────────────────

let readOnlyReasonText: string | null = null

/**
 * True when this module will refuse to write. Set when the live document cannot
 * be parsed, or when storage is unavailable. The UI surfaces it as a banner —
 * silently dropping saves would be far worse than a visible read-only mode.
 */
export function isReadOnly(): boolean {
  return readOnlyReasonText !== null
}

export function readOnlyReason(): string | null {
  return readOnlyReasonText
}

/**
 * Release the latch. Called on a successful `load` and after a confirmed
 * import — i.e. only once the app is holding a document it fully understands.
 */
export function clearReadOnly(): void {
  readOnlyReasonText = null
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
  /** Nothing stored yet. First run, or storage was cleared. */
  | { readonly status: 'empty' }
  /**
   * The live text is present and unreadable. `rawText` is the stored bytes,
   * unmodified — hand it to the user for repair or export. Nothing was written.
   */
  | { readonly status: 'corrupt'; readonly error: string; readonly rawText: string }
  /** Storage itself is unreachable. The app runs, in memory, read-only. */
  | { readonly status: 'unavailable'; readonly error: string }

/** Reads the live document. Never throws. Never writes. */
export function load(options: StoreOptions = {}): LoadResult {
  const storage = resolveStorage(options)
  if (!storage) {
    readOnlyReasonText =
      'Browser storage is unavailable, so nothing can be saved. ' +
      'Private browsing or blocked cookies are the usual cause. Export before you close the tab.'
    return { status: 'unavailable', error: readOnlyReasonText }
  }

  let liveText: string | null
  try {
    liveText = storage.getItem(STORAGE_KEYS.live)
  } catch (cause) {
    readOnlyReasonText = `Browser storage could not be read: ${messageOf(cause)}`
    return { status: 'unavailable', error: readOnlyReasonText }
  }

  if (liveText === null) {
    // No live document. A parseable shadow means a save was interrupted after
    // the shadow was written but before promotion — that copy is verified-good,
    // so use it rather than starting from zero.
    const shadow = readAndParse(storage, STORAGE_KEYS.shadow)
    if (shadow?.ok === true) {
      clearReadOnly()
      return { status: 'recovered', doc: shadow.doc }
    }
    clearReadOnly()
    return { status: 'empty' }
  }

  const result = parseDoc(liveText)
  if (result.ok) {
    clearReadOnly()
    return { status: 'loaded', doc: result.doc }
  }

  // Do not touch the live key. Not to repair it, not to move it aside, not to
  // back it up — any write is a chance to make it worse, and the caller can
  // export `rawText` verbatim if it wants a copy.
  readOnlyReasonText =
    `The saved training history could not be read, so the app is read-only to ` +
    `avoid overwriting it. The stored file is untouched.\n\n${result.error}`
  return { status: 'corrupt', error: result.error, rawText: liveText }
}

function readAndParse(storage: StorageLike, key: string): ParseResult | null {
  let text: string | null
  try {
    text = storage.getItem(key)
  } catch {
    return null
  }
  if (text === null) return null
  return parseDoc(text)
}

/** Always validates against the real ladder content, so bounds are enforced. */
function parseDoc(text: string): ParseResult {
  return parse(text, { ladders: LADDERS })
}

/** A fresh document with every ladder at rung 0 and its target at the minimum. */
export function emptyDoc(): StateDoc {
  return buildEmptyDoc(LADDERS)
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
 * Write the document. Never throws.
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

  // 1 — serialise
  let text: string
  try {
    text = serialise(doc)
  } catch (cause) {
    return { ok: false, error: `Could not serialise the document: ${messageOf(cause)}` }
  }

  // 2 — verify the text reads back as the same shape before it goes anywhere
  // near storage. This is the step that catches a NaN target or an out-of-range
  // rung index while the previous good document is still intact.
  const verified = parseDoc(text)
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
    if (readOnlyReasonText !== null) {
      return { ok: false, error: `Refusing to save while read-only.\n\n${readOnlyReasonText}` }
    }
    const existing = readAndParse(storage, STORAGE_KEYS.live)
    if (existing !== null && existing.ok === false) {
      readOnlyReasonText =
        `The saved training history could not be read, so the app is read-only to ` +
        `avoid overwriting it. The stored file is untouched.\n\n${existing.error}`
      return { ok: false, error: `Refusing to save over a document that could not be read.\n\n${existing.error}` }
    }
  }

  // 4 — shadow write
  try {
    storage.setItem(STORAGE_KEYS.shadow, text)
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
    shadowText = storage.getItem(STORAGE_KEYS.shadow)
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
  const shadowParsed = parseDoc(shadowText)
  if (!shadowParsed.ok) {
    return {
      ok: false,
      error: `Refusing to save: the staged copy did not parse.\n\n${shadowParsed.error}`,
    }
  }

  // 6 — promote, then verify the promotion actually took.
  try {
    storage.setItem(STORAGE_KEYS.live, shadowText)
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
    liveText = storage.getItem(STORAGE_KEYS.live)
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
    storage.removeItem(STORAGE_KEYS.shadow)
  } catch {
    // Harmless: a stale shadow is only ever read when the live key is missing.
  }

  const savedAt = options.now ?? new Date().toISOString()
  writeMeta(storage, { lastSavedAt: savedAt })
  clearReadOnly()
  return { ok: true, savedAt, bytes: text.length }
}

// ─── Advisory metadata ──────────────────────────────────────────────────────

export interface StoreMeta {
  readonly lastSavedAt: IsoTimestamp | null
}

/**
 * Kept out of the state document on purpose: `types.ts` is a cross-brief
 * contract this brief may not edit, and "when did this browser last write"
 * is a property of *this device*, not of the training history. A synced
 * document must not carry another device's save time.
 */
export function readMeta(options: StoreOptions = {}): StoreMeta {
  const storage = resolveStorage(options)
  if (!storage) return { lastSavedAt: null }
  try {
    const text = storage.getItem(STORAGE_KEYS.meta)
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

function writeMeta(storage: StorageLike, meta: StoreMeta): void {
  try {
    storage.setItem(STORAGE_KEYS.meta, JSON.stringify(meta))
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
