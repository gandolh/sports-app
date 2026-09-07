import { WardAuthenticationError, WardUnavailableError } from '../ward.mjs'

/**
 * A Ward client the tests drive directly.
 *
 * The state service needs to say "this request is signed in as X" without a
 * signing key, a JWKS endpoint or a network. This maps a **cookie value** to a
 * subject, which is the same shape a real request has: a test sends
 * `cookie: ward_session=<token>` and the service's own gate does the rest.
 *
 * The seam is the client rather than the gate, deliberately. Stubbing the gate
 * would make every "rejects without a session" assertion in the suite
 * tautological — and those assertions are the whole reason this app's cutover
 * is worth anything, since it previously had no per-user boundary at all.
 */
export function createFakeWard(sessions = {}) {
  const map = new Map(Object.entries(sessions))
  let broken

  /**
   * A token of the form `user:alice` resolves to the subject `alice`.
   *
   * This is the seam that lets the suite keep testing multi-user behaviour
   * without a session fixture per person: `sessionFor(name)` mints the cookie,
   * and the service still learns the subject from the session rather than from
   * anything the request chose. An explicitly registered session wins, so a
   * test can still say "this exact token is unknown".
   */
  const IMPLICIT = /^user:([a-z0-9-]{1,64})$/

  return {
    /** Add or replace a session. */
    signIn(token, subject) {
      map.set(token, subject)
    },
    /** Forget one, so the next request with it is unauthenticated. */
    signOut(token) {
      map.delete(token)
    },
    /** Make every call throw — for the fail-closed (503) assertions. */
    breakWith(error) {
      broken = error
    },
    authenticate(cookieHeader) {
      if (broken) return Promise.reject(broken)

      const flat = Array.isArray(cookieHeader) ? cookieHeader.join('; ') : (cookieHeader ?? '')
      let token
      for (const pair of flat.split(';')) {
        const eq = pair.indexOf('=')
        if (eq === -1) continue
        if (pair.slice(0, eq).trim() !== 'ward_session') continue
        const value = pair.slice(eq + 1).trim()
        if (value) token = value
      }

      let subject = token === undefined ? undefined : map.get(token)
      if (subject === undefined && token !== undefined) {
        const implicit = IMPLICIT.exec(token)
        if (implicit) subject = implicit[1]
      }
      if (subject === undefined) {
        return Promise.reject(new WardAuthenticationError('session is not active'))
      }
      return Promise.resolve({ active: true, subject, username: subject, grants: { 'sports-app': ['user'] } })
    },
  }
}

/** The cookie header for a signed-in request as `username`. */
export function sessionFor(username) {
  return `ward_session=user:${username}`
}

export { WardAuthenticationError, WardUnavailableError }
