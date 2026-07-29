/**
 * Snapshot storage for the state document — one append-only stream per user.
 *
 * ── Why whole-document snapshot rows and not normalised tables ───────────────
 *
 * This is a locked decision (corpus/wiki/technical-decisions.md § "Durability: a
 * SQLite service holding JSON snapshot rows, one stream per user"), not a
 * shortcut:
 *
 *   - `client/src/persistence/codec.ts` already owns validation and the canonical
 *     shape, and `schemaVersion` lives *inside* the JSON. A
 *     `sessions`/`sets`/`ladders` schema here would be a **second source of
 *     truth for shape**, and would have to duplicate every rule the codec
 *     already enforces — including the ones the codec deliberately does *not*
 *     enforce, which a foreign key would silently start enforcing.
 *   - Snapshot rows give free version history at no design cost.
 *   - The document stays extractable with one query
 *     (`sqlite3 db/app.db "SELECT doc_json FROM snapshots WHERE username = 'alice' ORDER BY id DESC LIMIT 1"`),
 *     so the "state is one hand-editable JSON document per user" invariant
 *     survives having a database in the picture at all.
 *
 * Multi-user changes none of that reasoning. `username` is a **row key**, not a
 * foreign key into a users table — there is no users table, because there is
 * nothing about a user to store. The name is inside the document too, and the
 * document is authoritative; the column exists so "newest snapshot for this
 * person" is an index seek instead of a scan of everyone's history.
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
 * ── No storage dependency, on purpose ───────────────────────────────────────
 *
 * `node:sqlite` is built in. No `better-sqlite3` native build, nothing to
 * compile, nothing to pin, nothing to rebuild after a Node upgrade. It prints
 * an experimental warning on startup; that warning is the entire price and it
 * is not a reason to add a dependency.
 *
 * The service is no longer *literally* dependency-free — it takes
 * `@sports-app/shared` for the username rule (brief 21) and brief 22 adds Fastify
 * — but nothing about either touches the storage layer. `node:sqlite` stays.
 */
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
// The only import that is not a Node builtin, and it is deliberately types plus
// one regex: `shared/` may not touch `node:` anything, so importing it here can
// never drag a browser-hostile dependency into the bundle or a Node-only one into
// the client. Node ≥22.18 strips the types at load; there is no build step.
import { LEGACY_USERNAME, USERNAME_RULE, isValidUsername } from '@sports-app/shared/username.ts'

const SERVICE_DIR = dirname(fileURLToPath(import.meta.url))

/**
 * The repository root — the service is the `server/` workspace directly beneath
 * it. Unchanged by the workspace split: `server/` did not move, so `db/` is still
 * a sibling of it at the repo root and still gitignored.
 */
export const PROJECT_ROOT = resolve(SERVICE_DIR, '..')

/**
 * The database directory. Gitignored — see `.gitignore`. It holds real training
 * history and must never end up in a commit.
 */
export const DEFAULT_DB_DIR = resolve(PROJECT_ROOT, 'db')

export const DEFAULT_DB_FILE = resolve(DEFAULT_DB_DIR, 'app.db')

/**
 * How many snapshots to keep **per username**.
 *
 * **This is a correctness-of-scale limit, not a tuning knob.** Every snapshot
 * embeds the *entire* history, so snapshot size grows linearly with sessions
 * completed and total database size grows **quadratically** with
 * retention × sessions — and now linearly again with the number of users. At
 * three years of daily training one snapshot is roughly a megabyte: 20
 * snapshots is ~20 MB per person, which is fine, and 1000 would be multiple
 * gigabytes for a single user's push-up log, which is not.
 *
 * 20 is chosen to be deep enough to undo a bad import or a hand-edit gone wrong
 * (a couple of weeks of pushes) and shallow enough that the quadratic term
 * never becomes the story. Raising it is a real capacity decision.
 */
export const RETENTION = 20

// ─── Who a stream belongs to ────────────────────────────────────────────────
//
// The username rule used to be **defined here**, and defined a second time in the
// client's codec, with a test comparing the two regexes character for character to
// stop them drifting. Brief 21 replaced both copies with one definition in
// `@sports-app/shared/username.ts` that this service and the browser bundle both
// import, and deleted the drift test as meaningless.
//
// The reasoning behind the rule — why uppercase is rejected rather than folded,
// why the first character is constrained, why the cap is 32 — moved with the
// definition. What stays here is the one thing that is genuinely about *this*
// file: the assertion below, which is what makes interpolating `LEGACY_USERNAME`
// into DDL safe.
//
// It is imported and not re-exported: every consumer names `shared/` directly, so
// there is one definition reachable by one path rather than one definition behind
// two names.

if (!isValidUsername(LEGACY_USERNAME)) {
  // `LEGACY_USERNAME` is interpolated into DDL below, where a bound parameter is
  // not available. This assertion is what makes that interpolation safe: the
  // allowlist has no quote in it, so a constant that passes cannot carry one.
  throw new Error(`LEGACY_USERNAME must satisfy USERNAME_PATTERN, got ${LEGACY_USERNAME}`)
}

// ─── Schema ─────────────────────────────────────────────────────────────────

/**
 * `username` is **last on purpose**, and carries a default it is never inserted
 * with.
 *
 * `ALTER TABLE ... ADD COLUMN` can only append, so a database migrated from the
 * single-stream schema has `username` in last position with
 * `DEFAULT 'local'` attached. Declaring the fresh table the same way means a
 * migrated database and a brand-new one are the *same* schema — same column
 * order, same defaults — rather than two shapes that behave identically until
 * something reads `sqlite_master` or `SELECT *`. There is a test comparing
 * `PRAGMA table_info` between the two.
 *
 * `sessions_completed` keeps its name and now holds `history.length`. The v3
 * document dropped the `sessionsCompleted` field this column was populated from;
 * the length of the history *is* the number of sessions completed, so the column
 * still means what it says. Renaming it would rewrite a table holding real
 * training history to buy nothing.
 */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS snapshots (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at         TEXT    NOT NULL,
    sessions_completed INTEGER NOT NULL,
    schema_version     INTEGER NOT NULL,
    doc_json           TEXT    NOT NULL,
    username           TEXT    NOT NULL DEFAULT '${LEGACY_USERNAME}'
  );
`

/**
 * `(username, id DESC)` covers every query this service makes: the newest
 * snapshot for one person, that person's row count, and the per-user prune's
 * "which ids do I keep" subquery. Without it each of those scans everyone's
 * history.
 */
const INDEX = `
  CREATE INDEX IF NOT EXISTS snapshots_by_user_id ON snapshots (username, id DESC);
`

const SELECT_LATEST = `
  SELECT id, created_at, sessions_completed, schema_version, doc_json, username
    FROM snapshots
   WHERE username = ?
   ORDER BY id DESC
   LIMIT 1
`

const INSERT_SNAPSHOT = `
  INSERT INTO snapshots (created_at, sessions_completed, schema_version, doc_json, username)
  VALUES (?, ?, ?, ?, ?)
`

/**
 * Keep the newest `?` rows **of one username** by `id` and delete the rest of
 * that user's.
 *
 * Two properties, both load-bearing:
 *
 *   - **Scoped to one username.** The retention cap is per user, so the `WHERE
 *     username = ?` on the outer `DELETE` and the matching one in the subquery
 *     are what stop somebody who trains every day from evicting the history of
 *     somebody who trains once a month. A global cap would do exactly that,
 *     silently, and the evicted rows would be gone for good.
 *   - **Ordered by `id`, never `created_at`.** `id` is a monotonically
 *     increasing AUTOINCREMENT key, whereas `created_at` comes from the server
 *     clock and can go backwards across an NTP correction. "The newest row" must
 *     be a fact about insertion order, not about what the clock said — a
 *     snapshot pruned because a clock jumped is not recoverable.
 */
const PRUNE = `
  DELETE FROM snapshots
   WHERE username = ?
     AND id NOT IN (
       SELECT id FROM snapshots WHERE username = ? ORDER BY id DESC LIMIT ?
     )
`

/**
 * Add `username` to a database that predates it, once.
 *
 * Idempotent by inspection rather than by a schema-version table: `PRAGMA
 * table_info` is asked whether the column is already there, and the `ALTER` runs
 * only when it is not. That makes every startup — first, second, after a
 * downgrade-and-upgrade — converge on the same schema, with no migration
 * bookkeeping to keep honest and nothing that breaks if a row of it is lost.
 *
 * `NOT NULL DEFAULT '<LEGACY_USERNAME>'` is what makes the `ALTER` legal at all
 * (SQLite refuses to add a `NOT NULL` column without a default) and is also the
 * whole of the data migration: every pre-existing row is attributed to
 * `LEGACY_USERNAME` in place. No table rebuild, no copy, no window where the
 * history is in two places.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {boolean} whether this call performed the migration
 */
function addUsernameColumn(db) {
  const columns = db
    .prepare('PRAGMA table_info(snapshots)')
    .all()
    .map((row) => String(row.name))

  if (columns.includes('username')) return false

  db.exec(`ALTER TABLE snapshots ADD COLUMN username TEXT NOT NULL DEFAULT '${LEGACY_USERNAME}'`)
  return true
}

/**
 * @typedef {object} Snapshot
 * @property {number} id
 * @property {string} createdAt
 * @property {string} username
 * @property {number} historyLength  `history.length` of the stored document
 * @property {number} schemaVersion
 * @property {string} docJson the stored bytes, verbatim
 */

/**
 * @typedef {object} SnapshotStore
 * @property {string} file            the database path actually opened
 * @property {number} retention       per username, not in total
 * @property {boolean} migrated       true when this open added the username column
 * @property {(username: string) => Snapshot | null} latest
 * @property {(input: {username: string, docJson: string, historyLength: number, schemaVersion: number, createdAt?: string}) => {id: number, createdAt: string, pruned: number}} insert
 * @property {(username?: string) => number} count   one user's rows, or every row
 * @property {(username?: string) => number[]} ids   newest first; for tests and diagnostics
 * @property {() => string[]} usernames              streams present, for diagnostics
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

  // Order matters: create the table if it is absent, *then* migrate, so a
  // pre-existing single-stream table (which `CREATE TABLE IF NOT EXISTS` leaves
  // alone) still gets its column, and a table this call just created skips the
  // `ALTER` because it already has one. Then the index, which needs the column
  // to exist either way.
  db.exec(SCHEMA)
  const migrated = addUsernameColumn(db)
  db.exec(INDEX)

  const selectLatest = db.prepare(SELECT_LATEST)
  const insertSnapshot = db.prepare(INSERT_SNAPSHOT)
  const prune = db.prepare(PRUNE)
  const countAll = db.prepare('SELECT COUNT(*) AS n FROM snapshots')
  const countForUser = db.prepare('SELECT COUNT(*) AS n FROM snapshots WHERE username = ?')
  const selectAllIds = db.prepare('SELECT id FROM snapshots ORDER BY id DESC')
  const selectIdsForUser = db.prepare(
    'SELECT id FROM snapshots WHERE username = ? ORDER BY id DESC',
  )
  const selectUsernames = db.prepare(
    'SELECT DISTINCT username FROM snapshots ORDER BY username ASC',
  )

  /**
   * Every entry point that takes a username goes through this.
   *
   * The service validates before it ever reaches the store, so this is
   * defence in depth rather than the check that matters — but it is the check
   * that stops a future caller (a repair script, a one-off import) from
   * creating a stream no HTTP request can name, which would be a silently
   * unreachable copy of somebody's history.
   *
   * @param {unknown} username
   * @returns {string}
   */
  function requireUsername(username) {
    if (!isValidUsername(username)) {
      throw new TypeError(`username must be ${USERNAME_RULE}; got ${JSON.stringify(username)}`)
    }
    return /** @type {string} */ (username)
  }

  return {
    file,
    retention,
    migrated,

    latest(username) {
      const row = selectLatest.get(requireUsername(username))
      if (!row) return null
      return {
        id: Number(row.id),
        createdAt: String(row.created_at),
        username: String(row.username),
        historyLength: Number(row.sessions_completed),
        schemaVersion: Number(row.schema_version),
        docJson: String(row.doc_json),
      }
    },

    insert({ username, docJson, historyLength, schemaVersion, createdAt }) {
      const owner = requireUsername(username)
      const stamp = createdAt ?? new Date().toISOString()

      // Insert and prune in one transaction. Without it a crash between the two
      // leaves the cap exceeded — recoverable — but an interrupted prune could
      // in principle be observed by a concurrent reader as a gap. One
      // transaction makes "insert the new snapshot and drop the oldest" a
      // single visible event.
      db.exec('BEGIN IMMEDIATE')
      try {
        const info = insertSnapshot.run(stamp, historyLength, schemaVersion, docJson, owner)
        // Both bindings are the same username: one scopes the `DELETE`, the
        // other scopes the "rows worth keeping" subquery. Dropping either turns
        // a per-user cap back into a global one.
        const { changes } = prune.run(owner, owner, retention)
        db.exec('COMMIT')
        return { id: Number(info.lastInsertRowid), createdAt: stamp, pruned: Number(changes) }
      } catch (cause) {
        db.exec('ROLLBACK')
        throw cause
      }
    },

    count(username) {
      const row =
        username === undefined ? countAll.get() : countForUser.get(requireUsername(username))
      return row ? Number(row.n) : 0
    },

    ids(username) {
      const rows =
        username === undefined
          ? selectAllIds.all()
          : selectIdsForUser.all(requireUsername(username))
      return rows.map((row) => Number(row.id))
    },

    usernames() {
      return selectUsernames.all().map((row) => String(row.username))
    },

    close() {
      db.close()
    },
  }
}
