/**
 * Snapshot storage for the state document.
 *
 * ── Why whole-document snapshot rows and not normalised tables ───────────────
 *
 * This is a locked decision (corpus/wiki/decisions.md § "Durability: a SQLite
 * service holding JSON snapshot rows"), not a shortcut:
 *
 *   - `src/persistence/codec.ts` already owns validation and the canonical
 *     shape, and `schemaVersion` lives *inside* the JSON. A
 *     `sessions`/`sets`/`ladders` schema here would be a **second source of
 *     truth for shape**, and would have to duplicate every rule the codec
 *     already enforces — including the ones the codec deliberately does *not*
 *     enforce, which a foreign key would silently start enforcing.
 *   - Snapshot rows give free version history at no design cost.
 *   - The document stays extractable with one query
 *     (`sqlite3 db/app.db 'SELECT doc_json FROM snapshots ORDER BY id DESC LIMIT 1'`),
 *     so the "state is one hand-editable JSON document" invariant survives
 *     having a database in the picture at all.
 *
 * The trade-off, stated plainly: no SQL queryability over individual sessions.
 * That costs nothing — the charts screen reads the in-memory document. If it
 * ever matters, derive tables *from* the snapshots rather than replacing them.
 *
 * ── Bytes in, same bytes out ─────────────────────────────────────────────────
 *
 * `doc_json` holds the request body **verbatim**. It is never re-serialised on
 * the way in or the way out. `serialise` in the codec is byte-stable and its
 * output is meant to be read by a human — key order, one-line ladder states,
 * blank lines between sections, trailing newline. Round-tripping through
 * `JSON.parse`/`JSON.stringify` here would destroy all of that while still
 * being "valid JSON", and the app's own export file would stop matching what
 * the service holds. The server parses only to *check*, never to rewrite.
 *
 * ── Zero dependencies, on purpose ────────────────────────────────────────────
 *
 * `node:sqlite` is built in. No `better-sqlite3` native build, nothing to
 * compile, nothing to pin, nothing to rebuild after a Node upgrade. It prints
 * an experimental warning on startup; that warning is the entire price and it
 * is not a reason to add a dependency.
 */
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SERVICE_DIR = dirname(fileURLToPath(import.meta.url))

/** The repository root — the service lives in `server/` beneath it. */
export const PROJECT_ROOT = resolve(SERVICE_DIR, '..')

/**
 * The database directory. Gitignored — see `.gitignore`. It holds real training
 * history and must never end up in a commit.
 */
export const DEFAULT_DB_DIR = resolve(PROJECT_ROOT, 'db')

export const DEFAULT_DB_FILE = resolve(DEFAULT_DB_DIR, 'app.db')

/**
 * How many snapshots to keep.
 *
 * **This is a correctness-of-scale limit, not a tuning knob.** Every snapshot
 * embeds the *entire* history, so snapshot size grows linearly with sessions
 * completed and total database size grows **quadratically** with
 * retention × sessions. At three years of daily training one snapshot is
 * roughly a megabyte: 20 snapshots is ~20 MB, which is fine, and 1000 would be
 * multiple gigabytes for a single user's push-up log, which is not.
 *
 * 20 is chosen to be deep enough to undo a bad import or a hand-edit gone wrong
 * (a couple of weeks of pushes) and shallow enough that the quadratic term
 * never becomes the story. Raising it is a real capacity decision.
 */
export const RETENTION = 20

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS snapshots (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at         TEXT    NOT NULL,
    sessions_completed INTEGER NOT NULL,
    schema_version     INTEGER NOT NULL,
    doc_json           TEXT    NOT NULL
  );
`

const SELECT_LATEST = `
  SELECT id, created_at, sessions_completed, schema_version, doc_json
    FROM snapshots
   ORDER BY id DESC
   LIMIT 1
`

const INSERT_SNAPSHOT = `
  INSERT INTO snapshots (created_at, sessions_completed, schema_version, doc_json)
  VALUES (?, ?, ?, ?)
`

/**
 * Keep the newest `?` rows by `id` and delete the rest.
 *
 * Ordering by `id` rather than `created_at` is deliberate: `id` is a
 * monotonically increasing AUTOINCREMENT key, whereas `created_at` comes from
 * the server clock and can go backwards across an NTP correction. "The newest
 * row" must be a fact about insertion order, not about what the clock said.
 */
const PRUNE = `
  DELETE FROM snapshots
   WHERE id NOT IN (SELECT id FROM snapshots ORDER BY id DESC LIMIT ?)
`

/**
 * @typedef {object} Snapshot
 * @property {number} id
 * @property {string} createdAt
 * @property {number} sessionsCompleted
 * @property {number} schemaVersion
 * @property {string} docJson the stored bytes, verbatim
 */

/**
 * @typedef {object} SnapshotStore
 * @property {string} file            the database path actually opened
 * @property {number} retention
 * @property {() => Snapshot | null} latest
 * @property {(input: {docJson: string, sessionsCompleted: number, schemaVersion: number, createdAt?: string}) => {id: number, createdAt: string, pruned: number}} insert
 * @property {() => number} count
 * @property {() => number[]} ids     newest first; for tests and diagnostics
 * @property {() => void} close
 */

/**
 * Open (creating if absent) the snapshot database.
 *
 * @param {{file?: string, retention?: number}} [options]
 * @returns {SnapshotStore}
 */
export function openSnapshotStore(options = {}) {
  const file = options.file ?? DEFAULT_DB_FILE
  const retention = options.retention ?? RETENTION

  if (!Number.isInteger(retention) || retention < 1) {
    throw new Error(`retention must be a whole number >= 1, got ${String(retention)}`)
  }

  // The directory is created here rather than at startup so that every entry
  // point — the service, a test, a one-off script — gets the same behaviour.
  if (file !== ':memory:') {
    mkdirSync(dirname(file), { recursive: true })
  }

  const db = new DatabaseSync(file)

  // WAL for readers-don't-block-writers, and FULL synchronous because this
  // writes roughly once per workout. Durability beats throughput by several
  // orders of magnitude here: the cost is one fsync a day, and the thing being
  // protected is the only remaining copy of months of training after a phone is
  // lost. `:memory:` ignores journal_mode, which is harmless.
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = FULL')
  db.exec(SCHEMA)

  const selectLatest = db.prepare(SELECT_LATEST)
  const insertSnapshot = db.prepare(INSERT_SNAPSHOT)
  const prune = db.prepare(PRUNE)
  const countRows = db.prepare('SELECT COUNT(*) AS n FROM snapshots')
  const selectIds = db.prepare('SELECT id FROM snapshots ORDER BY id DESC')

  return {
    file,
    retention,

    latest() {
      const row = selectLatest.get()
      if (!row) return null
      return {
        id: Number(row.id),
        createdAt: String(row.created_at),
        sessionsCompleted: Number(row.sessions_completed),
        schemaVersion: Number(row.schema_version),
        docJson: String(row.doc_json),
      }
    },

    insert({ docJson, sessionsCompleted, schemaVersion, createdAt }) {
      const stamp = createdAt ?? new Date().toISOString()

      // Insert and prune in one transaction. Without it a crash between the two
      // leaves the cap exceeded — recoverable — but an interrupted prune could
      // in principle be observed by a concurrent reader as a gap. One
      // transaction makes "insert the new snapshot and drop the oldest" a
      // single visible event.
      db.exec('BEGIN IMMEDIATE')
      try {
        const info = insertSnapshot.run(stamp, sessionsCompleted, schemaVersion, docJson)
        const { changes } = prune.run(retention)
        db.exec('COMMIT')
        return { id: Number(info.lastInsertRowid), createdAt: stamp, pruned: Number(changes) }
      } catch (cause) {
        db.exec('ROLLBACK')
        throw cause
      }
    },

    count() {
      const row = countRows.get()
      return row ? Number(row.n) : 0
    },

    ids() {
      return selectIds.all().map((row) => Number(row.id))
    },

    close() {
      db.close()
    },
  }
}
