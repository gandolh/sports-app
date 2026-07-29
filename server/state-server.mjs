/**
 * The state service: four routes, one table, and one dependency — the shared
 * contract (`@sports-app/shared`), which is types plus one regex and imports
 * nothing itself.
 *
 * ── What this is not ─────────────────────────────────────────────────────────
 *
 * Not a backend in the usual sense. There is no users table, no session cookie,
 * no ORM, no migration runner, and no route that returns anything other than the
 * one JSON document the app already produces. A username names a stream of
 * snapshots; "conflict resolution" is a comparison of two integers, done on the
 * client.
 *
 * ── The routes ───────────────────────────────────────────────────────────────
 *
 *   GET  /api/health          liveness. No auth, no database read, no information.
 *   POST /api/login           { username, password } → { username }.
 *   GET  /api/state?user=…    that user's newest snapshot bytes, or 404.
 *   PUT  /api/state?user=…    validate shallowly, store verbatim, prune to the cap.
 *
 * Anything else is a 404. No static files, no directory listing, no fallback
 * handler — a service whose only job is to hold documents has no business
 * serving anything else, and every route that does not exist is a route that
 * cannot be wrong.
 *
 * ── Login checks nothing, and that is the design ──────────────────────────────
 *
 * `corpus/wiki/technical-decisions.md § "Authentication is a nameplate, not a
 * boundary"`. Read that before changing anything in `login()`.
 *
 * **The password is never read.** Not hashed, not compared, not stored, not
 * logged, not echoed. There is deliberately no expression anywhere in this file
 * that evaluates `.password` — the handler destructures `username` and nothing
 * else — which is a stronger guarantee than deleting it afterwards would be,
 * because it cannot be undone by a later edit that "just needs it for a moment".
 * Storing an unchecked password buys nothing and collects real passwords that
 * people reuse elsewhere. A request without a password field is therefore
 * accepted: there is nothing to check, so there is nothing to be missing.
 *
 * **This is not a security boundary and does not pretend to be one.** Anyone who
 * knows a username can read that person's training history through
 * `GET /api/state?user=…`. That is accepted for training data on a personal
 * deployment. There is no token, no session, no cookie, no rate limit — not
 * because they were forgotten, but because each one would manufacture a feeling
 * of security that the design does not provide, and a user who believed it would
 * make worse decisions than one who knows the truth. The login screen says so in
 * as many words.
 *
 * The shared secret below is a different thing entirely: it protects the
 * *deployment* — whether this process will talk to you at all — not the accounts
 * inside it. It does not make one user's history private from another.
 *
 * ── Why validation here is deliberately shallow ──────────────────────────────
 *
 * The server checks that the body is a JSON object with a numeric
 * `schemaVersion`, a valid `username`, and an array `history`. That is all.
 *
 * It is tempting to re-implement the codec's validation here as a second line of
 * defence. That would be a mistake: `client/src/persistence/codec.ts` is the single
 * source of truth for the document's shape, and a second, drifting validator
 * would eventually reject a document the app considers perfectly good — turning
 * this service from a safety net into a way to *lose* a workout. The three fields
 * it does check are exactly the three the service itself needs: `schemaVersion`
 * for the indexed column, `username` because it is the row key, and `history`
 * because its length is what the `sessions_completed` column holds now that the
 * v3 document no longer carries a `sessionsCompleted` field.
 *
 * A 400 leaves the database completely untouched. The newest snapshot after a
 * rejected `PUT` is byte-for-byte the newest snapshot from before it.
 *
 * ── The username travels in the query string, on both /api/state routes ───────
 *
 * `?user=alice`. On `GET` it is the only way to say whose document is wanted. On
 * `PUT` it is redundant with the document's own `username` — and that is the
 * point: the two are compared and a mismatch is a 400. Without an independently
 * stated target there is nothing to compare, and a client bug that puts the
 * wrong name in a document would silently overwrite someone else's stream.
 *
 * A username in a URL is fine; a secret in one is not, which is why the secret
 * stays in a header. A URL ends up in proxy logs and browser history, and a
 * username is not a secret in this design — it is a nameplate.
 *
 * ── Auth ─────────────────────────────────────────────────────────────────────
 *
 * One shared secret in a header, from the `SPORTS_APP_SYNC_SECRET` environment
 * variable, compared with `crypto.timingSafeEqual`. The service refuses to start
 * without one — a default or empty secret would be worse than no auth at all,
 * because it would look like auth. **No secret is committed anywhere in this
 * repository.**
 *
 * ── Binding ──────────────────────────────────────────────────────────────────
 *
 * `127.0.0.1` by default, so running it cannot accidentally expose anyone's
 * training history to a network. Host and port are environment variables.
 */
import { createServer as createHttpServer } from 'node:http'
import { createHash, timingSafeEqual } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { DEFAULT_DB_FILE, RETENTION, openSnapshotStore } from './db.mjs'
// The one rule the client and this service must agree on, from the one place it
// is defined. See `shared/username.ts`.
import { LEGACY_USERNAME, USERNAME_RULE, isValidUsername } from '@sports-app/shared/username.ts'

export const SECRET_HEADER = 'x-sync-secret'
export const STATE_PATH = '/api/state'
export const HEALTH_PATH = '/api/health'
export const LOGIN_PATH = '/api/login'

/** The query parameter that names whose stream a `/api/state` request is about. */
export const USER_PARAM = 'user'

export const DEFAULT_HOST = '127.0.0.1'
export const DEFAULT_PORT = 8787

/**
 * Body cap. A snapshot at three years of daily training is roughly a megabyte
 * (see `RETENTION` in db.mjs for why that number matters), so 4 MiB is generous
 * for the document this service exists to hold and small enough that a stray
 * upload cannot fill a disk.
 */
export const DEFAULT_MAX_BODY_BYTES = 4 * 1024 * 1024

const JSON_CONTENT_TYPE = 'application/json'

// ─── Auth ───────────────────────────────────────────────────────────────────

/**
 * Constant-time secret comparison.
 *
 * `timingSafeEqual` throws unless both buffers are the same length, and the
 * obvious `if (a.length !== b.length) return false` guard leaks the secret's
 * length through timing. Hashing both sides first gives two buffers that are
 * *always* 32 bytes, so the comparison is genuinely constant-time over every
 * input including a wrong-length one, and the length of the real secret never
 * affects how long a rejection takes.
 *
 * @param {unknown} provided
 * @param {string} expected
 * @returns {boolean}
 */
export function secretMatches(provided, expected) {
  const supplied = typeof provided === 'string' ? provided : ''
  const a = createHash('sha256').update(supplied, 'utf8').digest()
  const b = createHash('sha256').update(expected, 'utf8').digest()
  return timingSafeEqual(a, b)
}

// ─── Request/response plumbing ──────────────────────────────────────────────

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {object} payload
 */
function sendJson(res, status, payload) {
  const body = Buffer.from(`${JSON.stringify(payload)}\n`, 'utf8')
  res.writeHead(status, {
    'Content-Type': `${JSON_CONTENT_TYPE}; charset=utf-8`,
    'Content-Length': String(body.byteLength),
    'Cache-Control': 'no-store',
    // This service holds one user's document and nothing about it should ever
    // be guessed at, sniffed, or framed.
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(body)
}

/**
 * Send stored document bytes back exactly as they were received.
 *
 * `Buffer.from(text, 'utf8')` plus an explicit `Content-Length` is what makes
 * the round-trip byte-identical: no re-encoding, no pretty-printing, no
 * chunked-transfer surprises.
 *
 * @param {import('node:http').ServerResponse} res
 * @param {string} docJson
 * @param {{id: number, createdAt: string}} meta
 */
function sendDocument(res, docJson, meta) {
  const body = Buffer.from(docJson, 'utf8')
  res.writeHead(200, {
    'Content-Type': `${JSON_CONTENT_TYPE}; charset=utf-8`,
    'Content-Length': String(body.byteLength),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    // Advisory only. The client compares session counts read from inside the
    // document, never a header, so a proxy that strips these changes nothing.
    // Deliberately no `X-Snapshot-User`: the username is in the document, and a
    // header would be a second place for it to disagree.
    'X-Snapshot-Id': String(meta.id),
    'X-Snapshot-Created-At': meta.createdAt,
  })
  res.end(body)
}

/**
 * Read the request body, refusing anything over `limit` bytes.
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {number} limit
 * @returns {Promise<{ok: true, text: string} | {ok: false, tooLarge: boolean, error: string}>}
 */
async function readBody(req, limit) {
  /** @type {Buffer[]} */
  const chunks = []
  let total = 0
  try {
    for await (const chunk of req) {
      total += chunk.length
      if (total > limit) {
        return { ok: false, tooLarge: true, error: `body exceeds the ${limit} byte limit` }
      }
      chunks.push(chunk)
    }
  } catch (cause) {
    return { ok: false, tooLarge: false, error: messageOf(cause) }
  }
  return { ok: true, text: Buffer.concat(chunks).toString('utf8') }
}

function isJsonContentType(header) {
  if (typeof header !== 'string') return false
  return header.split(';')[0].trim().toLowerCase() === JSON_CONTENT_TYPE
}

function messageOf(cause) {
  return cause instanceof Error ? cause.message : String(cause)
}

// ─── Usernames ──────────────────────────────────────────────────────────────

/**
 * The message a rejected username gets.
 *
 * It states the rule and **does not echo the value**. Echoing it would put
 * attacker-controlled text into a response body that some client will eventually
 * render, and the rule is the only part that helps the person reading it anyway.
 */
export const USERNAME_ERROR = `user: expected ${USERNAME_RULE}`

/**
 * Pull `?user=` off a request URL and validate it.
 *
 * @param {string} url the raw `req.url`
 * @returns {{ok: true, username: string} | {ok: false, error: string}}
 */
export function readUsername(url) {
  const mark = url.indexOf('?')
  // `URLSearchParams` handles the percent-decoding, so `%2e%2e` and `a+b` are
  // decoded *before* the allowlist sees them rather than after — a check that
  // runs on the encoded form can be walked straight past.
  const raw = new URLSearchParams(mark === -1 ? '' : url.slice(mark + 1)).get(USER_PARAM)
  if (raw === null) {
    return { ok: false, error: `user: required. Name whose document this is with ?${USER_PARAM}=…` }
  }
  if (!isValidUsername(raw)) return { ok: false, error: USERNAME_ERROR }
  return { ok: true, username: raw }
}

// ─── Shallow document check ─────────────────────────────────────────────────

/**
 * @param {string} text
 * @returns {{ok: true, schemaVersion: number, username: string, historyLength: number} | {ok: false, error: string}}
 */
export function checkDocument(text) {
  let raw
  try {
    raw = JSON.parse(text)
  } catch (cause) {
    return { ok: false, error: `not valid JSON — ${messageOf(cause)}` }
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'expected a JSON object at the top level' }
  }

  const { schemaVersion, username, history } = raw
  if (typeof schemaVersion !== 'number' || !Number.isFinite(schemaVersion)) {
    return {
      ok: false,
      error:
        'schemaVersion: expected a number. Every state document carries one; ' +
        'a body without it is probably not a state document at all.',
    }
  }
  if (!isValidUsername(username)) {
    return { ok: false, error: `username: expected ${USERNAME_RULE}` }
  }
  if (!Array.isArray(history)) {
    // Checked because `history.length` is what the `sessions_completed` column
    // holds — not because the server has an opinion about what is *in* the
    // array. It never looks inside.
    return { ok: false, error: 'history: expected an array' }
  }

  return { ok: true, schemaVersion, username, historyLength: history.length }
}

// ─── The login body ─────────────────────────────────────────────────────────

/**
 * Read a username out of a login body.
 *
 * **Only `username` is destructured. `.password` is never evaluated.** See the
 * file header: that is the decision, not an oversight, and this function is the
 * one place it could be broken.
 *
 * Note what the failure path deliberately does *not* do: it does not include the
 * `JSON.parse` message. V8's parse errors quote a slice of the input, so an
 * unparseable login body would put part of a real password into a response and
 * into the log. The generic message is worth strictly more than the diagnostic
 * detail here — this body has exactly two fields and the client constructs it.
 *
 * @param {string} text
 * @returns {{ok: true, username: string} | {ok: false, error: string}}
 */
export function checkCredentials(text) {
  let raw
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'expected a JSON object with a username' }
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'expected a JSON object at the top level' }
  }

  const { username } = raw
  if (!isValidUsername(username)) {
    return { ok: false, error: `username: expected ${USERNAME_RULE}` }
  }
  return { ok: true, username }
}

// ─── The service ────────────────────────────────────────────────────────────

/**
 * @param {{
 *   store: import('./db.mjs').SnapshotStore,
 *   secret: string,
 *   maxBodyBytes?: number,
 *   log?: (message: string) => void,
 * }} config
 * @returns {import('node:http').Server}
 */
export function createStateServer(config) {
  const { store } = config
  const secret = config.secret
  const maxBodyBytes = config.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES
  const log = config.log ?? (() => {})

  if (typeof secret !== 'string' || secret === '') {
    // Refusing here rather than defaulting is the point. A service with a blank
    // or built-in secret looks authenticated and is not.
    throw new Error('createStateServer requires a non-empty shared secret')
  }

  return createHttpServer((req, res) => {
    void handle(req, res).catch((cause) => {
      log(`unhandled error: ${messageOf(cause)}`)
      if (!res.headersSent) sendJson(res, 500, { error: 'internal error' })
      else res.end()
    })
  })

  async function handle(req, res) {
    const url = req.url ?? ''
    // Splitting the query string off means `/api/state?x=1` cannot slip past an
    // exact path comparison. `?user=` is read separately, by `readUsername`, and
    // only on the routes that have a subject.
    const path = url.split('?')[0]
    const method = req.method ?? 'GET'

    // Liveness first, before auth: the whole point is to answer "is the process
    // up" without needing a credential. It touches neither the database nor
    // anything about any document — no row is read, no username is revealed, and
    // the body is one fixed field, so it cannot become an existence oracle for
    // an account or a leak of how much history is stored.
    if (path === HEALTH_PATH) {
      if (method !== 'GET' && method !== 'HEAD') return methodNotAllowed(res, 'GET, HEAD')
      return sendJson(res, 200, { status: 'ok' })
    }

    if (path !== STATE_PATH && path !== LOGIN_PATH) {
      // Deliberately identical for "route does not exist" and "route exists but
      // you are not allowed to know". No listing, no hints.
      return sendJson(res, 404, { error: 'not found' })
    }

    // The secret gate comes before any validation, so an unauthorised caller
    // cannot use 400-vs-401 to learn the username rules — or, on `/api/login`,
    // to learn that the route exists at all.
    if (!secretMatches(req.headers[SECRET_HEADER], secret)) {
      log(`401 ${method} ${path}`)
      return sendJson(res, 401, { error: 'unauthorized' })
    }

    if (path === LOGIN_PATH) {
      if (method !== 'POST') return methodNotAllowed(res, 'POST')
      return login(req, res)
    }

    if (method === 'GET') return getState(url, res)
    if (method === 'PUT') return putState(url, req, res)
    return methodNotAllowed(res, 'GET, PUT')
  }

  function methodNotAllowed(res, allow) {
    res.setHeader('Allow', allow)
    return sendJson(res, 405, { error: `method not allowed; try ${allow}` })
  }

  // ─── POST /api/login ──────────────────────────────────────────────────────

  /**
   * Accept a username, ignore the password, answer with the username.
   *
   * That really is the whole handler. It exists so that the login screen has
   * something to fail against when the service is unreachable or the deployment
   * secret is wrong, and so the username is validated once before it becomes a
   * stream key — not to decide whether anybody may proceed. Nothing is written:
   * an account comes into existence when a document is stored under its name,
   * and until then there is nothing to create.
   */
  async function login(req, res) {
    if (!isJsonContentType(req.headers['content-type'])) {
      return sendJson(res, 415, { error: `expected Content-Type: ${JSON_CONTENT_TYPE}` })
    }

    const body = await readBody(req, maxBodyBytes)
    if (!body.ok) {
      if (body.tooLarge) {
        res.setHeader('Connection', 'close')
        // No `body.error` echo of any kind beyond the limit itself: a body this
        // route rejected may well have had a password in it.
        return sendJson(res, 413, { error: 'login body is too large', limit: maxBodyBytes })
      }
      return sendJson(res, 400, { error: 'could not read the request body' })
    }

    const checked = checkCredentials(body.text)
    if (!checked.ok) {
      // `checked.error` is one of a fixed set of messages that never contains
      // any part of the request body. That is what makes it safe to log.
      log(`400 POST ${LOGIN_PATH}: ${checked.error}`)
      return sendJson(res, 400, { error: checked.error })
    }

    log(`login ${checked.username} (no password was read, compared, or stored)`)
    return sendJson(res, 200, { username: checked.username })
  }

  // ─── GET /api/state ───────────────────────────────────────────────────────

  function getState(url, res) {
    const who = readUsername(url)
    if (!who.ok) return sendJson(res, 400, { error: who.error })

    const snapshot = store.latest(who.username)
    if (snapshot === null) {
      // 404 rather than an empty document: "nothing has ever been stored for
      // this user" is exactly the new-device case the client needs to
      // distinguish from "the remote holds a document with zero sessions".
      return sendJson(res, 404, { error: 'no state has been stored yet for this user' })
    }
    return sendDocument(res, snapshot.docJson, snapshot)
  }

  // ─── PUT /api/state ───────────────────────────────────────────────────────

  async function putState(url, req, res) {
    const who = readUsername(url)
    if (!who.ok) return sendJson(res, 400, { error: who.error })

    if (!isJsonContentType(req.headers['content-type'])) {
      return sendJson(res, 415, {
        error: `expected Content-Type: ${JSON_CONTENT_TYPE}`,
      })
    }

    const body = await readBody(req, maxBodyBytes)
    if (!body.ok) {
      if (body.tooLarge) {
        // Close the connection after answering: the rest of an oversized body
        // is not going to be read, and leaving it half-consumed would stall the
        // socket until it timed out.
        res.setHeader('Connection', 'close')
        return sendJson(res, 413, { error: body.error, limit: maxBodyBytes })
      }
      return sendJson(res, 400, { error: `could not read the request body — ${body.error}` })
    }

    const checked = checkDocument(body.text)
    if (!checked.ok) {
      log(`400 PUT ${STATE_PATH}: ${checked.error}`)
      // Nothing has been written. The newest snapshot is untouched.
      return sendJson(res, 400, { error: checked.error })
    }

    if (checked.username !== who.username) {
      // The one check that needs both the target and the document. A client bug
      // that sends the wrong document — a stale one from a previous account, say,
      // after a logout that missed a code path — would otherwise write silently
      // into a stream it does not belong to, and the overwritten snapshot would
      // be somebody else's training history.
      const error =
        `username mismatch: ?${USER_PARAM}=${who.username} but the document says ` +
        `${checked.username}. Nothing was stored.`
      log(`400 PUT ${STATE_PATH}: ${error}`)
      return sendJson(res, 400, { error })
    }

    // `body.text`, not a re-serialisation of the parsed object. See the
    // "Bytes in, same bytes out" note in db.mjs.
    const written = store.insert({
      username: who.username,
      docJson: body.text,
      historyLength: checked.historyLength,
      schemaVersion: checked.schemaVersion,
    })

    log(
      `stored snapshot ${written.id} for ${who.username} (${checked.historyLength} sessions, ` +
        `${body.text.length} bytes, pruned ${written.pruned})`,
    )

    return sendJson(res, 200, {
      id: written.id,
      createdAt: written.createdAt,
      username: who.username,
      historyLength: checked.historyLength,
      schemaVersion: checked.schemaVersion,
      bytes: body.text.length,
      pruned: written.pruned,
      // This user's rows, not the table's. A count of everybody's would tell
      // each user how much other people train.
      retained: store.count(who.username),
    })
  }
}

// ─── Configuration ──────────────────────────────────────────────────────────

/**
 * @param {Record<string, string | undefined>} env
 */
export function readConfig(env) {
  const rawPort = env.SPORTS_APP_PORT
  const port = rawPort === undefined || rawPort === '' ? DEFAULT_PORT : Number(rawPort)
  const rawMax = env.SPORTS_APP_MAX_BODY_BYTES
  const maxBodyBytes = rawMax === undefined || rawMax === '' ? DEFAULT_MAX_BODY_BYTES : Number(rawMax)

  return {
    secret: env.SPORTS_APP_SYNC_SECRET ?? '',
    host: env.SPORTS_APP_HOST ?? DEFAULT_HOST,
    port,
    dbFile: env.SPORTS_APP_DB ?? DEFAULT_DB_FILE,
    maxBodyBytes,
    quiet: env.SPORTS_APP_QUIET === '1',
  }
}

// ─── Entry point ────────────────────────────────────────────────────────────

/**
 * @param {Record<string, string | undefined>} env
 * @param {{error: (m: string) => void, log: (m: string) => void}} out
 */
export function main(env, out = console) {
  const config = readConfig(env)

  if (config.secret === '') {
    out.error(
      'SPORTS_APP_SYNC_SECRET is not set, so there would be nothing to check ' +
        'requests against. Generate one and pass it in the environment:\n\n' +
        '  SPORTS_APP_SYNC_SECRET="$(node -e \'console.log(require("node:crypto").randomBytes(32).toString("hex"))\')" \\\n' +
        '    npm run server\n\n' +
        'See server/README.md. Never commit it.',
    )
    return null
  }
  if (!Number.isInteger(config.port) || config.port < 0 || config.port > 65535) {
    out.error(`SPORTS_APP_PORT must be a port number, got ${String(config.port)}`)
    return null
  }

  const store = openSnapshotStore({ file: config.dbFile })
  const log = config.quiet ? () => {} : (message) => out.log(`[state] ${message}`)
  const server = createStateServer({
    store,
    secret: config.secret,
    maxBodyBytes: config.maxBodyBytes,
    log,
  })

  server.listen(config.port, config.host, () => {
    const address = server.address()
    const shown = typeof address === 'object' && address !== null ? address.port : config.port
    // The secret is never logged, here or anywhere else.
    log(`listening on http://${config.host}:${shown}`)
    log(`database ${store.file} (keeping the newest ${RETENTION} snapshots per user)`)
    if (store.migrated) {
      // Worth one line at startup, once: somebody upgrading a real deployment
      // needs to know where their existing history went and how to rename it.
      log(
        `migrated the single-stream schema: existing snapshots are now attributed to ` +
          `"${LEGACY_USERNAME}". Reattribute with: sqlite3 ${store.file} ` +
          `"UPDATE snapshots SET username = 'yourname' WHERE username = '${LEGACY_USERNAME}'"`,
      )
    }
  })

  // A `synchronous = FULL` database has nothing in flight to lose, but closing
  // it explicitly releases the WAL cleanly instead of leaving recovery to the
  // next open.
  const shutdown = () => {
    server.close(() => {
      store.close()
    })
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)

  return { server, store }
}

const invokedDirectly =
  process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url

if (invokedDirectly) {
  main(process.env)
}
