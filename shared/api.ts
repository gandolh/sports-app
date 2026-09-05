/**
 * The four endpoints, as schemas — **one declaration per wire shape, read by the
 * service's validator and by the type checker.**
 *
 * ── Why this file exists, and why brief 21 deliberately did not create it ────
 *
 * Brief 21 built the `shared/` workspace and stopped short of this file on
 * purpose: an empty `api.ts` would have been a placeholder pretending to be a
 * contract, and the wire shapes were still hand-checked in
 * `server/state-server.mjs` at the time. Brief 22 moved the service onto Fastify,
 * whose validation is schema-driven, so there is finally a *consumer* for a schema
 * — and the point of putting it here rather than in `server/` is that one
 * declaration now produces both the runtime guard and the TypeScript type
 * (`corpus/wiki/technical-decisions.md § "Three npm workspaces"`).
 *
 * ── TypeBox, not hand-written JSON Schema, and not Zod ──────────────────────
 *
 * A `Type.Object({...})` value *is* a JSON Schema object, so Fastify's AJV reads
 * these directly with no adapter, and `Static<typeof X>` gives the TypeScript type
 * from the same expression. Hand-written JSON Schema plus a separately maintained
 * interface would recreate exactly the duplication `shared/` was created to
 * delete — two declarations of one fact, kept in step by nobody. Zod would work
 * through a type provider, but it produces its own schema language and would need
 * a conversion step to reach AJV.
 *
 * It also satisfies the hard constraint on this package: TypeBox is pure data and
 * pure functions, so nothing here reaches for `node:` or the DOM. The
 * *compilation* of these schemas into validators happens in the service, not
 * here — `TypeCompiler` generates code with `new Function`, which is a runtime
 * capability a strict Content-Security-Policy can withhold, and this package has
 * to behave identically in a browser.
 *
 * ── What is deliberately NOT here ───────────────────────────────────────────
 *
 * **No schema for the whole `StateDoc`.** `PUT /api/state` validates exactly three
 * fields (see `StateDocumentEnvelope`) and the client codec owns the canonical
 * shape. A schema here that described every field would make the service a second
 * source of truth for the document, and — worse — it would reject a document from
 * a *future* `schemaVersion` that the service is supposed to store blindly. There
 * is a test that a document from an unknown version round-trips.
 *
 * That is not a hypothetical any more. v4 arrived and **nothing in this file or in
 * `server/` changed**, which is the design working: the service never held a list
 * of versions it accepts, so there was no list to add 4 to. Migration is the
 * client's, in `client/src/persistence/codec.ts`, and the service's contribution is
 * to store every version faithfully enough that the client can migrate it later.
 *
 * **No schema for `ExerciseRecord.logged` either**, and that one is a rule rather
 * than an omission. `history` is `Type.Array(Type.Unknown())`; logged values cross
 * the wire as opaque numbers the service copies and never reads. No route may sum,
 * index, or index-on them — a SQL aggregate over `logged` would make the service a
 * consumer of the programme, which is the same line `Rung` is kept on the other
 * side of (see `types.ts`, "ids cross the wire, content does not").
 *
 * **No password.** `LoginRequest` declares `username` and nothing else, and
 * additional properties are allowed, which is how a login body carrying a
 * credential is accepted without any part of this repository naming the field.
 * See `corpus/wiki/technical-decisions.md § "Authentication is a nameplate"`.
 */
import { Type, type Static } from '@sinclair/typebox'
import { USERNAME_PATTERN, USERNAME_RULE } from './username.ts'

// ─── Where the routes live ──────────────────────────────────────────────────
//
// These were written twice — once in `server/state-server.mjs`, once in
// `client/src/persistence/sync.ts` under a comment reading "mirrors
// server/state-server.mjs". The service now imports them from here; the client's
// copy is still its own, because brief 22 may not touch `client/`. That leaves the
// same two copies as before rather than adding a third, and puts the definition
// somewhere the client can delete its copy *into*.

export const SECRET_HEADER = 'x-sync-secret'
export const HEALTH_PATH = '/api/health'
export const LOGIN_PATH = '/api/login'
export const STATE_PATH = '/api/state'

/** The query parameter that names whose stream a `/api/state` request is about. */
export const USER_PARAM = 'user'

// ─── The username, as a schema ──────────────────────────────────────────────

/**
 * The one username rule, expressed for a validator.
 *
 * `USERNAME_PATTERN.source` rather than a copy of the pattern text: the regex and
 * the schema are the same rule and must not be able to disagree. The length cap
 * is already inside the pattern, so there is no `maxLength` here either — a second
 * statement of the bound is a second thing to keep in step.
 *
 * `description` carries `USERNAME_RULE` so a generated schema document says what
 * the rule *is* rather than making a reader decode the character class.
 */
export const Username = Type.String({
  pattern: USERNAME_PATTERN.source,
  description: USERNAME_RULE,
})

// ─── GET /api/health ────────────────────────────────────────────────────────

/**
 * Exactly one key, and `additionalProperties: false` so the serialiser enforces
 * it.
 *
 * That is the whole point of liveness having a schema: no version, no uptime, no
 * row count, no user list. A future edit that adds a field to the handler is
 * silently dropped rather than turning `/api/health` into an oracle for who uses
 * this deployment. There is a test asserting the response has one key.
 */
export const HealthResponse = Type.Object(
  { status: Type.Literal('ok') },
  { additionalProperties: false },
)
export type HealthResponse = Static<typeof HealthResponse>

// ─── POST /api/login ────────────────────────────────────────────────────────

/**
 * What a login body must contain. Additional properties are allowed — see the
 * file header for why that is the whole mechanism by which a credential is
 * accepted and never named.
 */
export const LoginRequest = Type.Object({ username: Username })
export type LoginRequest = Static<typeof LoginRequest>

/**
 * The username back, and nothing else. No token, no session id, no expiry: there
 * is no session to represent and inventing one would imply a boundary that does
 * not exist.
 */
export const LoginResponse = Type.Object({ username: Username }, { additionalProperties: false })
export type LoginResponse = Static<typeof LoginResponse>

// ─── /api/state ─────────────────────────────────────────────────────────────

/**
 * `?user=alice`, on `GET` and `PUT` alike.
 *
 * Additional query parameters are allowed, because they are meaningless to this
 * service and rejecting them would break nothing but a caller that appended a
 * cache-buster. `user` itself is required: on `GET` it is the only statement of
 * whose document is wanted, and on `PUT` it is the independent target that the
 * document's own `username` is compared against.
 */
export const StateQuery = Type.Object({ [USER_PARAM]: Username })
export type StateQuery = Static<typeof StateQuery>

/**
 * **The shallow check, and deliberately nothing more.** Three fields, because
 * three are all the service itself needs:
 *
 *   - `schemaVersion` — copied into an indexed column and never interpreted, so a
 *     number is the only requirement. A document from a future version must round
 *     trip.
 *   - `username` — the row key, compared against `?user=`.
 *   - `history` — its *length* becomes the `sessions_completed` column. The
 *     service never looks inside, hence `Type.Unknown()` for the elements rather
 *     than a `SessionResult` schema.
 *
 * Property order is load-bearing in one small way: the service reports the first
 * validation failure, and these are the order a human would want to hear about
 * them in.
 */
export const StateDocumentEnvelope = Type.Object({
  schemaVersion: Type.Number(),
  username: Username,
  history: Type.Array(Type.Unknown()),
})
export type StateDocumentEnvelope = Static<typeof StateDocumentEnvelope>

/**
 * What a successful `PUT` reports back.
 *
 * `retained` is **this user's** row count, never the table's — a count of
 * everybody's would tell each user how much other people train. `bytes` is the
 * length of the stored document as it arrived, which is the number the client can
 * compare against what it sent.
 */
export const SnapshotReceipt = Type.Object(
  {
    id: Type.Number(),
    createdAt: Type.String(),
    username: Username,
    historyLength: Type.Number(),
    schemaVersion: Type.Number(),
    bytes: Type.Number(),
    pruned: Type.Number(),
    retained: Type.Number(),
  },
  { additionalProperties: false },
)
export type SnapshotReceipt = Static<typeof SnapshotReceipt>

// ─── Errors ─────────────────────────────────────────────────────────────────

/**
 * Every non-2xx body on every route: one `error` string, and on a `413` the limit
 * that was exceeded.
 *
 * The string never echoes any part of the request. A rejected username states the
 * rule rather than repeating the value, because echoing it would put
 * attacker-controlled text into a body some client will eventually render — and on
 * `/api/login` a body that failed to parse may well have had a credential in it.
 */
export const ErrorResponse = Type.Object({
  error: Type.String(),
  limit: Type.Optional(Type.Number()),
})
export type ErrorResponse = Static<typeof ErrorResponse>
