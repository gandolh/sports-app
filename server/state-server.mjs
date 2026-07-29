/**
 * The state service: four routes, one table, and Fastify underneath.
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
 *   POST /api/login           { username, … } → { username }.
 *   GET  /api/state?user=…    that user's newest snapshot bytes, or 404.
 *   PUT  /api/state?user=…    validate shallowly, store verbatim, prune to the cap.
 *
 * Anything else is a 404. No static files, no directory listing, no fallback
 * handler — a service whose only job is to hold documents has no business
 * serving anything else, and every route that does not exist is a route that
 * cannot be wrong.
 *
 * ── Fastify, and what the framework is NOT allowed to do (brief 22) ──────────
 *
 * Brief 22 replaced hand-rolled `node:http` routing with Fastify **without
 * changing one byte of the REST contract** — same paths, methods, status codes,
 * headers and bodies, so that `client/src/persistence/sync.ts` needed no edit at
 * all. The 73 tests in `__tests__/` are what makes that claim checkable rather
 * than hopeful: they were written against the wire, not the implementation.
 *
 * Five things a framework does helpfully by default and must not do here. Each of
 * the five is load-bearing and each is pinned by a test:
 *
 *   1. **`GET /api/state` returns the stored bytes verbatim.** Fastify will parse
 *      and re-serialise JSON for you, which would destroy the codec's layout while
 *      still being "valid JSON". So the JSON body parser is replaced with one that
 *      hands the handler the **raw string** (`parseAs: 'string'`, no `JSON.parse`),
 *      the stored document goes out as a `Buffer`, and there is deliberately no
 *      `response` schema on that route's 200 — a serialiser attached to it would
 *      rewrite the very bytes it exists to preserve. The client's crash-safe save
 *      round-trips through a byte comparison, so this is not cosmetic.
 *   2. **The secret is checked before any validation.** It is a route-level
 *      `onRequest` hook, which is the earliest point in Fastify's lifecycle — ahead
 *      of body parsing and ahead of schema validation. A wrong secret therefore
 *      gets a `401` and never a `400` that would leak whether a username is even
 *      well-formed, or that `/api/login` exists.
 *   3. **A `?user=` / document-`username` mismatch is a `400`, not a `409`,** and
 *      stores nothing. It is a client bug, not a concurrent edit.
 *   4. **Usernames are rejected, never case-folded.** Folding would make the stream
 *      key disagree with the document's own `username`, which is exactly what (3)
 *      refuses. The rule lives in `shared/username.ts` and says why.
 *   5. **Paths match exactly.** `ignoreTrailingSlash` stays off and
 *      `exposeHeadRoutes` is switched **off** — otherwise Fastify would helpfully
 *      add `HEAD /api/state`, which today is a `405`.
 *
 * And one more, the loudest: **Fastify logs requests by default.** `logger: false`
 * turns the framework's logging off completely, so there is no logger for a request
 * body to reach even in principle. The only log in this process is the `log`
 * callback below, which is called with fixed strings the caller composes. See the
 * `__tests__` block "the password is never stored, logged, echoed, or compared".
 *
 * ── Validation is schema-driven, from `shared/api.ts` ────────────────────────
 *
 * The wire shapes are TypeBox declarations in `@sports-app/shared/api.ts`, so the
 * same declaration that guards this service also types the client. Fastify's AJV
 * reads them directly for `?user=` and for response serialisation; the two JSON
 * *bodies* are checked here with `TypeCompiler`, because they must stay raw strings
 * (see 1 above) and a body schema would require Fastify to have parsed them first.
 * One declaration, two entry points into it — not two declarations.
 *
 * ── Login checks nothing, and that is the design ──────────────────────────────
 *
 * `corpus/wiki/technical-decisions.md § "Authentication is a nameplate, not a
 * boundary"`. Read that before changing anything in `login()`.
 *
 * **The credential is never read.** Not hashed, not compared, not stored, not
 * logged, not echoed. There is deliberately no expression anywhere in this file
 * that evaluates that field — the handler reads `username` and nothing else —
 * which is a stronger guarantee than deleting it afterwards would be, because it
 * cannot be undone by a later edit that "just needs it for a moment". Storing an
 * unchecked credential buys nothing and collects real ones that people reuse
 * elsewhere. A request without that field is therefore accepted: there is nothing
 * to check, so there is nothing to be missing.
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
 * `schemaVersion`, a valid `username`, and an array `history`. That is all, and
 * `StateDocumentEnvelope` in `shared/api.ts` says so in three lines.
 *
 * It is tempting to re-implement the codec's validation here as a second line of
 * defence. That would be a mistake: `client/src/persistence/codec.ts` is the single
 * source of truth for the document's shape, and a second, drifting validator
 * would eventually reject a document the app considers perfectly good — turning
 * this service from a safety net into a way to *lose* a workout. It would also
 * reject a document from a future `schemaVersion` this build has never heard of,
 * which the service is supposed to store blindly. The three fields it does check
 * are exactly the three the service itself needs: `schemaVersion` for the indexed
 * column, `username` because it is the row key, and `history` because its length
 * is what the `sessions_completed` column holds now that the v3 document no longer
 * carries a `sessionsCompleted` field.
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
import Fastify from 'fastify'
import { createHash, timingSafeEqual } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { TypeCompiler } from '@sinclair/typebox/compiler'
import { DEFAULT_DB_FILE, RETENTION, openSnapshotStore } from './db.mjs'
// The wire contract, from the one place it is declared. `shared/` may not import
// `node:` anything, so nothing in here can drag a Node-only module into the client
// bundle or a browser-only one into this process. Node ≥22.18 strips the types at
// load; there is no build step.
import { LEGACY_USERNAME, USERNAME_RULE } from '@sports-app/shared/username.ts'
import {
  HEALTH_PATH,
  HealthResponse,
  LOGIN_PATH,
  LoginRequest,
  LoginResponse,
  SECRET_HEADER,
  STATE_PATH,
  SnapshotReceipt,
  StateDocumentEnvelope,
  StateQuery,
  USER_PARAM,
} from '@sports-app/shared/api.ts'

// Re-exported rather than redeclared: the routes are part of the wire contract, so
// they are declared beside the schemas that describe them. Callers keep naming
// them through this module, which is the module they are talking to.
export { HEALTH_PATH, LOGIN_PATH, SECRET_HEADER, STATE_PATH, USER_PARAM }

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
const JSON_CONTENT_TYPE_UTF8 = `${JSON_CONTENT_TYPE}; charset=utf-8`

// ─── Compiled validators ────────────────────────────────────────────────────
//
// Compiled once at module load, not per request. `TypeCompiler` generates a
// checking function with `new Function`, which is why the compilation happens here
// and not in `shared/api.ts`: that package has to work under a browser's
// Content-Security-Policy, and this one is a Node process.
//
// These are the *same* declarations Fastify's AJV validates `?user=` against. Two
// entry points into one schema, because a raw-string body cannot be handed to a
// body schema — see the file header.

const checkStateQuery = TypeCompiler.Compile(StateQuery)
const checkLoginRequest = TypeCompiler.Compile(LoginRequest)
const checkStateDocument = TypeCompiler.Compile(StateDocumentEnvelope)

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

// ─── Small helpers ──────────────────────────────────────────────────────────

/**
 * The path, without the query string.
 *
 * Fastify's router already matches on the path alone, so this is only needed
 * where a request has *not* matched a route — the 404/405 handler — and in log
 * lines, which must never carry a query string into a log file.
 *
 * @param {string | undefined} url
 * @returns {string}
 */
function pathOf(url) {
  return (url ?? '').split('?')[0]
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

/** The message a missing `?user=` gets — a different mistake, so a different message. */
export const USER_REQUIRED_ERROR = `user: required. Name whose document this is with ?${USER_PARAM}=…`

/**
 * Pull `?user=` off a request URL and validate it against `StateQuery`.
 *
 * Two callers, both real: the error handler, which turns Fastify's AJV rejection
 * into the contract's wording, and anything that needs to answer "is this a
 * serviceable target" without a socket — which is how the tests reach it.
 *
 * @param {string} url the raw request URL
 * @returns {{ok: true, username: string} | {ok: false, error: string}}
 */
export function readUsername(url) {
  const mark = url.indexOf('?')
  // `URLSearchParams` handles the percent-decoding, so `%2e%2e` and `a+b` are
  // decoded *before* the allowlist sees them rather than after — a check that
  // runs on the encoded form can be walked straight past.
  const raw = new URLSearchParams(mark === -1 ? '' : url.slice(mark + 1)).get(USER_PARAM)
  if (raw === null) return { ok: false, error: USER_REQUIRED_ERROR }
  if (!checkStateQuery.Check({ [USER_PARAM]: raw })) return { ok: false, error: USERNAME_ERROR }
  return { ok: true, username: raw }
}

// ─── Shallow document check ─────────────────────────────────────────────────

/**
 * What each field of `StateDocumentEnvelope` says when it fails.
 *
 * TypeBox reports a JSON pointer and a generic message ("Expected string"); the
 * contract's messages explain what the field is *for*, which is what a person
 * staring at a rejected sync actually needs. Keyed by pointer so adding a field to
 * the envelope without a message here is visible rather than silent.
 */
const DOCUMENT_ERRORS = {
  '/schemaVersion':
    'schemaVersion: expected a number. Every state document carries one; ' +
    'a body without it is probably not a state document at all.',
  '/username': `username: expected ${USERNAME_RULE}`,
  // Checked because `history.length` is what the `sessions_completed` column
  // holds — not because the server has an opinion about what is *in* the array.
  // It never looks inside.
  '/history': 'history: expected an array',
}

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
  // Ahead of the schema so that `null`, `[]` and `"a string"` get an answer about
  // the *document* rather than a pointer into a shape they do not have.
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'expected a JSON object at the top level' }
  }

  if (!checkStateDocument.Check(raw)) {
    // The *first* error, so the answer is about one field rather than a list —
    // and schema property order is what decides which one that is.
    const [first] = checkStateDocument.Errors(raw)
    const pointer = first === undefined ? '' : first.path
    const fallback = `${pointer}: ${first === undefined ? 'invalid' : first.message}`
    return { ok: false, error: DOCUMENT_ERRORS[pointer] ?? fallback }
  }

  return {
    ok: true,
    schemaVersion: raw.schemaVersion,
    username: raw.username,
    historyLength: raw.history.length,
  }
}

// ─── The login body ─────────────────────────────────────────────────────────

/**
 * Read a username out of a login body.
 *
 * **Only `username` is read.** See the file header: that is the decision, not an
 * oversight, and this function is the one place it could be broken. `LoginRequest`
 * declares one property and allows others, so a body carrying a credential is
 * accepted without anything here naming the field.
 *
 * Note what the failure path deliberately does *not* do: it does not include the
 * `JSON.parse` message. V8's parse errors quote a slice of the input, so an
 * unparseable login body would put part of a real credential into a response and
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

  if (!checkLoginRequest.Check(raw)) {
    return { ok: false, error: `username: expected ${USERNAME_RULE}` }
  }
  return { ok: true, username: raw.username }
}

// ─── The service ────────────────────────────────────────────────────────────

/**
 * The subset of `node:http.Server` this service is driven through.
 *
 * Fastify owns the socket internally and its own `listen` is promise-based, so
 * rather than leak that shape to every caller the three methods `main()` and the
 * tests actually use are adapted here. `listen` boots Fastify's plugin graph
 * first — routes are registered during `ready()`, so a raw `server.listen()` would
 * open the port before there was anything to route to.
 *
 * @typedef {object} StateService
 * @property {(port: number, host: string, onListening?: () => void) => void} listen
 * @property {() => import('node:net').AddressInfo | string | null} address
 * @property {(done?: () => void) => void} close
 */

/**
 * @param {{
 *   store: import('./db.mjs').SnapshotStore,
 *   secret: string,
 *   maxBodyBytes?: number,
 *   log?: (message: string) => void,
 * }} config
 * @returns {StateService}
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

  const app = Fastify({
    // The whole of the framework's logging, off. Not "configured to omit bodies" —
    // absent, so there is no logger a body could reach through a future option
    // change. The `log` callback above is the only output this process produces and
    // it is only ever handed fixed strings.
    logger: false,
    // Fastify would otherwise synthesise `HEAD` for every `GET` route, which would
    // turn today's `HEAD /api/state` 405 into a 200 with the document's headers.
    exposeHeadRoutes: false,
    bodyLimit: maxBodyBytes,
  })

  // ── The body arrives as a string, and is never parsed for us ──────────────
  //
  // `removeAllContentTypeParsers` drops Fastify's `application/json` *and* its
  // `text/plain` parser, so this service accepts exactly one media type and
  // everything else is a 415 — which is what it did before.
  //
  // The replacement returns the raw text unchanged. That is what makes
  // `GET /api/state` able to answer with the bytes it was given: the document is
  // never a JavaScript object in this process, so there is nothing to
  // re-serialise. It also means a login body never becomes a structured value
  // with a credential in a named field.
  app.removeAllContentTypeParsers()
  app.addContentTypeParser(
    JSON_CONTENT_TYPE,
    { parseAs: 'string', bodyLimit: maxBodyBytes },
    (_request, body, done) => {
      done(null, body)
    },
  )

  // ── Headers every response carries ────────────────────────────────────────
  //
  // In `onSend` rather than on each reply so that the 404, the 405 and the error
  // handler cannot forget them. This service holds one person's document and
  // nothing about it should ever be cached, sniffed, or framed.
  //
  // The trailing newline is part of the contract: every JSON body this service has
  // ever sent ended with one, so a `curl` of it does not run into the next shell
  // prompt. A `Buffer` payload — which is only ever a stored document — is left
  // exactly as it is, which is the point.
  app.addHook('onSend', (_request, reply, payload, done) => {
    reply.header('Cache-Control', 'no-store')
    reply.header('X-Content-Type-Options', 'nosniff')
    if (typeof payload === 'string' && !payload.endsWith('\n')) {
      done(null, `${payload}\n`)
      return
    }
    done(null, payload)
  })

  /**
   * The secret gate, as the earliest hook Fastify has.
   *
   * Route-level rather than global, which is what keeps two orderings right at
   * once: an unauthorised caller on a real route gets `401` *before* any
   * validation runs, and a caller on a path that does not exist gets `404`
   * without the secret being consulted at all — the same answer whether or not
   * they hold it.
   */
  async function requireSecret(request, reply) {
    if (secretMatches(request.headers[SECRET_HEADER], secret)) return
    log(`401 ${request.method} ${pathOf(request.url)}`)
    return reply.code(401).send({ error: 'unauthorized' })
  }

  function methodNotAllowed(reply, allow) {
    return reply
      .header('Allow', allow)
      .code(405)
      .send({ error: `method not allowed; try ${allow}` })
  }

  function unsupportedMediaType(reply) {
    return reply.code(415).send({ error: `expected Content-Type: ${JSON_CONTENT_TYPE}` })
  }

  // ── 404, and the 405 that has to be told apart from it ────────────────────
  //
  // Fastify routes both "no such path" and "that path, wrong method" here, and the
  // contract answers them differently — including who is allowed to know which.
  // `/api/health` says `405` to anyone, because liveness needs no credential;
  // `/api/state` and `/api/login` check the secret first, so an unauthorised
  // caller cannot use a `405` to learn that a route exists.
  app.setNotFoundHandler(async (request, reply) => {
    const path = pathOf(request.url)

    if (path === HEALTH_PATH) return methodNotAllowed(reply, 'GET, HEAD')

    if (path !== STATE_PATH && path !== LOGIN_PATH) {
      // Deliberately identical for "route does not exist" and "route exists but
      // you are not allowed to know". No listing, no hints.
      return reply.code(404).send({ error: 'not found' })
    }

    if (!secretMatches(request.headers[SECRET_HEADER], secret)) {
      log(`401 ${request.method} ${path}`)
      return reply.code(401).send({ error: 'unauthorized' })
    }

    return methodNotAllowed(reply, path === LOGIN_PATH ? 'POST' : 'GET, PUT')
  })

  // ── Framework errors, in the contract's words ─────────────────────────────
  //
  // Fastify's own error bodies carry `statusCode`, `code` and `error` keys. The
  // client reads `error` and nothing else, so each of the three reachable
  // framework failures is restated in the shape the contract has always used.
  app.setErrorHandler((error, request, reply) => {
    if (error.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') return unsupportedMediaType(reply)

    if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      // Close the connection after answering: the rest of an oversized body is
      // not going to be read, and leaving it half-consumed would stall the socket
      // until it timed out.
      reply.header('Connection', 'close')
      if (pathOf(request.url) === LOGIN_PATH) {
        // No echo of any kind beyond the limit itself: a body this route rejected
        // may well have carried a credential.
        return reply.code(413).send({ error: 'login body is too large', limit: maxBodyBytes })
      }
      return reply
        .code(413)
        .send({ error: `body exceeds the ${maxBodyBytes} byte limit`, limit: maxBodyBytes })
    }

    if (error.validation !== undefined) {
      // `?user=` is the only schema-validated input — the two JSON bodies are
      // checked by `checkDocument` / `checkCredentials`, which answer for
      // themselves. So a validation failure here is always about the target, and
      // `readUsername` states it in the contract's wording rather than AJV's.
      const who = readUsername(request.url ?? '')
      return reply.code(400).send({ error: who.ok ? USERNAME_ERROR : who.error })
    }

    const status = error.statusCode ?? 500
    if (typeof error.code === 'string' && error.code.startsWith('FST_') && status < 500) {
      // A framework rejection with no contract wording of its own — a malformed
      // request line, say. Fastify's message is about the request's syntax and
      // never quotes its body.
      return reply.code(status).send({ error: error.message })
    }

    log(`unhandled error: ${messageOf(error)}`)
    return reply.code(500).send({ error: 'internal error' })
  })

  // ── GET /api/health ───────────────────────────────────────────────────────
  //
  // Before auth, on purpose: the whole point is to answer "is the process up"
  // without needing a credential. It touches neither the database nor anything
  // about any document — no row is read, no username is revealed, and the response
  // schema pins the body to one fixed field, so it cannot become an existence
  // oracle for an account or a leak of how much history is stored.
  app.route({
    method: ['GET', 'HEAD'],
    url: HEALTH_PATH,
    schema: { response: { 200: HealthResponse } },
    handler: () => ({ status: 'ok' }),
  })

  // ── POST /api/login ───────────────────────────────────────────────────────
  //
  // Accept a username, ignore everything else, answer with the username.
  //
  // That really is the whole handler. It exists so that the login screen has
  // something to fail against when the service is unreachable or the deployment
  // secret is wrong, and so the username is validated once before it becomes a
  // stream key — not to decide whether anybody may proceed. Nothing is written:
  // an account comes into existence when a document is stored under its name, and
  // until then there is nothing to create.
  app.route({
    method: 'POST',
    url: LOGIN_PATH,
    onRequest: requireSecret,
    schema: { response: { 200: LoginResponse } },
    handler: (request, reply) => {
      const text = request.body
      // Fastify skips parsing entirely when a request has no body *and* no
      // content type, so there is nothing to have been a media-type error. It is
      // still one: this route accepts exactly one media type and got none.
      if (text === undefined) return unsupportedMediaType(reply)

      const checked = checkCredentials(text)
      if (!checked.ok) {
        // `checked.error` is one of a fixed set of messages that never contains
        // any part of the request body. That is what makes it safe to log.
        log(`400 POST ${LOGIN_PATH}: ${checked.error}`)
        return reply.code(400).send({ error: checked.error })
      }

      log(`login ${checked.username} (no password was read, compared, or stored)`)
      return reply.code(200).send({ username: checked.username })
    },
  })

  // ── GET /api/state ────────────────────────────────────────────────────────
  //
  // No `response` schema on the 200. Attaching one would hand the reply to
  // fast-json-stringify, which is exactly the re-serialisation this route exists
  // not to do.
  app.route({
    method: 'GET',
    url: STATE_PATH,
    onRequest: requireSecret,
    schema: { querystring: StateQuery },
    handler: (request, reply) => {
      const username = request.query[USER_PARAM]

      const snapshot = store.latest(username)
      if (snapshot === null) {
        // 404 rather than an empty document: "nothing has ever been stored for
        // this user" is exactly the new-device case the client needs to
        // distinguish from "the remote holds a document with zero sessions".
        return reply.code(404).send({ error: 'no state has been stored yet for this user' })
      }

      // `Buffer.from(text, 'utf8')` plus Fastify's own `Content-Length` is what
      // makes the round trip byte-identical: no re-encoding, no pretty-printing,
      // no chunked-transfer surprises.
      //
      // The snapshot headers are advisory only. The client compares session counts
      // read from inside the document, never a header, so a proxy that strips them
      // changes nothing. Deliberately no `X-Snapshot-User`: the username is in the
      // document, and a header would be a second place for it to disagree.
      return reply
        .code(200)
        .header('Content-Type', JSON_CONTENT_TYPE_UTF8)
        .header('X-Snapshot-Id', String(snapshot.id))
        .header('X-Snapshot-Created-At', snapshot.createdAt)
        .send(Buffer.from(snapshot.docJson, 'utf8'))
    },
  })

  // ── PUT /api/state ────────────────────────────────────────────────────────
  app.route({
    method: 'PUT',
    url: STATE_PATH,
    onRequest: requireSecret,
    schema: { querystring: StateQuery, response: { 200: SnapshotReceipt } },
    handler: (request, reply) => {
      const username = request.query[USER_PARAM]

      const text = request.body
      if (text === undefined) return unsupportedMediaType(reply)

      const checked = checkDocument(text)
      if (!checked.ok) {
        log(`400 PUT ${STATE_PATH}: ${checked.error}`)
        // Nothing has been written. The newest snapshot is untouched.
        return reply.code(400).send({ error: checked.error })
      }

      if (checked.username !== username) {
        // The one check that needs both the target and the document. A client bug
        // that sends the wrong document — a stale one from a previous account, say,
        // after a logout that missed a code path — would otherwise write silently
        // into a stream it does not belong to, and the overwritten snapshot would
        // be somebody else's training history.
        //
        // 400 and not 409: nothing is in conflict. One of the two names is simply
        // wrong, and folding them together is precisely what `shared/username.ts`
        // refuses to do.
        const error =
          `username mismatch: ?${USER_PARAM}=${username} but the document says ` +
          `${checked.username}. Nothing was stored.`
        log(`400 PUT ${STATE_PATH}: ${error}`)
        return reply.code(400).send({ error })
      }

      // `text`, not a re-serialisation of a parsed object — there is no parsed
      // object. See the "Bytes in, same bytes out" note in db.mjs.
      const written = store.insert({
        username,
        docJson: text,
        historyLength: checked.historyLength,
        schemaVersion: checked.schemaVersion,
      })

      log(
        `stored snapshot ${written.id} for ${username} (${checked.historyLength} sessions, ` +
          `${text.length} bytes, pruned ${written.pruned})`,
      )

      return reply.code(200).send({
        id: written.id,
        createdAt: written.createdAt,
        username,
        historyLength: checked.historyLength,
        schemaVersion: checked.schemaVersion,
        bytes: text.length,
        pruned: written.pruned,
        // This user's rows, not the table's. A count of everybody's would tell
        // each user how much other people train.
        retained: store.count(username),
      })
    },
  })

  return {
    listen(port, host, onListening) {
      app
        .listen({ port, host })
        .then(() => {
          if (onListening !== undefined) onListening()
        })
        .catch((cause) => {
          // `node:http` reports a failed bind by emitting `error` on the server,
          // and an unhandled one takes the process down. Re-emitting keeps that
          // behaviour: a service that cannot bind its port must not look started.
          app.server.emit('error', cause)
        })
    },
    address() {
      return app.server.address()
    },
    close(done) {
      void app.close().then(() => {
        if (done !== undefined) done()
      })
    },
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
