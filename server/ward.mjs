import { createRemoteJWKSet, jwtVerify } from 'jose'

/**
 * Ward, the estate's identity service, as the state service consumes it.
 *
 * ── Why this file exists, and why it is hand-written ─────────────────────────
 *
 * Ward ships a tested client package, and this app deliberately does not depend
 * on it: the estate's apps are separate checkouts that `npm ci` independently,
 * so no build resolves a workspace package from another repo. The contract every
 * app implements is `wzd_auth/corpus/wiki/integrating.md`, and
 * `wzd_auth/client/src/` is the tested reference these ~150 lines were adapted
 * from. **Change the contract there before changing behaviour here.**
 *
 * ── What this replaced, and why it is a real upgrade ─────────────────────────
 *
 * The service used to hold ONE shared secret in a header — the same string for
 * every caller, with `?user=` naming whose document was wanted. That secret
 * authenticated the *installation*, never a person: anyone holding it could read
 * or write anyone's training history by changing a query parameter, and the file
 * header said so plainly rather than pretending otherwise.
 *
 * Ward's session authenticates a **person**. The subject it returns is the
 * document key, so `?user=` stops being a target a caller chooses and becomes a
 * value the server already knows. That is the whole security change, and it is
 * why the cutover is worth more here than in any other app in the estate: this
 * one had no per-user boundary at all.
 *
 * ── The five things this must get right ──────────────────────────────────────
 *
 * Each is implemented below with a comment naming it: pin the algorithm, send
 * the base path, send the app key, cache the answer 30 seconds, and fail closed.
 */

/** The `alg` every Ward access token is signed with. Pinned, never derived. */
const ACCESS_TOKEN_ALG = 'EdDSA'

/** The `aud` Ward puts on every access token — one estate-wide value. */
const ACCESS_TOKEN_AUDIENCE = 'ward-estate'

/** Clock-skew allowance, seconds. Tight: this runs on the same box as Ward. */
const CLOCK_TOLERANCE_SECONDS = 5

/**
 * The introspection cache window: 30 seconds.
 *
 * This is exactly how long a revoked session stays usable here, and it is the
 * number the estate's whole revocation design rests on. Do not raise it to save
 * a round trip — the round trip is the feature.
 */
const INTROSPECTION_CACHE_TTL_MS = 30_000

/** Ward's app-key header. The value is a server-side secret. */
const APP_KEY_HEADER = 'x-ward-app-key'

/** Ward's access cookie. Nothing outside this file should know the name. */
const ACCESS_COOKIE = 'ward_session'

/** This app's slug in Ward, and the key into a grant map. */
export const SPORTS_APP_SLUG = 'sports-app'

/** The token is absent, malformed, expired, forged, or its session is dead. */
export class WardAuthenticationError extends Error {
  constructor(message, options) {
    super(message, options)
    this.name = 'WardAuthenticationError'
    this.statusCode = 401
  }
}

/**
 * Ward could not answer, so this service does not know — and must not guess.
 *
 * Every caller fails the request closed. Ward being unreachable already means
 * nobody can sign in; it must not *also* mean revocation quietly stops working
 * because something treated "I don't know" as "yes".
 */
export class WardUnavailableError extends Error {
  constructor(message, options) {
    super(message, options)
    this.name = 'WardUnavailableError'
    this.statusCode = 503
  }
}

/**
 * Ward rejected THIS SERVICE's key with a 401.
 *
 * A subclass of `WardUnavailableError`, so the fail-closed handling that already
 * catches that class is right here too — this adds information without needing a
 * new branch anywhere. What it adds is diagnosability: every other failure is
 * transient and about Ward, and this one is permanent and about this
 * deployment's `WARD_APP_KEY`.
 */
export class WardConfigurationError extends WardUnavailableError {
  constructor(message) {
    super(message)
    this.name = 'WardConfigurationError'
  }
}

/** Read one cookie out of a raw `Cookie` header. */
function readCookie(header, name) {
  if (header === undefined) return undefined
  const flat = Array.isArray(header) ? header.join('; ') : header
  for (const pair of flat.split(';')) {
    const eq = pair.indexOf('=')
    if (eq === -1) continue
    if (pair.slice(0, eq).trim() !== name) continue
    const value = pair.slice(eq + 1).trim()
    // A cleared cookie a client presented anyway is absent, not an empty token.
    return value.length > 0 ? value : undefined
  }
  return undefined
}

/**
 * Build the client. One per process: it owns both caches.
 *
 * `fetchImpl` and `now` exist so the tests can drive this without a network or
 * a clock, which is the same seam the reference implementation uses.
 */
export function createWardClient({
  publicOrigin,
  apiBasePath,
  appKey,
  fetch: fetchImpl = fetch,
  now = Date.now,
  cacheTtlMs = INTROSPECTION_CACHE_TTL_MS,
  timeoutMs = 5_000,
}) {
  const base = apiBasePath.replace(/\/+$/, '')
  const jwksEndpoint = new URL(`${base}/.well-known/jwks.json`, publicOrigin)
  const introspectEndpoint = new URL(`${base}/introspect`, publicOrigin)

  const keyStore = createRemoteJWKSet(jwksEndpoint, {
    timeoutDuration: 5_000,
    // A public-key document that changes maybe once a quarter. Completely
    // separate from the 30-second cache below, which is about liveness —
    // conflating the two is the mistake worth not making.
    cacheMaxAge: 10 * 60_000,
    // Stops a burst of tokens signed by an unknown key becoming a stampede
    // against Ward's JWKS endpoint.
    cooldownDuration: 30_000,
  })

  /** Keyed per TOKEN, never per subject. */
  const cache = new Map()
  const inflight = new Map()

  async function verify(token) {
    try {
      const { payload } = await jwtVerify(token, keyStore, {
        // Pinned as a literal, never read from the token's own header. Without
        // this, `jose` accepts whatever the resolved key supports — the
        // alg-confusion class: `alg: "none"`, and `alg: "HS256"` with the
        // *public* key's bytes handed over as the HMAC secret.
        algorithms: [ACCESS_TOKEN_ALG],
        issuer: publicOrigin,
        audience: ACCESS_TOKEN_AUDIENCE,
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
        requiredClaims: ['sub', 'jti', 'sid', 'iat', 'exp', 'iss', 'aud'],
        typ: 'JWT',
      })
      return payload
    } catch (cause) {
      throw new WardAuthenticationError('access token is not valid', { cause })
    }
  }

  async function callWard(token) {
    let response
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      try {
        response = await fetchImpl(introspectEndpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            // This service's own credential, distinct from the person's token
            // in the body. Ward checks it first and refuses before doing work.
            [APP_KEY_HEADER]: appKey,
          },
          body: JSON.stringify({ accessToken: token }),
          signal: controller.signal,
        })
      } catch (cause) {
        throw new WardUnavailableError('introspection request failed', { cause })
      }
    } finally {
      clearTimeout(timer)
    }

    if (response.status === 401) {
      throw new WardConfigurationError(
        "Ward rejected this service's app key (401). Check WARD_APP_KEY: it is absent, " +
          "wrong, or has been revoked in Ward's console.",
      )
    }

    // Ward's contract is "always 200". Anything else — a 500 included — means
    // Ward is broken, never that the session is dead.
    if (response.status !== 200) {
      throw new WardUnavailableError(`introspect returned unexpected status ${response.status}`)
    }

    let body
    try {
      body = await response.json()
    } catch (cause) {
      throw new WardUnavailableError('introspect response was not valid JSON', { cause })
    }

    if (typeof body !== 'object' || body === null || typeof body.active !== 'boolean') {
      throw new WardUnavailableError('introspect response did not match Ward\'s contract')
    }
    if (!body.active) return { active: false }
    if (typeof body.subject !== 'string' || typeof body.username !== 'string') {
      throw new WardUnavailableError('introspect was active but missing subject/username')
    }

    return {
      active: true,
      subject: body.subject,
      username: body.username,
      grants: body.grants ?? {},
    }
  }

  function introspect(token) {
    const cached = cache.get(token)
    if (cached && cached.expiresAt > now()) return Promise.resolve(cached.result)

    // Collapse concurrent callers onto one request: a sync fires GET and PUT
    // back to back, and a cold token must not become two calls to Ward.
    const existing = inflight.get(token)
    if (existing) return existing

    const pending = callWard(token)
      .then((result) => {
        cache.set(token, { result, expiresAt: now() + cacheTtlMs })
        return result
      })
      .finally(() => inflight.delete(token))

    inflight.set(token, pending)
    return pending
  }

  /**
   * Resolve a raw `Cookie` header to a live session holding a `sports-app`
   * grant, or throw.
   *
   * **The grant check is not optional.** prm's registration is open to the
   * public, so a live Ward session held by a complete stranger is an ordinary
   * thing to receive here; authenticating without checking the grant would let
   * that stranger read and write training history. A Ward account confers
   * nothing on its own — the grant is the estate's actual security boundary.
   */
  async function authenticate(cookieHeader) {
    const token = readCookie(cookieHeader, ACCESS_COOKIE)
    if (token === undefined) throw new WardAuthenticationError('no access token presented')

    // Local, no-network authentication first: a forged or expired token is
    // rejected before Ward is asked anything.
    await verify(token)

    // Liveness and authority. `WardUnavailableError` propagates unchanged —
    // that is the fail-closed path and must not be swallowed into "signed out".
    const session = await introspect(token)
    if (!session.active) throw new WardAuthenticationError('session is not active')

    const roles = session.grants[SPORTS_APP_SLUG] ?? []
    if (roles.length === 0) {
      const error = new WardAuthenticationError('no sports-app grant')
      // A live session that may not use this app. Distinct from 401 because
      // signing in again cannot fix it — only a grant can.
      error.statusCode = 403
      throw error
    }

    return session
  }

  return { verify, introspect, authenticate }
}
