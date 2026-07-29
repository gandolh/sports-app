/**
 * The state service: five routes, one table, zero dependencies.
 *
 * ── What this is not ─────────────────────────────────────────────────────────
 *
 * Not a backend in the usual sense. There is no users table, no login, no
 * session cookie, no ORM, no migration runner, and no route that returns
 * anything other than the one JSON document the app already produces. There is
 * exactly one user, so "authorisation" is a single shared secret and
 * "conflict resolution" is a comparison of two integers.
 *
 * ── The routes ───────────────────────────────────────────────────────────────
 *
 *   GET  /api/health   liveness. No auth, no database read, no information.
 *   GET  /api/state    the newest snapshot's bytes, or 404 when there are none.
 *   PUT  /api/state    validate shallowly, store verbatim, prune to the cap.
 *
 * Anything else is a 404. No static files, no directory listing, no fallback
 * handler — a service whose only job is to hold one document has no business
 * serving anything else, and every route that does not exist is a route that
 * cannot be wrong.
 *
 * ── Why validation here is deliberately shallow ──────────────────────────────
 *
 * The server checks that the body is a JSON object with a numeric
 * `schemaVersion` and a non-negative integer `sessionsCompleted`. That is all.
 *
 * It is tempting to re-implement the codec's validation here as a second line of
 * defence. That would be a mistake: `src/persistence/codec.ts` is the single
 * source of truth for the document's shape, and a second, drifting validator
 * would eventually reject a document the app considers perfectly good — turning
 * this service from a safety net into a way to *lose* a workout. The two fields
 * it does check are exactly the two the service itself needs: `schemaVersion`
 * for the indexed column, and `sessionsCompleted` because the client's conflict
 * comparison reads it back.
 *
 * A 400 leaves the database completely untouched. The newest snapshot after a
 * rejected `PUT` is byte-for-byte the newest snapshot from before it.
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
 * `127.0.0.1` by default, so running it cannot accidentally expose one user's
 * training history to a network. Host and port are environment variables.
 */
import { createServer as createHttpServer } from 'node:http'
import { createHash, timingSafeEqual } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { DEFAULT_DB_FILE, RETENTION, openSnapshotStore } from './db.mjs'

export const SECRET_HEADER = 'x-sync-secret'
export const STATE_PATH = '/api/state'
export const HEALTH_PATH = '/api/health'

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
    // Advisory only. The client compares `sessionsCompleted` from inside the
    // document, never a header, so a proxy that strips these changes nothing.
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

// ─── Shallow document check ─────────────────────────────────────────────────

/**
 * @param {string} text
 * @returns {{ok: true, schemaVersion: number, sessionsCompleted: number} | {ok: false, error: string}}
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

  const { schemaVersion, sessionsCompleted } = raw
  if (typeof schemaVersion !== 'number' || !Number.isFinite(schemaVersion)) {
    return {
      ok: false,
      error:
        'schemaVersion: expected a number. Every state document carries one; ' +
        'a body without it is probably not a state document at all.',
    }
  }
  if (
    typeof sessionsCompleted !== 'number' ||
    !Number.isInteger(sessionsCompleted) ||
    sessionsCompleted < 0
  ) {
    return { ok: false, error: 'sessionsCompleted: expected a whole number >= 0' }
  }

  return { ok: true, schemaVersion, sessionsCompleted }
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
    // Query strings are meaningless on every route here, and splitting them off
    // means `/api/state?x=1` cannot slip past an exact path comparison.
    const path = (req.url ?? '').split('?')[0]
    const method = req.method ?? 'GET'

    // Liveness first, before auth: the whole point is to answer "is the process
    // up" without needing a credential, and it touches neither the database nor
    // anything about the document.
    if (path === HEALTH_PATH) {
      if (method !== 'GET' && method !== 'HEAD') return methodNotAllowed(res, 'GET, HEAD')
      return sendJson(res, 200, { status: 'ok' })
    }

    if (path !== STATE_PATH) {
      // Deliberately identical for "route does not exist" and "route exists but
      // you are not allowed to know". No listing, no hints.
      return sendJson(res, 404, { error: 'not found' })
    }

    if (!secretMatches(req.headers[SECRET_HEADER], secret)) {
      log(`401 ${method} ${path}`)
      return sendJson(res, 401, { error: 'unauthorized' })
    }

    if (method === 'GET') return getState(res)
    if (method === 'PUT') return putState(req, res)
    return methodNotAllowed(res, 'GET, PUT')
  }

  function methodNotAllowed(res, allow) {
    res.setHeader('Allow', allow)
    return sendJson(res, 405, { error: `method not allowed; try ${allow}` })
  }

  function getState(res) {
    const snapshot = store.latest()
    if (snapshot === null) {
      // 404 rather than an empty document: "this service has never been
      // written to" is exactly the new-device case the client needs to
      // distinguish from "the remote holds a document with zero sessions".
      return sendJson(res, 404, { error: 'no state has been stored yet' })
    }
    return sendDocument(res, snapshot.docJson, snapshot)
  }

  async function putState(req, res) {
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

    // `body.text`, not a re-serialisation of the parsed object. See the
    // "Bytes in, same bytes out" note in db.mjs.
    const written = store.insert({
      docJson: body.text,
      sessionsCompleted: checked.sessionsCompleted,
      schemaVersion: checked.schemaVersion,
    })

    log(
      `stored snapshot ${written.id} (${checked.sessionsCompleted} sessions, ` +
        `${body.text.length} bytes, pruned ${written.pruned})`,
    )

    return sendJson(res, 200, {
      id: written.id,
      createdAt: written.createdAt,
      sessionsCompleted: checked.sessionsCompleted,
      schemaVersion: checked.schemaVersion,
      bytes: body.text.length,
      pruned: written.pruned,
      retained: store.count(),
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
    log(`database ${store.file} (keeping the newest ${RETENTION} snapshots)`)
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
