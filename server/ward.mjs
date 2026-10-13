import { isValidUsername, USERNAME_RULE } from '@sports-app/shared/username.ts'
import {
  createAccounts,
  createSqliteStore,
  createWardClient,
  createWardIdentities,
  wardClientOptionsFromEnv,
} from './vendor/ward/ward-auth.js'

/**
 * Accounts and "Sign in with Ward", as this service wires them.
 *
 * ── What this file used to be ────────────────────────────────────────────────
 *
 * ~290 lines of hand-written Ward client: a JWKS-verified access token, an
 * introspection call with an app key, a 30-second cache, fail-closed. All of it
 * is the vendored library's job now (`vendor/ward/`, version in its README), and
 * the library does it from the other side: the app owns its accounts and its
 * sessions, and Ward is a second way in that this service reaches through
 * OpenID Connect. Local sign-in never calls Ward, so the service works while
 * Ward is down. This file is what is left: the configuration, and the two
 * decisions that are this app's own.
 *
 * ── The two prefixes, and why there are two ──────────────────────────────────
 *
 * Fastify sees `/api/...` in every environment. What differs is what the
 * **browser** sees in front of it: nothing in development (Vite proxies `/api`
 * and strips nothing), `/sports-app-api` behind the deploy's reverse proxy,
 * which strips that and forwards `/api/...`. The session cookie's `Path` and
 * Ward's redirect URI both have to be the browser's view, so both come from
 * configuration and **never** from a literal:
 *
 *   - `ROUTE_PREFIX` — Fastify's own, `/api/auth`, constant.
 *   - `SPORTS_APP_API_PREFIX` — what the browser puts in front of `/api`:
 *     empty by default, `/sports-app-api` in the deploy. The cookie's `Path` is
 *     `${prefix}/api`.
 *   - `WARD_OIDC_REDIRECT_URI` — registered at Ward and set per environment. The
 *     library refuses to start unless its path ends in `/api/auth/ward/callback`
 *     and sits under the cookie's `Path`, so the two cannot drift apart unnoticed.
 *
 * ── Usernames are this app's rule, not the library's ─────────────────────────
 *
 * The snapshot stream is keyed by the signed-in user's username, and
 * `shared/username.ts` says what a username may be: lowercase, at most 32
 * characters. The library accepts far more (Ward's own limit), and has no hook
 * to reshape a name it creates on a first Ward sign-in. So a person whose Ward
 * name is `Alice` gets a local user the document schema cannot hold. That
 * session is refused with `unsupported_username`, which the login page words,
 * rather than being signed in to an app whose every save would be a 400.
 */

/** The session cookie. Unique in the estate, because every app shares one origin. */
export const SESSION_COOKIE_NAME = 'sports_app_session'

/** Where the library's routes live, as Fastify sees them. */
export const ROUTE_PREFIX = '/api/auth'

/** What a new user created by this service holds. The app has no roles of its own. */
export const DEFAULT_ROLE = 'user'

/** The sub-path the client is served from, matching `SPORTS_APP_BASE` in the client build. */
const DEFAULT_BASE = '/sports-app/'

/**
 * The reason a session is refused for a name the document schema cannot hold.
 * The login page words it; nothing here does.
 */
export const UNSUPPORTED_USERNAME = 'unsupported_username'

/**
 * `''` or a leading-slash path with no trailing slash. A typo here would put the
 * cookie on a path the browser never visits, which fails as "sign-in does
 * nothing" — so it is refused at boot instead.
 *
 * @param {string | undefined} value
 */
function normaliseApiPrefix(value) {
  const prefix = (value ?? '').trim()
  if (prefix === '') return ''
  if (!/^\/[A-Za-z0-9._~/-]*[A-Za-z0-9._~-]$/.test(prefix)) {
    throw new Error(
      `SPORTS_APP_API_PREFIX must be empty or a path like /sports-app-api (a leading slash, no trailing one), got "${prefix}"`,
    )
  }
  return prefix
}

/** `/sports-app/` with a leading and trailing slash, the way the client build reads it. */
function normaliseBase(value) {
  const segment = (value ?? '').replace(/^\/+|\/+$/g, '')
  return segment === '' ? '/' : `/${segment}/`
}

/**
 * Everything the auth wiring needs from the environment.
 *
 * Throws, naming what is missing, rather than returning a half-configured value:
 * a service that cannot say what origin it is served from would mint cookies
 * that are either not `Secure` or not sent back.
 *
 * @param {Record<string, string | undefined>} env
 */
export function readAuthConfig(env) {
  const wardOptions = wardClientOptionsFromEnv(env)

  // The redirect URI is, by definition, an address on the app's public origin, so
  // it names it when nothing else does. An explicit value wins.
  const explicit = (env.SPORTS_APP_PUBLIC_ORIGIN ?? '').trim()
  let publicOrigin = explicit
  if (publicOrigin === '' && wardOptions !== undefined) {
    publicOrigin = new URL(wardOptions.redirectUri).origin
  }
  if (publicOrigin === '') {
    throw new Error(
      'SPORTS_APP_PUBLIC_ORIGIN is not set, so the service cannot tell whether cookies may be marked Secure.\n' +
        'Set it to the address the browser uses for the app, without a path, e.g. https://example.com\n' +
        '(http://localhost:5173 in development).',
    )
  }
  publicOrigin = new URL(publicOrigin).origin

  const apiPrefix = normaliseApiPrefix(env.SPORTS_APP_API_PREFIX)
  const base = normaliseBase(env.SPORTS_APP_BASE ?? DEFAULT_BASE)

  return {
    publicOrigin,
    apiPrefix,
    cookiePath: `${apiPrefix}/api`,
    cookieName: SESSION_COOKIE_NAME,
    // Browser paths on the app's own origin, built from the same base the client
    // build uses, so the callback lands on pages that exist.
    loginPath: `${base}login`,
    settingsPath: `${base}account`,
    afterSignInPath: `${base}login`,
    wardOptions,
  }
}

/**
 * Open the accounts on the snapshot store's own handle.
 *
 * `createSqliteStore` applies the library's migrations to the same database
 * file, in its own `auth_*` tables. It can run before or after anything else
 * here, because the two never touch each other's tables.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 */
export function openAccounts(db) {
  return createAccounts({ store: createSqliteStore(db) })
}

/** A Ward subject: 128 random bits, hex. What the stream key was between 2026-09-06 and accounts. */
const WARD_SUBJECT = /^[0-9a-f]{32}$/

/**
 * Give every stream keyed by a Ward subject an account that Ward can find.
 *
 * From 2026-09-06 until accounts existed, the stream key was the session's Ward
 * **subject**, so a person who synced then has a stream named `3f9a…` (32 hex).
 * After the move their first "Sign in with Ward" would create a local `alice` with
 * an empty stream, and their history would sit under a name nobody can type. So for
 * each such key this creates a local user whose username *is* the key, linked to
 * that subject, and the next Ward sign-in finds it. No row is rewritten and no name
 * is matched: the key is the subject, which is the one thing the app knew.
 *
 * Idempotent (`findUserBySubject` first), one transaction per user, and it needs no
 * Ward client — linking a subject does not call Ward. The honest cost: that
 * person's name is the hex string until it is renamed by hand, because the library
 * has no rename and a snapshot stream cannot be moved without rewriting the
 * documents inside it.
 *
 * Streams that are not a subject (`local`, a name typed before Ward) are left to
 * `orphanStreamNames` and the seed.
 *
 * @param {import('./db.mjs').SnapshotStore} store
 * @param {import('./vendor/ward/ward-auth.js').Accounts} accounts
 * @returns {Promise<string[]>} the subjects linked by this call
 */
export async function linkWardStreams(store, accounts) {
  const identities = createWardIdentities({ accounts })
  const linked = []
  for (const key of store.usernames()) {
    if (!WARD_SUBJECT.test(key)) continue
    if ((await identities.findUserBySubject(key)) !== undefined) continue
    await identities.createLinkedUser({
      subject: key,
      id: key,
      username: key,
      role: DEFAULT_ROLE,
    })
    linked.push(key)
  }
  return linked
}

/**
 * Name the snapshot streams that no account owns.
 *
 * This is the data-migration seam, and it only reports. Snapshots are keyed by
 * username, and a stream written before the Ward cutover is keyed by whatever
 * name its owner typed then. It is read again the moment an account with that
 * exact username exists (`npm run seed`, then "Link Ward" in settings). A stream
 * whose key matches no account is not lost, only unreachable until then, so the
 * list is worth a line at startup rather than a warning.
 *
 * @param {import('./db.mjs').SnapshotStore} store
 * @param {import('./vendor/ward/ward-auth.js').Accounts} accounts
 * @returns {Promise<string[]>}
 */
export async function orphanStreamNames(store, accounts) {
  const orphans = []
  for (const username of store.usernames()) {
    if ((await accounts.findUserByUsername(username)) === undefined) orphans.push(username)
  }
  return orphans
}

/**
 * The Ward client, or `undefined` when `WARD_OIDC_ISSUER` is not set and the
 * service runs with local accounts only.
 *
 * `createWardClient` checks the values and imports the key now, so a bad key
 * fails at startup. It does **not** contact Ward: discovery is lazy, so the
 * service starts while Ward is down.
 *
 * @param {ReturnType<typeof readAuthConfig>} config
 * @param {{ fetch?: typeof fetch }} [overrides]
 */
export async function openWardClient(config, overrides = {}) {
  if (config.wardOptions === undefined) return undefined
  return createWardClient({ ...config.wardOptions, ...overrides })
}

/**
 * The app's own session check, after the library's Ward one.
 *
 * It does no I/O and answers for every session, local or Ward: whichever way a
 * person got in, their username is a stream key, so it has to be one the
 * document schema accepts. Refused without ending the session, so the answer
 * stays visible (`reason` on `GET /api/auth/session`) instead of looping the
 * person through a sign-in that succeeds and is then silently discarded.
 *
 * @type {import('./vendor/ward/ward-auth.js').SessionValidator}
 */
export function requireSupportedUsername(resolved) {
  if (isValidUsername(resolved.user.username)) return { ok: true }
  return { ok: false, reason: UNSUPPORTED_USERNAME }
}

/** For the seed script, which has to say the same thing before it creates anyone. */
export { USERNAME_RULE }
