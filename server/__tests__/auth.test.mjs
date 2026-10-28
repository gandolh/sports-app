/**
 * Accounts, the guard, the session call, and the Ward routes being wired.
 *
 * Over a real HTTP socket and a real SQLite file, with the vendored library as
 * shipped. The only fake is Ward itself: `createWardClient` takes a `fetch`, and
 * the one handed to it here answers discovery and the 30-second session check
 * the way Ward does, so the routes are exercised without a container. The flow
 * against a real Ward is the library's own suite and the boot check in the brief.
 *
 * Why this file exists beside `state-server.test.mjs`: that one is about the
 * document and its stream, and signs in through a fixture. This one is about
 * *getting* a session and what the app does with it, with no fixture in the way.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { PROJECT_ROOT, openSnapshotStore } from '../db.mjs'
import { createStateServer } from '../state-server.mjs'
import {
  SESSION_COOKIE_NAME,
  UNSUPPORTED_USERNAME,
  openAccounts,
  linkWardStreams,
  openWardClient,
  orphanStreamNames,
  readAuthConfig,
} from '../ward.mjs'
import { seedAccount } from '../seed-users.mjs'
import { createWardIdentities } from '../vendor/ward/ward-auth.js'
import { testAuthConfig } from './auth-fixture.mjs'

const ISSUER = 'http://localhost:8792/ward-api/oidc'
const PASSWORD = 'correct-horse-battery'

/** @type {(() => Promise<void> | void)[]} */
let cleanups = []

afterEach(async () => {
  const pending = cleanups
  cleanups = []
  for (const stop of pending.reverse()) await stop()
})

/** An Ed25519 key in the shape Ward's seed writes into `WARD_OIDC_CLIENT_KEY`. */
function clientKeyEnvValue() {
  const { privateKey } = generateKeyPairSync('ed25519')
  const jwk = privateKey.export({ format: 'jwk' })
  return Buffer.from(
    JSON.stringify({ kty: 'OKP', crv: 'Ed25519', x: jwk.x, d: jwk.d, kid: 'k1', use: 'sig' }),
  ).toString('base64url')
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/**
 * A stand-in for Ward's HTTP surface: discovery, and `/session-status`.
 *
 * `status` is what the 30-second check answers, and `down` makes every call fail
 * the way a stopped Ward does.
 */
function fakeWard() {
  const state = { down: false, active: true, calls: [] }
  const fetchImpl = async (input) => {
    const url = String(input instanceof Request ? input.url : input)
    state.calls.push(url)
    if (state.down) throw new TypeError('fetch failed')
    if (url === `${ISSUER}/.well-known/openid-configuration`) {
      return json(200, {
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/auth`,
        token_endpoint: `${ISSUER}/token`,
        jwks_uri: `${ISSUER}/jwks`,
        end_session_endpoint: `${ISSUER}/session/end`,
        id_token_signing_alg_values_supported: ['EdDSA'],
      })
    }
    if (url === 'http://localhost:8792/ward-api/session-status') {
      return state.active ? json(200, { active: true, role: 'user' }) : json(200, { active: false })
    }
    return json(404, { error: 'not_found' })
  }
  return { state, fetch: fetchImpl }
}

/**
 * Start the service the way `main` assembles it, over a fresh database.
 *
 * @param {{ ward?: boolean, apiPrefix?: string, fetch?: typeof fetch }} [options]
 */
async function startService(options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'sports-app-auth-'))
  const store = openSnapshotStore({ file: join(root, 'db', 'app.db') })
  const accounts = openAccounts(store.db)

  const apiPrefix = options.apiPrefix ?? ''
  let auth = testAuthConfig({ apiPrefix, cookiePath: `${apiPrefix}/api` })
  let wardClient
  if (options.ward) {
    const config = readAuthConfig({
      WARD_OIDC_ISSUER: ISSUER,
      WARD_OIDC_CLIENT_ID: 'sports-app',
      WARD_OIDC_CLIENT_KEY: clientKeyEnvValue(),
      WARD_OIDC_REDIRECT_URI: `http://localhost:5173${apiPrefix}/api/auth/ward/callback`,
      WARD_OIDC_POST_LOGOUT_REDIRECT_URI: 'http://localhost:5173/sports-app/',
      ...(apiPrefix === '' ? {} : { SPORTS_APP_API_PREFIX: apiPrefix }),
    })
    auth = config
    wardClient = await openWardClient(config, options.fetch ? { fetch: options.fetch } : {})
  }

  const server = createStateServer({ store, accounts, auth, wardClient })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  cleanups.push(async () => {
    await new Promise((resolve) => server.close(resolve))
    store.close()
    rmSync(root, { recursive: true, force: true })
  })

  const post = (path, body, headers = {}) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })

  return { base, store, accounts, auth, post }
}

/** `name=value` out of a `Set-Cookie` header, ready to send back. */
function cookieFrom(response) {
  const header = response.headers.get('set-cookie') ?? ''
  return header.split(';')[0]
}

function docText(username, sessions) {
  return `${JSON.stringify(
    {
      schemaVersion: 5,
      username,
      history: Array.from({ length: sessions }, () => ({})),
    },
    null,
    2,
  )}\n`
}

// ─── Local sign-in ──────────────────────────────────────────────────────────

describe('local sign-in, with Ward not configured at all', () => {
  it('signs a seeded user in, and the session cookie opens their own stream', async () => {
    const { base, store, post } = await startService()
    await seedAccount({ username: 'alice', password: PASSWORD, store })

    const login = await post('/api/auth/login', { username: 'alice', password: PASSWORD })
    expect(login.status).toBe(200)
    const body = await login.json()
    expect(body.user).toMatchObject({ username: 'alice', hasPassword: true })
    expect(body.ward).toEqual({ enabled: false, linked: false })

    // The cookie is the app's own, scoped to the API as the browser sees it.
    const setCookie = login.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`)
    expect(setCookie).toContain('Path=/api')
    expect(setCookie).toMatch(/HttpOnly/i)

    // The same cookie reads and writes the state stream. This also proves the
    // auth routes (parsed JSON) and the state routes (raw string) live side by
    // side: the PUT body is stored byte for byte.
    const cookie = cookieFrom(login)
    const text = docText('alice', 2)
    const put = await fetch(`${base}/api/state`, {
      method: 'PUT',
      headers: { cookie, 'content-type': 'application/json' },
      body: text,
    })
    expect(put.status).toBe(200)
    const get = await fetch(`${base}/api/state`, { headers: { cookie } })
    expect(await get.text()).toBe(text)
  })

  it('refuses a wrong password and an unknown user with the same answer', async () => {
    const { store, post } = await startService()
    await seedAccount({ username: 'alice', password: PASSWORD, store })

    const wrong = await post('/api/auth/login', { username: 'alice', password: 'not-it-at-all' })
    const unknown = await post('/api/auth/login', { username: 'nobody', password: PASSWORD })
    expect(wrong.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect(await wrong.json()).toEqual({ error: 'invalid_credentials' })
    expect(await unknown.json()).toEqual({ error: 'invalid_credentials' })
    expect(wrong.headers.get('set-cookie')).toBeNull()
  })

  it('has no register route: a stranger cannot make an account', async () => {
    const { post, accounts } = await startService()
    const response = await post('/api/auth/register', { username: 'mallory', password: PASSWORD })
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(await accounts.findUserByUsername('mallory')).toBeUndefined()
  })

  it('has no rename route: a stream is keyed by the username', async () => {
    const { store, post, accounts } = await startService()
    await seedAccount({ username: 'alice', password: PASSWORD, store })
    const cookie = cookieFrom(
      await post('/api/auth/login', { username: 'alice', password: PASSWORD }),
    )

    // ward-auth 0.4.0 turns `POST <prefix>/username` on by default; this app turns it off.
    const response = await post('/api/auth/username', { username: 'bob' }, { cookie })
    expect(response.status).toBe(404)
    expect(await accounts.findUserByUsername('alice')).toBeDefined()
    expect(await accounts.findUserByUsername('bob')).toBeUndefined()
  })

  it('signs out: the cookie stops working and the stream is guarded again', async () => {
    const { base, store, post } = await startService()
    await seedAccount({ username: 'alice', password: PASSWORD, store })
    const cookie = cookieFrom(
      await post('/api/auth/login', { username: 'alice', password: PASSWORD }),
    )

    expect((await fetch(`${base}/api/state`, { headers: { cookie } })).status).toBe(404)
    expect((await post('/api/auth/logout', {}, { cookie })).status).toBe(204)
    expect((await fetch(`${base}/api/state`, { headers: { cookie } })).status).toBe(401)
  })
})

// ─── The guard ──────────────────────────────────────────────────────────────

describe('the guard', () => {
  it('answers 401 to every route but the allowlist, real or invented', async () => {
    const { base } = await startService()
    for (const [method, path] of [
      ['GET', '/api/state'],
      ['PUT', '/api/state'],
      ['GET', '/api/nope'],
      ['POST', '/api/health'],
      ['GET', '/'],
      ['POST', '/api/auth/password'],
    ]) {
      const response = await fetch(`${base}${path}`, { method })
      expect(response.status, `${method} ${path}`).toBe(401)
      expect((await response.json()).error).toBe('unauthorized')
    }
  })

  it('leaves liveness public and the sign-in routes reachable', async () => {
    const { base } = await startService()
    expect((await fetch(`${base}/api/health`)).status).toBe(200)
    expect((await fetch(`${base}/api/auth/session`)).status).toBe(200)
  })

  it('refuses a cross-site POST, so a page elsewhere cannot sign anyone in or out', async () => {
    const { store, post } = await startService()
    await seedAccount({ username: 'alice', password: PASSWORD, store })
    const response = await post(
      '/api/auth/login',
      { username: 'alice', password: PASSWORD },
      { origin: 'https://elsewhere.example' },
    )
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'cross_site' })
  })

  it('refuses a session whose username the document schema cannot hold', async () => {
    const { base, accounts } = await startService()
    // The library accepts what the document schema does not: uppercase.
    const user = await accounts.createUser({ username: 'Alice', password: PASSWORD, role: 'user' })
    const { token } = await accounts.startSession(user.id)
    const cookie = `${SESSION_COOKIE_NAME}=${token}`

    const state = await fetch(`${base}/api/state`, { headers: { cookie } })
    expect(state.status).toBe(401)
    expect(await state.json()).toEqual({ error: 'unauthorized', reason: UNSUPPORTED_USERNAME })

    // And the session call says why, so the login page can word it.
    const session = await (await fetch(`${base}/api/auth/session`, { headers: { cookie } })).json()
    expect(session.user).toBeNull()
    expect(session.reason).toBe(UNSUPPORTED_USERNAME)
  })
})

// ─── The session call that fixes the loop ───────────────────────────────────

describe('GET /api/auth/session', () => {
  /*
   * The sign-in loop: after Ward's callback the browser held a valid cookie and
   * the client held no username, and nothing could ask the service who the
   * cookie belonged to. This is that question. The client writes the answer to
   * the one place the route guards read.
   */
  it('says who the cookie belongs to, and nobody when there is none', async () => {
    const { base, store, post } = await startService()
    await seedAccount({ username: 'alice', password: PASSWORD, store })

    const anonymous = await (await fetch(`${base}/api/auth/session`)).json()
    expect(anonymous.user).toBeNull()
    expect(anonymous.ward).toEqual({ enabled: false, linked: false })

    const cookie = cookieFrom(
      await post('/api/auth/login', { username: 'alice', password: PASSWORD }),
    )
    const known = await (await fetch(`${base}/api/auth/session`, { headers: { cookie } })).json()
    expect(known.user).toMatchObject({ username: 'alice', role: 'user', hasPassword: true })
    expect(known.session.origin).toBe('local')
  })
})

// ─── The stream follows the local username ──────────────────────────────────

describe('the snapshot stream follows the local username, never the Ward one', () => {
  it('keys a Ward user suffixed because their name was taken by the suffixed name', async () => {
    const { base, store, accounts } = await startService()
    await seedAccount({ username: 'alice', password: PASSWORD, store })

    // A first Ward sign-in for a different person who is also called alice.
    const identities = createWardIdentities({ accounts })
    const { user, created } = await identities.userForSignIn({
      subject: 'ward-subject-of-a-stranger',
      username: 'alice',
      role: 'user',
      wardSid: 'family-1',
      idToken: 'x.y.z',
    })
    expect(created).toBe(true)
    expect(user.username).toBe('alice-2')

    const { token } = await accounts.startSession(user.id, { origin: 'local' })
    const cookie = `${SESSION_COOKIE_NAME}=${token}`
    const headers = { cookie, 'content-type': 'application/json' }

    // Their document says `alice-2`, and that is the stream it lands in.
    expect(
      (await fetch(`${base}/api/state`, { method: 'PUT', headers, body: docText('alice-2', 1) }))
        .status,
    ).toBe(200)
    expect(store.latest('alice-2')).not.toBeNull()
    expect(store.latest('alice')).toBeNull()

    // A document under the Ward name is somebody else's stream and is refused.
    const mismatched = await fetch(`${base}/api/state`, {
      method: 'PUT',
      headers,
      body: docText('alice', 1),
    })
    expect(mismatched.status).toBe(400)
    expect(store.latest('alice')).toBeNull()
  })

  it('names a stream with no account at startup, and an account makes it readable', async () => {
    const { store, accounts } = await startService()
    store.insert({ username: 'old-name', docJson: docText('old-name', 3), historyLength: 3, schemaVersion: 5 })
    store.insert({ username: 'alice', docJson: docText('alice', 1), historyLength: 1, schemaVersion: 5 })
    await seedAccount({ username: 'alice', password: PASSWORD, store })

    expect(await orphanStreamNames(store, accounts)).toEqual(['old-name'])

    const result = await seedAccount({ username: 'old-name', password: PASSWORD, store })
    expect(result).toMatchObject({ created: true, hadHistory: true, orphans: [] })
  })
})

describe('streams keyed by a Ward subject, from before accounts existed', () => {
  const SUBJECT = '3f9a1c0be2d44a7f8c6e5b1a09d7c2e4'

  it('are linked to an account of the same name, so a Ward sign-in finds the history', async () => {
    const { base, store, accounts } = await startService()
    store.insert({ username: SUBJECT, docJson: docText(SUBJECT, 4), historyLength: 4, schemaVersion: 5 })
    store.insert({ username: 'local', docJson: docText('local', 1), historyLength: 1, schemaVersion: 5 })

    expect(await linkWardStreams(store, accounts)).toEqual([SUBJECT])
    // Idempotent: a second boot links nothing and breaks nothing.
    expect(await linkWardStreams(store, accounts)).toEqual([])

    // Only a subject is linked. `local` is a name, and is left to the seed.
    expect(await orphanStreamNames(store, accounts)).toEqual(['local'])

    // The person's first "Sign in with Ward" finds the linked account rather than
    // creating a `alice` with an empty stream.
    const identities = createWardIdentities({ accounts })
    const { user, created } = await identities.userForSignIn({
      subject: SUBJECT,
      username: 'alice',
      role: 'user',
      wardSid: 'family-1',
      idToken: 'x.y.z',
    })
    expect(created).toBe(false)
    expect(user.username).toBe(SUBJECT)
    expect(await accounts.findUserByUsername('alice')).toBeUndefined()

    // And their stream carries on: same key, same history, a new snapshot on top.
    const { token } = await accounts.startSession(user.id)
    const headers = { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' }
    const before = await fetch(`${base}/api/state`, { headers })
    expect(JSON.parse(await before.text()).history).toHaveLength(4)
    const put = await fetch(`${base}/api/state`, {
      method: 'PUT',
      headers,
      body: docText(SUBJECT, 5),
    })
    expect(put.status).toBe(200)
    expect(store.count(SUBJECT)).toBe(2)
  })

  it('are linked by the seed too, so they are not reported as orphans', async () => {
    const { store } = await startService()
    store.insert({ username: SUBJECT, docJson: docText(SUBJECT, 1), historyLength: 1, schemaVersion: 5 })
    const result = await seedAccount({ username: 'alice', password: PASSWORD, store })
    expect(result.orphans).toEqual([])
  })

  it('are not re-linked after the person unlinks Ward, and the next boot does not throw', async () => {
    const { store, accounts } = await startService()
    store.insert({ username: SUBJECT, docJson: docText(SUBJECT, 2), historyLength: 2, schemaVersion: 5 })
    expect(await linkWardStreams(store, accounts)).toEqual([SUBJECT])

    // Unlinking needs a local password, as in settings.
    const identities = createWardIdentities({ accounts })
    await accounts.setPassword(SUBJECT, PASSWORD)
    await identities.unlink(SUBJECT)
    expect(await identities.findUserBySubject(SUBJECT)).toBeUndefined()
    expect(await accounts.findUserById(SUBJECT)).toBeDefined()

    // The reboot: the user row stays, the link is gone, and nothing is re-linked.
    await expect(linkWardStreams(store, accounts)).resolves.toEqual([])
    expect(await identities.findUserBySubject(SUBJECT)).toBeUndefined()
    expect((await accounts.findUserById(SUBJECT))?.username).toBe(SUBJECT)
  })

  it('leave the seed working after an unlink', async () => {
    const { store, accounts } = await startService()
    store.insert({ username: SUBJECT, docJson: docText(SUBJECT, 2), historyLength: 2, schemaVersion: 5 })
    await linkWardStreams(store, accounts)
    await accounts.setPassword(SUBJECT, PASSWORD)
    await createWardIdentities({ accounts }).unlink(SUBJECT)

    const result = await seedAccount({ username: 'alice', password: PASSWORD, store, accounts })
    expect(result).toMatchObject({ created: true, orphans: [] })
    expect(await createWardIdentities({ accounts }).findUserBySubject(SUBJECT)).toBeUndefined()
  })
})

// ─── Ward ───────────────────────────────────────────────────────────────────

describe('"Sign in with Ward" is wired', () => {
  it('starts the flow at the Ward issuer, with the callback the config names', async () => {
    const ward = fakeWard()
    const { post } = await startService({ ward: true, fetch: ward.fetch })

    const response = await post('/api/auth/ward/start', {})
    expect(response.status).toBe(200)
    const { url } = await response.json()
    const target = new URL(url)
    expect(`${target.origin}${target.pathname}`).toBe(`${ISSUER}/auth`)
    expect(target.searchParams.get('client_id')).toBe('sports-app')
    expect(target.searchParams.get('redirect_uri')).toBe(
      'http://localhost:5173/api/auth/ward/callback',
    )
    expect(target.searchParams.get('code_challenge_method')).toBe('S256')

    // The flow cookie is scoped to the callback, which is under the API prefix.
    expect(response.headers.get('set-cookie')).toContain(`${SESSION_COOKIE_NAME}_ward=`)
  })

  it('sends a person Ward refuses (no grant) back to the login page with a reason, and no session', async () => {
    const ward = fakeWard()
    const { base, post } = await startService({ ward: true, fetch: ward.fetch })

    const start = await post('/api/auth/ward/start', {})
    const flowCookie = cookieFrom(start)
    const state = new URL((await start.json()).url).searchParams.get('state')

    // What Ward answers for an account with no sports-app grant (or one that
    // pressed "Back to the app"): the OAuth error, on the redirect URI.
    const callback = await fetch(
      `${base}/api/auth/ward/callback?error=access_denied&state=${encodeURIComponent(state)}`,
      { headers: { cookie: flowCookie }, redirect: 'manual' },
    )
    expect(callback.status).toBe(303)
    const landed = new URL(callback.headers.get('location'))
    expect(landed.pathname).toBe('/sports-app/login')
    expect(landed.searchParams.get('ward_error')).toBe('access_denied')
    // One page with a sentence on it, not a loop: no session was started.
    expect(callback.headers.getSetCookie().some((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))).toBe(false)
  })

  it('tells the login page the button is available, and not before', async () => {
    const withWard = await startService({ ward: true, fetch: fakeWard().fetch })
    expect((await (await fetch(`${withWard.base}/api/auth/session`)).json()).ward).toEqual({
      enabled: true,
      linked: false,
    })

    const without = await startService()
    expect((await (await fetch(`${without.base}/api/auth/session`)).json()).ward).toEqual({
      enabled: false,
      linked: false,
    })
  })

  it('starts while Ward is down, and says so only when the button is pressed', async () => {
    const ward = fakeWard()
    ward.state.down = true
    const { base, post, store } = await startService({ ward: true, fetch: ward.fetch })
    await seedAccount({ username: 'alice', password: PASSWORD, store })

    // Local sign-in never calls Ward.
    expect((await post('/api/auth/login', { username: 'alice', password: PASSWORD })).status).toBe(
      200,
    )
    expect((await fetch(`${base}/api/health`)).status).toBe(200)

    const start = await post('/api/auth/ward/start', {})
    expect(start.status).toBeGreaterThanOrEqual(400)
    expect((await start.json()).error).toBe('ward_unavailable')
  })

  it('moves the cookie path and the callback together when the prefix changes', async () => {
    const ward = fakeWard()
    const { post, store } = await startService({
      ward: true,
      fetch: ward.fetch,
      apiPrefix: '/sports-app-api',
    })
    await seedAccount({ username: 'alice', password: PASSWORD, store })

    const login = await post('/api/auth/login', { username: 'alice', password: PASSWORD })
    expect(login.headers.get('set-cookie')).toContain('Path=/sports-app-api/api')

    const { url } = await (await post('/api/auth/ward/start', {})).json()
    expect(new URL(url).searchParams.get('redirect_uri')).toBe(
      'http://localhost:5173/sports-app-api/api/auth/ward/callback',
    )
  })

  it('refuses to boot when the redirect URI and the cookie path disagree', async () => {
    // As the real process, because the refusal is the process not starting: it is
    // what stops a deploy that registered one prefix and configured another.
    const root = mkdtempSync(join(tmpdir(), 'sports-app-boot-'))
    cleanups.push(() => rmSync(root, { recursive: true, force: true }))
    const child = spawn(process.execPath, [join(PROJECT_ROOT, 'server', 'state-server.mjs')], {
      env: {
        ...process.env,
        SPORTS_APP_HOST: '127.0.0.1',
        SPORTS_APP_PORT: '0',
        SPORTS_APP_DB: join(root, 'app.db'),
        WARD_OIDC_ISSUER: ISSUER,
        WARD_OIDC_CLIENT_ID: 'sports-app',
        WARD_OIDC_CLIENT_KEY: clientKeyEnvValue(),
        // Registered for the deploy's prefix, while this process has none.
        WARD_OIDC_REDIRECT_URI: 'http://localhost:5173/sports-app-api/api/auth/ward/callback',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (chunk) => (output += String(chunk)))
    child.stderr.on('data', (chunk) => (output += String(chunk)))
    const code = await new Promise((resolve) => child.once('exit', resolve))

    expect(code).not.toBe(0)
    expect(output).toMatch(/must end in \/api\/auth\/ward\/callback and sit under the cookie path \/api/)
  })
})

describe('a session that began with Ward is checked, and a local one is not', () => {
  /** A user created the way a first Ward sign-in creates one, with a live Ward session. */
  async function wardUser(accounts, subject = 'ward-subject-1') {
    const identities = createWardIdentities({ accounts })
    const { user } = await identities.userForSignIn({
      subject,
      username: 'walt',
      role: 'user',
      wardSid: 'family-1',
      idToken: 'x.y.z',
    })
    const { token } = await accounts.startSession(user.id, { origin: 'ward', wardSid: 'family-1' })
    return `${SESSION_COOKIE_NAME}=${token}`
  }

  it('lets a live Ward session in, and ends it when Ward says it ended', async () => {
    const ward = fakeWard()
    const { base, accounts } = await startService({ ward: true, fetch: ward.fetch })
    const cookie = await wardUser(accounts)

    expect((await fetch(`${base}/api/state`, { headers: { cookie } })).status).toBe(404)

    // The check is cached for 30 seconds; a second client sees the revoke by
    // asking afresh, which is what the bound is.
    ward.state.active = false
    const { base: other, accounts: otherAccounts } = await startService({
      ward: true,
      fetch: ward.fetch,
    })
    const revoked = await fetch(`${other}/api/state`, {
      headers: { cookie: await wardUser(otherAccounts) },
    })
    expect(revoked.status).toBe(401)
    expect(await revoked.json()).toEqual({ error: 'unauthorized', reason: 'ward_session_ended' })
  })

  it('fails closed with ward_unavailable while Ward is down, and a local session keeps working', async () => {
    const ward = fakeWard()
    ward.state.down = true
    const { base, store, accounts, post } = await startService({ ward: true, fetch: ward.fetch })
    const wardCookie = await wardUser(accounts)
    await seedAccount({ username: 'alice', password: PASSWORD, store })
    const localCookie = cookieFrom(
      await post('/api/auth/login', { username: 'alice', password: PASSWORD }),
    )

    const refused = await fetch(`${base}/api/state`, { headers: { cookie: wardCookie } })
    expect(refused.status).toBe(401)
    expect(await refused.json()).toEqual({ error: 'unauthorized', reason: 'ward_unavailable' })

    expect((await fetch(`${base}/api/state`, { headers: { cookie: localCookie } })).status).toBe(404)
  })
})

// ─── Configuration ──────────────────────────────────────────────────────────

describe('readAuthConfig', () => {
  const ward = () => ({
    WARD_OIDC_ISSUER: ISSUER,
    WARD_OIDC_CLIENT_ID: 'sports-app',
    WARD_OIDC_CLIENT_KEY: clientKeyEnvValue(),
    WARD_OIDC_REDIRECT_URI: 'https://example.com/sports-app-api/api/auth/ward/callback',
  })

  it('has local development defaults for the prefix and the pages', () => {
    const config = readAuthConfig({ SPORTS_APP_PUBLIC_ORIGIN: 'http://localhost:5173' })
    expect(config).toMatchObject({
      publicOrigin: 'http://localhost:5173',
      apiPrefix: '',
      cookiePath: '/api',
      loginPath: '/sports-app/login',
      settingsPath: '/sports-app/account',
      wardOptions: undefined,
    })
  })

  it('derives the cookie path from the browser-side API prefix, never from a literal', () => {
    const config = readAuthConfig({
      ...ward(),
      SPORTS_APP_API_PREFIX: '/sports-app-api',
      SPORTS_APP_BASE: '/elsewhere/',
    })
    expect(config.cookiePath).toBe('/sports-app-api/api')
    expect(config.loginPath).toBe('/elsewhere/login')
    // The origin is the redirect URI's own unless one is given.
    expect(config.publicOrigin).toBe('https://example.com')
  })

  it('refuses to guess the origin, a malformed prefix, or half a Ward configuration', () => {
    expect(() => readAuthConfig({})).toThrow(/SPORTS_APP_PUBLIC_ORIGIN/)
    expect(() =>
      readAuthConfig({ SPORTS_APP_PUBLIC_ORIGIN: 'http://localhost:5173', SPORTS_APP_API_PREFIX: 'api/' }),
    ).toThrow(/SPORTS_APP_API_PREFIX/)
    expect(() =>
      readAuthConfig({ SPORTS_APP_PUBLIC_ORIGIN: 'http://localhost:5173', WARD_OIDC_ISSUER: ISSUER }),
    ).toThrow(/WARD_OIDC_CLIENT_ID/)
  })

  it('never reads the old trio', () => {
    const config = readAuthConfig({
      SPORTS_APP_PUBLIC_ORIGIN: 'http://localhost:5173',
      WARD_PUBLIC_ORIGIN: 'http://localhost:8792',
      WARD_API_BASE_PATH: '/ward-api',
      WARD_APP_KEY: 'wak_old',
    })
    expect(config.wardOptions).toBeUndefined()
  })
})

// ─── The seed ───────────────────────────────────────────────────────────────

describe('the seed', () => {
  async function openStore() {
    const root = mkdtempSync(join(tmpdir(), 'sports-app-seed-'))
    const store = openSnapshotStore({ file: join(root, 'app.db') })
    cleanups.push(() => {
      store.close()
      rmSync(root, { recursive: true, force: true })
    })
    return store
  }

  it('creates the account once and leaves it alone afterwards', async () => {
    const store = await openStore()
    expect(await seedAccount({ username: 'alice', password: PASSWORD, store })).toMatchObject({
      created: true,
    })
    // A second run, with a different password, must not reset anything.
    expect(
      await seedAccount({ username: 'alice', password: 'a-different-password', store }),
    ).toMatchObject({ created: false })

    const accounts = openAccounts(store.db)
    expect(await accounts.verifyCredentials('alice', PASSWORD)).toMatchObject({ username: 'alice' })
    expect(await accounts.verifyCredentials('alice', 'a-different-password')).toBeUndefined()
  })

  it('refuses a name the document schema cannot hold, before writing anything', async () => {
    const store = await openStore()
    for (const bad of ['Alice', '', 'has space', 'x'.repeat(33), '-leading']) {
      await expect(seedAccount({ username: bad, password: PASSWORD, store })).rejects.toThrow(
        /will not work/,
      )
    }
    expect(await openAccounts(store.db).findUserByUsername('Alice')).toBeUndefined()
  })

  it('refuses an empty password', async () => {
    const store = await openStore()
    await expect(seedAccount({ username: 'alice', password: '', store })).rejects.toThrow(/password/i)
  })
})
