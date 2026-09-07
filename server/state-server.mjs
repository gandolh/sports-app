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
import { createWardClient, WardUnavailableError } from './ward.mjs'
// The wire contract, from the one place it is declared. `shared/` may not import
// `node:` anything, so nothing in here can drag a Node-only module into the client
// bundle or a browser-only one into this process. Node ≥22.18 strips the types at
// load; there is no build step.
import { LEGACY_USERNAME, USERNAME_RULE } from '@sports-app/shared/username.ts'
import {
  HEALTH_PATH,
  HealthResponse,
  STATE_PATH,
  SnapshotReceipt,
  StateDocumentEnvelope,
} from '@sports-app/shared/api.ts'

// Re-exported rather than redeclared: the routes are part of the wire contract, so
// they are declared beside the schemas that describe them. Callers keep naming
// them through this module, which is the module they are talking to.
export { HEALTH_PATH, STATE_PATH }

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

const checkStateDocument = TypeCompiler.Compile(StateDocumentEnvelope)

// ─── Auth ───────────────────────────────────────────────────────────────────


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
 *   ward: { authenticate: (cookieHeader: string | undefined) => Promise<{subject: string, username: string}> },
 *   maxBodyBytes?: number,
 *   log?: (message: string) => void,
 * }} config
 * @returns {StateService}
 */
export function createStateServer(config) {
  const { store } = config
  const ward = config.ward
  const maxBodyBytes = config.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES
  const log = config.log ?? (() => {})

  if (ward === undefined || typeof ward.authenticate !== 'function') {
    // Refusing here rather than defaulting is the point, and it is the same
    // point the shared secret used to make: a service with no way to identify
    // its callers looks authenticated and is not.
    throw new Error('createStateServer requires a Ward client')
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
   * The session gate, as the earliest hook Fastify has.
   *
   * Route-level rather than global, which keeps two orderings right at once: an
   * unauthorised caller on a real route is refused *before* any validation
   * runs, and a caller on a path that does not exist gets `404` without a
   * session being consulted at all — the same answer whether or not they hold
   * one.
   *
   * The resolved subject is put on the request. **That subject is the document
   * key** — see the `?user=` note in the file header for what that replaced.
   */
  async function requireSession(request, reply) {
    try {
      const session = await ward.authenticate(request.headers.cookie)
      request.ward = session
      return
    } catch (error) {
      /*
       * 503, not 401, when Ward cannot be reached. The distinction is the whole
       * reason `WardUnavailableError` exists: telling a client it is signed out
       * when the identity service is down sends somebody to a login page that
       * cannot work either, and — worse — a sync client would treat it as a
       * reason to drop its session rather than to retry.
       */
      if (error instanceof WardUnavailableError) {
        log(`503 ${request.method} ${pathOf(request.url)}: ward unavailable`)
        return reply.code(503).send({ error: 'identity service unavailable' })
      }

      // 401 for no session, 403 for a live session with no `sports-app` grant.
      // The client can act on the first and not the second, which is why they
      // are not folded together.
      const status = error.statusCode === 403 ? 403 : 401
      log(`${status} ${request.method} ${pathOf(request.url)}`)
      return reply.code(status).send({ error: status === 403 ? 'forbidden' : 'unauthorized' })
    }
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

    if (path !== STATE_PATH) {
      // Deliberately identical for "route does not exist" and "route exists but
      // you are not allowed to know". No listing, no hints.
      return reply.code(404).send({ error: 'not found' })
    }

    try {
      await ward.authenticate(request.headers.cookie)
    } catch {
      // Deliberately collapsed to 401 here, unlike `requireSession`: this is the
      // not-found handler, and the point of checking at all is that an
      // unauthorised caller cannot use a `405` to learn a route exists. Telling
      // them *why* they were refused would leak the same thing more slowly.
      log(`401 ${request.method} ${path}`)
      return reply.code(401).send({ error: 'unauthorized' })
    }

    return methodNotAllowed(reply, 'GET, PUT')
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
      return reply
        .code(413)
        .send({ error: `body exceeds the ${maxBodyBytes} byte limit`, limit: maxBodyBytes })
    }

    /*
     * There is no schema-validated input left.
     *
     * `?user=` was the only one, and it is gone: the stream key is the session's
     * subject now, so there is nothing on the query string for AJV to reject.
     * The JSON body is checked by `checkDocument`, which answers in the
     * contract's own wording. This branch is therefore unreachable, and it is
     * removed rather than left as dead code that would quietly start firing if
     * a future route added a schema and forgot to word its own errors.
     */

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

  /*
   * `POST /api/login` is gone.
   *
   * It never authenticated anybody — it validated a username and echoed it back,
   * so a login screen had something to fail against. Signing in is Ward's now,
   * at one page for the estate, and the username this service uses comes from
   * the session rather than from a client claiming one.
   */

  // ── GET /api/state ────────────────────────────────────────────────────────
  //
  // No `response` schema on the 200. Attaching one would hand the reply to
  // fast-json-stringify, which is exactly the re-serialisation this route exists
  // not to do.
  app.route({
    method: 'GET',
    url: STATE_PATH,
    onRequest: requireSession,
    handler: (request, reply) => {
      /*
       * The stream key is the SESSION's subject, not a query parameter.
       *
       * This is the security change the Ward cutover is worth here. `?user=`
       * used to be the only way to say whose document was wanted, and the
       * shared secret authenticated the installation rather than a person — so
       * anyone holding it could read anyone's training history by changing a
       * name in a URL. The file header said so plainly and accepted it for a
       * single-user deployment on loopback.
       *
       * Now there is nothing to choose: a caller reads their own stream because
       * it is the only one they can name.
       */
      const username = request.ward.subject

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
    onRequest: requireSession,
    schema: { response: { 200: SnapshotReceipt } },
    handler: (request, reply) => {
      // The session's subject, for the reason `GET` gives above.
      const username = request.ward.subject

      const text = request.body
      if (text === undefined) return unsupportedMediaType(reply)

      const checked = checkDocument(text)
      if (!checked.ok) {
        log(`400 PUT ${STATE_PATH}: ${checked.error}`)
        // Nothing has been written. The newest snapshot is untouched.
        return reply.code(400).send({ error: checked.error })
      }

      if (checked.username !== username) {
        /*
         * The document names somebody other than the caller.
         *
         * This check survives the cutover and is *more* useful than before, not
         * less. It used to compare two client-supplied values — `?user=` and
         * the document's own name — which caught a client bug but could not
         * catch a malicious caller, since they controlled both. Now one side is
         * the session's subject, so this refuses a caller trying to write into
         * somebody else's stream as well as a client that got confused.
         *
         * 400 and not 409: nothing is in conflict. One of the two names is
         * simply wrong, and folding them together is precisely what
         * `shared/username.ts` refuses to do.
         *
         * In practice a client should put the subject in the document; the
         * ordinary cause of this in the field will be a document written before
         * the cutover, under the old username.
         */
        const error =
          `username mismatch: the session is ${username} but the document says ` +
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
    wardPublicOrigin: env.WARD_PUBLIC_ORIGIN ?? '',
    wardApiBasePath: env.WARD_API_BASE_PATH ?? '',
    wardAppKey: env.WARD_APP_KEY ?? '',
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

  /*
   * All three Ward variables are required, and none is defaulted.
   *
   * The old refusal here was about a blank shared secret looking like auth and
   * not being it. The same argument applies, one layer up: without these there
   * is no way to identify a caller at all, and `WARD_API_BASE_PATH` in
   * particular must never default to empty — that resolves Ward's JWKS to
   * `<origin>/.well-known/jwks.json`, a path nothing serves, so every token
   * would be rejected with a clean log on the deploy that shipped it.
   */
  const missing = ['WARD_PUBLIC_ORIGIN', 'WARD_API_BASE_PATH', 'WARD_APP_KEY'].filter(
    (name) => (env[name] ?? '') === '',
  )
  if (missing.length > 0) {
    out.error(
      `${missing.join(', ')} not set, so there would be no way to tell callers apart.\n\n` +
        'This service uses Ward, the estate\'s identity service. Issue an app key in\n' +
        "Ward's console (the sports-app page, \"Service keys\") — it is shown once — then:\n\n" +
        '  WARD_PUBLIC_ORIGIN=https://gandolh.ro \\\n' +
        '  WARD_API_BASE_PATH=/ward-api \\\n' +
        '  WARD_APP_KEY=wak_… \\\n' +
        '    npm run server\n\n' +
        'See server/README.md. Never commit the key.',
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
    ward: createWardClient({
      publicOrigin: config.wardPublicOrigin,
      apiBasePath: config.wardApiBasePath,
      appKey: config.wardAppKey,
    }),
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
