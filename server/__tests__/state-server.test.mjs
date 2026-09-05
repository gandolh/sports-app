/**
 * Service tests, against a real SQLite file over a real HTTP socket.
 *
 * There is no mock database and no mock transport, because the properties worth
 * testing are all properties of the real thing:
 *
 *   1. **A `PUT` followed by a `GET` returns the same bytes.** Not the same
 *      parsed object — the same bytes. `serialise` in the codec is byte-stable
 *      and its output is laid out for a human to read; a service that
 *      round-trips through `JSON.stringify` would pass a deep-equality
 *      assertion while quietly destroying that layout and desynchronising the
 *      exported file from the stored one. `toBe` on a string is the only
 *      assertion that catches it.
 *   2. **A rejected write changes nothing.** The newest snapshot after a 400 is
 *      compared byte-for-byte against the newest snapshot from before it.
 *   3. **One user cannot read, overwrite, or evict another.** Isolation is a
 *      claim about what a `WHERE username = ?` actually did.
 *   4. **The password never lands anywhere.** See the "the password is never
 *      stored" block: it searches the database files on disk and the captured log
 *      for a sentinel string.
 *
 * ── Why nothing here imports from the client ─────────────────────────────────
 *
 * The documents below are hand-written v3 bodies rather than output from
 * `client/src/persistence/codec.ts`, and that is deliberate. This service is
 * version-agnostic on purpose: it echoes whatever `schemaVersion` it is given
 * into a column and never interprets it. A test that built its fixtures from
 * `CURRENT_SCHEMA_VERSION` would fail on the client's next schema bump while
 * proving nothing about the server, and it would couple the service to the
 * bundle's TypeScript. Hand-written bodies also let a test send a
 * document the codec would refuse to produce, which is exactly the input a
 * shallow validator has to survive.
 *
 * The fixtures do imitate the codec's layout — blank lines between sections,
 * one-line nested objects, a trailing newline — because that layout is what the
 * byte-verbatim assertions are protecting.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  DEFAULT_DB_DIR,
  DEFAULT_DB_FILE,
  PROJECT_ROOT,
  RETENTION,
  openSnapshotStore,
} from '../db.mjs'
import { USERNAME_MAX_LENGTH } from '@sports-app/shared/username.ts'
import {
  LOGIN_PATH,
  SECRET_HEADER,
  STATE_PATH,
  USER_PARAM,
  checkCredentials,
  checkDocument,
  createStateServer,
  readConfig,
  readUsername,
  secretMatches,
} from '../state-server.mjs'

const SECRET = 'test-secret-not-a-real-one'

// ─── Harness ────────────────────────────────────────────────────────────────

/** @type {(() => void)[]} */
let cleanups = []

afterEach(async () => {
  const pending = cleanups
  cleanups = []
  for (const stop of pending.reverse()) await stop()
})

async function startService(options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'sports-app-state-'))
  // Deliberately nested inside a `db/` directory the store has to create
  // itself — the acceptance criterion is that the database lands under `db/`.
  const file = join(root, 'db', 'app.db')
  const store =
    options.store ??
    openSnapshotStore({ file, ...(options.retention ? { retention: options.retention } : {}) })

  /** Every log line the service emitted, for the "nothing leaked" assertions. */
  const logs = []
  const server = createStateServer({
    store,
    secret: SECRET,
    log: (message) => logs.push(message),
    ...(options.maxBodyBytes ? { maxBodyBytes: options.maxBodyBytes } : {}),
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const base = `http://127.0.0.1:${address.port}`

  cleanups.push(async () => {
    await new Promise((resolve) => server.close(resolve))
    store.close()
    rmSync(root, { recursive: true, force: true })
  })

  return { root, file, dbDir: dirname(file), store, base, logs }
}

function authorised(extra = {}) {
  return { [SECRET_HEADER]: SECRET, ...extra }
}

/**
 * Start the service the way a deployment does — `node server/state-server.mjs`, a
 * real child process — and capture its stdout and stderr as raw pipes.
 *
 * This is the harness for the one thing brief 22 could plausibly have broken
 * silently: **Fastify logs every request by default.** Its logger is pino, and
 * pino writes to file descriptor 1 *directly* rather than through
 * `process.stdout.write` — so an in-process spy on `process.stdout` would report a
 * clean run while a real deployment wrote request lines to a log file. Only a
 * child process's pipes can see it.
 *
 * Port `0` so the test never collides with a real deployment; the actual port is
 * read back out of the startup line the service prints.
 */
async function startServiceProcess() {
  const root = mkdtempSync(join(tmpdir(), 'sports-app-proc-'))
  const file = join(root, 'db', 'app.db')

  const child = spawn(process.execPath, [join(PROJECT_ROOT, 'server', 'state-server.mjs')], {
    env: {
      ...process.env,
      SPORTS_APP_SYNC_SECRET: SECRET,
      SPORTS_APP_HOST: '127.0.0.1',
      SPORTS_APP_PORT: '0',
      SPORTS_APP_DB: file,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  /** Every byte the process wrote to either stream, in order. */
  let output = ''
  const collect = (chunk) => {
    output += String(chunk)
  }
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)

  const exited = new Promise((resolve) => child.once('exit', resolve))
  let stopped = false
  const stop = async () => {
    if (stopped) return
    stopped = true
    // SIGTERM rather than SIGKILL: the handler closes the store, which
    // checkpoints the WAL into the main database file — the state a backup or a
    // `sqlite3` session would see.
    child.kill('SIGTERM')
    await exited
  }
  cleanups.push(async () => {
    await stop()
    rmSync(root, { recursive: true, force: true })
  })

  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`service did not start:\n${output}`)), 10_000)
    const check = () => {
      const match = /listening on http:\/\/127\.0\.0\.1:(\d+)/.exec(output)
      if (match === null) return
      clearTimeout(timer)
      resolve(Number(match[1]))
    }
    child.stdout.on('data', check)
    child.once('exit', () => {
      clearTimeout(timer)
      reject(new Error(`service exited before listening:\n${output}`))
    })
    check()
  })

  return {
    base: `http://127.0.0.1:${port}`,
    dbDir: dirname(file),
    output: () => output,
    stop,
  }
}

function stateUrl(base, username) {
  return username === undefined
    ? `${base}${STATE_PATH}`
    : `${base}${STATE_PATH}?${USER_PARAM}=${encodeURIComponent(username)}`
}

async function put(base, username, text, headers = {}) {
  return fetch(stateUrl(base, username), {
    method: 'PUT',
    headers: authorised({ 'Content-Type': 'application/json', ...headers }),
    body: text,
  })
}

async function get(base, username) {
  return fetch(stateUrl(base, username), { headers: authorised() })
}

async function login(base, body, headers = {}) {
  return fetch(`${base}${LOGIN_PATH}`, {
    method: 'POST',
    headers: authorised({ 'Content-Type': 'application/json', ...headers }),
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

/**
 * A v3 state document, laid out the way the codec lays one out.
 *
 * `sessions` drives `history.length`, which is what the service reads — the
 * entries themselves are deliberately not realistic session objects, because the
 * server never looks inside them and a test that pretended otherwise would be
 * asserting the codec's business.
 */
function docText(username, sessions, overrides = {}) {
  const done = { push: 0, squat: 0, hinge: 0, core: 0, pull: 0 }
  const history = Array.from(
    { length: sessions },
    (_, i) => `    { "completedAt": "2026-07-${String((i % 28) + 1).padStart(2, '0')}T06:00:00.000Z" }`,
  )
  const version = overrides.schemaVersion ?? 3
  const name = 'username' in overrides ? overrides.username : username

  const lines = [
    '{',
    `  "schemaVersion": ${version},`,
    ...(name === undefined ? [] : [`  "username": ${JSON.stringify(name)},`]),
    `  "cyclePosition": ${sessions % 3},`,
    '',
    `  "sessionsDone": { ${Object.entries(done)
      .map(([k, v]) => `${JSON.stringify(k)}: ${v}`)
      .join(', ')} },`,
    '',
    '  "settings": {',
    '    "persistGranted": null,',
    '    "sync": null',
    '  },',
    '',
    history.length === 0 ? '  "history": []' : `  "history": [\n${history.join(',\n')}\n  ]`,
    '}',
    '',
  ]
  return lines.join('\n')
}

// ─── Where the database lives ───────────────────────────────────────────────

describe('database location', () => {
  it('defaults to db/app.db under the project root', () => {
    expect(basename(DEFAULT_DB_FILE)).toBe('app.db')
    expect(basename(dirname(DEFAULT_DB_FILE))).toBe('db')
    expect(DEFAULT_DB_DIR).toBe(join(PROJECT_ROOT, 'db'))
  })

  it('creates the db/ directory and the file on first open', async () => {
    const service = await startService()
    expect(existsSync(service.file)).toBe(true)
    expect(basename(dirname(service.file))).toBe('db')
  })

  it('has db/ gitignored, because it holds real training history', () => {
    const gitignore = readFileSync(join(PROJECT_ROOT, '.gitignore'), 'utf8')
    const lines = gitignore.split('\n').map((line) => line.trim())
    expect(lines).toContain('db/')
  })
})

// ─── The deployment secret ──────────────────────────────────────────────────

describe('the shared secret protects the deployment, not the accounts', () => {
  it('rejects a missing secret with 401', async () => {
    const { base } = await startService()
    expect((await fetch(stateUrl(base, 'alice'))).status).toBe(401)
  })

  it('rejects a wrong secret with 401', async () => {
    const { base } = await startService()
    const response = await fetch(stateUrl(base, 'alice'), {
      headers: { [SECRET_HEADER]: 'not-the-secret' },
    })
    expect(response.status).toBe(401)
  })

  it('rejects a wrong secret that happens to be the right length', async () => {
    const { base } = await startService()
    const sameLength = 'x'.repeat(SECRET.length)
    expect(sameLength.length).toBe(SECRET.length)
    const response = await fetch(stateUrl(base, 'alice'), {
      headers: { [SECRET_HEADER]: sameLength },
    })
    expect(response.status).toBe(401)
  })

  it('rejects an unauthorised PUT without writing anything', async () => {
    const { base, store } = await startService()
    const response = await fetch(stateUrl(base, 'alice'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: docText('alice', 1),
    })
    expect(response.status).toBe(401)
    expect(store.count()).toBe(0)
  })

  it('guards /api/login too, and answers 401 before it validates anything', async () => {
    const { base, logs } = await startService()
    const response = await fetch(`${base}${LOGIN_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'NOT A VALID NAME', password: 'x' }),
    })
    // 401, not 400: an unauthorised caller learns nothing about the username
    // rules, and nothing about whether this route exists.
    expect(response.status).toBe(401)
    expect((await response.json()).error).toBe('unauthorized')
    expect(logs.join('\n')).not.toMatch(/username: expected/)
  })

  it('answers 401 before it validates anything, on every guarded route', async () => {
    // The ordering, stated as a property rather than as a code reading: every
    // request below is wrong in a *second* way that a service validating first
    // would have to report instead — an invalid username, a missing one, an
    // unacceptable media type, an unparseable body. Each must still be a 401, or
    // an unauthorised caller can use 400-vs-401 as an oracle for the username
    // rules and for which routes exist.
    const { base, store, logs } = await startService()
    const wrong = { [SECRET_HEADER]: 'not-the-secret' }

    const invalidTarget = await fetch(`${base}${STATE_PATH}?${USER_PARAM}=NOT%20A%20NAME`, {
      headers: wrong,
    })
    expect(invalidTarget.status).toBe(401)
    expect((await invalidTarget.json()).error).toBe('unauthorized')

    const noTarget = await fetch(`${base}${STATE_PATH}`, { headers: wrong })
    expect(noTarget.status).toBe(401)

    const badEverything = await fetch(stateUrl(base, 'Alice'), {
      method: 'PUT',
      headers: { ...wrong, 'Content-Type': 'text/plain' },
      body: 'not json at all',
    })
    expect(badEverything.status).toBe(401)
    expect(store.count()).toBe(0)

    const badLogin = await fetch(`${base}${LOGIN_PATH}`, {
      method: 'POST',
      headers: { ...wrong, 'Content-Type': 'text/plain' },
      body: 'not json at all',
    })
    expect(badLogin.status).toBe(401)

    // A wrong *method* on a guarded route is a 401 before it is a 405, for the
    // same reason: a 405 with an `Allow` header would tell an unauthorised caller
    // that the route exists and what it accepts.
    expect((await fetch(`${base}${LOGIN_PATH}`, { headers: wrong })).status).toBe(401)
    const deleted = await fetch(stateUrl(base, 'alice'), { method: 'DELETE', headers: wrong })
    expect(deleted.status).toBe(401)
    expect(deleted.headers.get('allow')).toBe(null)

    // `/api/health` is the deliberate exception. Liveness needs no credential, so
    // its 405 is available to anybody — there is nothing there to know about.
    expect((await fetch(`${base}/api/health`, { method: 'POST' })).status).toBe(405)

    // And nothing about the rules, the media type or the body was written down on
    // the way to any of those answers.
    expect(logs.join('\n')).not.toMatch(/expected/)
    expect(logs.join('\n')).not.toContain('not json at all')
  })

  it('compares secrets in a way that accepts only the exact string', () => {
    expect(secretMatches('abc', 'abc')).toBe(true)
    expect(secretMatches('abc', 'abd')).toBe(false)
    expect(secretMatches('ab', 'abc')).toBe(false)
    expect(secretMatches('abcd', 'abc')).toBe(false)
    expect(secretMatches(undefined, 'abc')).toBe(false)
    expect(secretMatches(['abc'], 'abc')).toBe(false)
  })

  it('refuses to construct without a secret', () => {
    expect(() =>
      createStateServer({ store: openSnapshotStore({ file: ':memory:' }), secret: '' }),
    ).toThrow(/non-empty shared secret/)
  })
})

// ─── /api/health ────────────────────────────────────────────────────────────

describe('GET /api/health', () => {
  it('answers with no secret at all', async () => {
    const { base } = await startService()
    const response = await fetch(`${base}/api/health`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
  })

  it('reads no database, and cannot be turned into an existence oracle', async () => {
    // A store that throws on every method. If liveness touched a row — even to
    // count them — this would 500 instead of 200.
    const exploding = {
      file: ':none:',
      retention: RETENTION,
      migrated: false,
      latest: () => {
        throw new Error('health must not read the database')
      },
      insert: () => {
        throw new Error('health must not write the database')
      },
      count: () => {
        throw new Error('health must not count rows')
      },
      ids: () => {
        throw new Error('health must not list rows')
      },
      usernames: () => {
        throw new Error('health must not list users')
      },
      close: () => {},
    }
    const { base } = await startService({ store: exploding })

    const response = await fetch(`${base}/api/health`)
    expect(response.status).toBe(200)

    // The body is exactly one fixed field: no version, no uptime, no row count,
    // no user list, no database path. Nothing that says who uses this deployment
    // or how much they train.
    const body = await response.json()
    expect(Object.keys(body)).toEqual(['status'])
    expect(body.status).toBe('ok')
  })

  it('rejects a write to it with 405', async () => {
    const { base } = await startService()
    const response = await fetch(`${base}/api/health`, { method: 'POST' })
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('GET, HEAD')
  })
})

// ─── POST /api/login ────────────────────────────────────────────────────────

describe('POST /api/login checks nothing, on purpose', () => {
  it('accepts a username and any password, and answers with the username', async () => {
    const { base } = await startService()
    const response = await login(base, { username: 'alice', password: 'anything at all' })
    expect(response.status).toBe(200)
    // Exactly the username back. No token, no session id, no cookie, no expiry —
    // there is no session to represent, and inventing one would imply a boundary
    // that does not exist.
    expect(await response.json()).toEqual({ username: 'alice' })
    expect(response.headers.get('set-cookie')).toBe(null)
  })

  it('accepts two different passwords for the same username, identically', async () => {
    const { base } = await startService()
    const first = await login(base, { username: 'alice', password: 'hunter2' })
    const second = await login(base, { username: 'alice', password: 'completely-different' })
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    // The second login is not a failed one. Nothing was remembered from the
    // first, so there is nothing for the second to disagree with.
    expect(await second.json()).toEqual({ username: 'alice' })
  })

  it('accepts a body with no password field at all', async () => {
    const { base } = await startService()
    // Not an oversight in the test: there is nothing to check, so a missing
    // password cannot be missing *something*.
    const response = await login(base, { username: 'alice' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ username: 'alice' })
  })

  it('writes nothing — an account exists once a document is stored under it', async () => {
    const { base, store } = await startService()
    await login(base, { username: 'alice', password: 'x' })
    expect(store.count()).toBe(0)
    expect(store.usernames()).toEqual([])
    // And logging in does not conjure a document to read.
    expect((await get(base, 'alice')).status).toBe(404)
  })

  it('does not tell you whether the account has any history', async () => {
    const { base } = await startService()
    await put(base, 'alice', docText('alice', 3))

    const known = await login(base, { username: 'alice', password: 'x' })
    const unknown = await login(base, { username: 'nobody', password: 'x' })

    expect(known.status).toBe(unknown.status)
    expect(await known.json()).toEqual({ username: 'alice' })
    expect(await unknown.json()).toEqual({ username: 'nobody' })
  })

  it('rejects an invalid username with 400 and states the rule without echoing the value', async () => {
    const { base } = await startService()
    for (const username of ['', 'Alice', 'x'.repeat(USERNAME_MAX_LENGTH + 1), '../etc', 'a b']) {
      const response = await login(base, { username, password: 'x' })
      expect(response.status, username).toBe(400)
      const { error } = await response.json()
      expect(error).toMatch(/username: expected/)
      if (username !== '') expect(error).not.toContain(username)
    }
  })

  it('rejects the wrong method and the wrong content type', async () => {
    const { base } = await startService()

    const wrongMethod = await fetch(`${base}${LOGIN_PATH}`, { headers: authorised() })
    expect(wrongMethod.status).toBe(405)
    expect(wrongMethod.headers.get('allow')).toBe('POST')

    const wrongType = await login(base, { username: 'alice' }, { 'Content-Type': 'text/plain' })
    expect(wrongType.status).toBe(415)
  })

  it('reports the credential check directly', () => {
    expect(checkCredentials('{"username":"alice","password":"x"}')).toEqual({
      ok: true,
      username: 'alice',
    })
    expect(checkCredentials('{"username":"alice"}')).toEqual({ ok: true, username: 'alice' })
    expect(checkCredentials('[]')).toMatchObject({ ok: false })
    expect(checkCredentials('nope')).toMatchObject({ ok: false })
    expect(checkCredentials('{"username":"Alice"}')).toMatchObject({ ok: false })
  })
})

// ─── The password never lands anywhere ──────────────────────────────────────

describe('the password is never stored, logged, echoed, or compared', () => {
  /**
   * A string that could not plausibly occur in the database or the log for any
   * other reason. If it turns up, it got there from the request body.
   */
  const SENTINEL = 'PASSWORD-SENTINEL-8f3a1c-do-not-store-me'

  /** Every byte of every file the store owns: the database, its WAL, its shm. */
  function databaseBytes(dbDir) {
    return readdirSync(dbDir)
      .map((name) => readFileSync(join(dbDir, name)))
      .map((buffer) => buffer.toString('binary'))
      .join('\n')
  }

  it('does not appear in the database files, the log, or the response', async () => {
    const { base, dbDir, logs, store } = await startService()

    const response = await login(base, { username: 'alice', password: SENTINEL })
    expect(response.status).toBe(200)
    const bodyText = await response.text()

    // Force real writes after the login, so the search is over a database that
    // has actually been flushed rather than one that never wrote a page.
    await put(base, 'alice', docText('alice', 1))
    await put(base, 'alice', docText('alice', 2))
    expect(store.count('alice')).toBe(2)

    // 1. Not in the response the client got back.
    expect(bodyText).not.toContain(SENTINEL)
    expect(JSON.parse(bodyText)).toEqual({ username: 'alice' })

    // 2. Not in anything the service logged.
    expect(logs.join('\n')).not.toContain(SENTINEL)
    // The login *was* logged, so the assertion above is not vacuous — a service
    // that logged nothing at all would pass it for the wrong reason.
    expect(logs.join('\n')).toMatch(/login alice/)

    // 3. Not in the database, its write-ahead log, or its shared-memory file.
    //    Searched as raw bytes rather than through SQL, because a password could
    //    have landed in a page SQL no longer references.
    const onDisk = databaseBytes(dbDir)
    expect(onDisk).not.toContain(SENTINEL)
    // Again, not vacuous: the document the same test stored *is* findable there.
    expect(onDisk).toContain('"username": "alice"')
  })

  it('survives the database being closed and reopened without the password appearing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sports-app-pw-'))
    const dbDir = join(root, 'db')
    const file = join(dbDir, 'app.db')
    const store = openSnapshotStore({ file })
    const logs = []
    const server = createStateServer({ store, secret: SECRET, log: (m) => logs.push(m) })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${server.address().port}`

    try {
      await login(base, { username: 'alice', password: SENTINEL })
      await put(base, 'alice', docText('alice', 1))
    } finally {
      await new Promise((resolve) => server.close(resolve))
      // Closing checkpoints the WAL into the main database file, which is the
      // state a backup or a `sqlite3` session would see.
      store.close()
    }

    expect(databaseBytes(dbDir)).not.toContain(SENTINEL)
    expect(logs.join('\n')).not.toContain(SENTINEL)
    rmSync(root, { recursive: true, force: true })
  })

  it('does not leak the body through a JSON parse error', async () => {
    const { base, logs } = await startService()

    // A truncated body — the shape a broken client actually sends. V8's
    // `JSON.parse` message quotes a slice of the input, so passing it through
    // would put part of a real password into the response and the log.
    const truncated = `{"username":"alice","password":"${SENTINEL}"`
    const response = await login(base, truncated)

    expect(response.status).toBe(400)
    const text = await response.text()
    expect(text).not.toContain(SENTINEL)
    expect(logs.join('\n')).not.toContain(SENTINEL)

    // Proof the sentinel really was in the request: the same bytes are what a
    // naive `JSON.parse` error message would have quoted.
    let parseMessage = ''
    try {
      JSON.parse(truncated)
    } catch (cause) {
      parseMessage = String(cause)
    }
    expect(parseMessage).not.toBe('')
  })

  it('does not echo an oversized login body back in the 413', async () => {
    const { base, logs } = await startService({ maxBodyBytes: 256 })
    const padded = JSON.stringify({ username: 'alice', password: `${SENTINEL}${'x'.repeat(4000)}` })
    const response = await login(base, padded)
    expect(response.status).toBe(413)
    expect(await response.text()).not.toContain(SENTINEL)
    expect(logs.join('\n')).not.toContain(SENTINEL)
  })

  it('never reaches the real process\u2019s stdout or stderr, at the file-descriptor level', async () => {
    // The migration risk this test exists for: **Fastify logs every request by
    // default.** `logger: false` is what switches that off, and this is what
    // notices if it is ever switched back on — in the real process, over real
    // pipes, because pino bypasses `process.stdout.write` entirely.
    const service = await startServiceProcess()

    const response = await fetch(`${service.base}${LOGIN_PATH}`, {
      method: 'POST',
      headers: authorised({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ username: 'alice', password: SENTINEL }),
    })
    expect(response.status).toBe(200)
    expect(await response.text()).not.toContain(SENTINEL)

    // Two writes, so the database has actually been flushed rather than never
    // having written a page.
    expect((await put(service.base, 'alice', docText('alice', 1))).status).toBe(200)
    expect((await put(service.base, 'alice', docText('alice', 2))).status).toBe(200)

    // SIGTERM, which checkpoints the WAL into the main file on the way out.
    await service.stop()
    const printed = service.output()

    // 1. The credential is not in anything the process printed.
    expect(printed).not.toContain(SENTINEL)

    // 2. Nor is any request line at all. This is the assertion with teeth against
    //    a re-enabled framework logger: Fastify's request log does not include the
    //    body, so it would not print the sentinel — it would print one line per
    //    request, naming the route. This service says nothing about a request it
    //    served successfully beyond the receipt below.
    expect(printed).not.toMatch(/api\/(login|state)/)
    expect(printed).not.toMatch(/x-sync-secret/i)
    expect(printed).not.toMatch(/incoming request|request completed|"reqId"/)

    // 3. Positive controls: the process really is wired to these streams, really
    //    did serve those requests, and really does log about them — through the
    //    one log it has, which is only ever handed fixed strings.
    expect(printed).toMatch(/listening on http/)
    expect(printed).toMatch(/login alice/)
    expect(printed).toMatch(/stored snapshot 2 for alice/)

    // 4. And not in the database, its write-ahead log, or its shared-memory file,
    //    as written by the real process rather than by an in-test store.
    const onDisk = databaseBytes(service.dbDir)
    expect(onDisk).not.toContain(SENTINEL)
    // Again, not vacuous: the documents the same requests stored *are* findable.
    expect(onDisk).toContain('"username": "alice"')
  })

  it('has no line of code that reads .password', () => {
    // The guarantee this brief is built on, asserted against the source rather
    // than against behaviour: the handler destructures `username` and nothing
    // else. Behavioural tests can only show that the password did not reach a
    // particular place; this shows it is never read at all.
    const source = readFileSync(join(PROJECT_ROOT, 'server', 'state-server.mjs'), 'utf8')
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/\.password\b/)
    expect(code).not.toMatch(/\[['"]password['"]\]/)
    expect(code).not.toMatch(/\bpassword\s*[,}]/)

    const db = readFileSync(join(PROJECT_ROOT, 'server', 'db.mjs'), 'utf8')
    expect(db.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/password/i)
  })
})

// ─── Username validation on /api/state ──────────────────────────────────────

describe('username validation', () => {
  const REJECTED = [
    '',
    'Alice',
    'ALICE',
    'x'.repeat(USERNAME_MAX_LENGTH + 1),
    '.hidden',
    '-rf',
    '_x',
    'a b',
    'a/b',
    '../etc/passwd',
    '%2e%2e%2fetc',
    "alice'; DROP TABLE snapshots; --",
    'alice"',
    'café',
    'alice\n',
    'a'.repeat(4096),
  ]

  it('rejects a GET with no ?user= at all', async () => {
    const { base } = await startService()
    const response = await fetch(`${base}${STATE_PATH}`, { headers: authorised() })
    expect(response.status).toBe(400)
    expect((await response.json()).error).toMatch(/user: required/)
  })

  it('rejects every out-of-alphabet, empty and over-long username on GET', async () => {
    const { base } = await startService()
    for (const username of REJECTED) {
      const response = await get(base, username)
      expect(response.status, JSON.stringify(username)).toBe(400)
      expect((await response.json()).error).toMatch(/user: expected/)
    }
  })

  it('rejects them on PUT too, and stores nothing', async () => {
    const { base, store } = await startService()
    for (const username of REJECTED) {
      const response = await put(base, username, docText('alice', 1))
      expect(response.status, JSON.stringify(username)).toBe(400)
    }
    expect(store.count()).toBe(0)
  })

  it('accepts a username at exactly the cap', async () => {
    const { base } = await startService()
    const name = 'a'.repeat(USERNAME_MAX_LENGTH)
    expect((await put(base, name, docText(name, 1))).status).toBe(200)
    expect((await get(base, name)).status).toBe(200)
  })

  it('treats a percent-encoded username as the decoded string, not the raw one', async () => {
    const { base } = await startService()
    // `%61lice` decodes to `alice`, so it must reach the same stream. The
    // allowlist runs after decoding for exactly this reason: a check on the
    // encoded form can be walked past with `%2e%2e`.
    await put(base, 'alice', docText('alice', 2))
    const response = await fetch(`${base}${STATE_PATH}?${USER_PARAM}=%61lice`, {
      headers: authorised(),
    })
    expect(response.status).toBe(200)
    expect(await response.text()).toBe(docText('alice', 2))
  })

  it('reports the query parse directly', () => {
    expect(readUsername('/api/state?user=alice')).toEqual({ ok: true, username: 'alice' })
    expect(readUsername('/api/state?x=1&user=bob&y=2')).toEqual({ ok: true, username: 'bob' })
    expect(readUsername('/api/state')).toMatchObject({ ok: false })
    expect(readUsername('/api/state?user=')).toMatchObject({ ok: false })
    expect(readUsername('/api/state?user=Bob')).toMatchObject({ ok: false })
    expect(readUsername('/api/state?user=a%20b')).toMatchObject({ ok: false })
  })

  it('still refuses any path that is not one of the three routes', async () => {
    const { base } = await startService()
    for (const path of [
      '/',
      '/api',
      '/api/states',
      '/api/state/alice',
      '/api/login/alice',
      '/db/app.db',
      '/../.gitignore',
    ]) {
      const response = await fetch(`${base}${path}?${USER_PARAM}=alice`, { headers: authorised() })
      expect(response.status, path).toBe(404)
    }
  })

  it('matches paths exactly, and gains no routes it was not given', async () => {
    const { base } = await startService()

    // `/api/state?x=1` is `/api/state` carrying a stray parameter — not a
    // different path that could slip past a route table. The query is a separate
    // question, answered separately.
    const stray = await fetch(`${base}${STATE_PATH}?x=1`, { headers: authorised() })
    expect(stray.status).toBe(400)
    expect((await stray.json()).error).toMatch(/user: required/)

    // A framework will happily synthesise `HEAD` for every `GET` route. This one
    // has exactly two methods on `/api/state`, and `HEAD` is not one of them.
    const head = await fetch(stateUrl(base, 'alice'), { method: 'HEAD', headers: authorised() })
    expect(head.status).toBe(405)
    expect(head.headers.get('allow')).toBe('GET, PUT')

    // Nor is a trailing slash the same path.
    expect((await fetch(`${base}${STATE_PATH}/`, { headers: authorised() })).status).toBe(404)
  })

  it('rejects an unsupported method on /api/state with 405 and an Allow header', async () => {
    const { base } = await startService()
    const response = await fetch(stateUrl(base, 'alice'), {
      method: 'DELETE',
      headers: authorised(),
    })
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('GET, PUT')
  })
})

// ─── Per-user isolation ─────────────────────────────────────────────────────

describe('one stream per user', () => {
  it('gives each user their own document back', async () => {
    const { base } = await startService()
    const alice = docText('alice', 4)
    const bob = docText('bob', 9)

    expect((await put(base, 'alice', alice)).status).toBe(200)
    expect((await put(base, 'bob', bob)).status).toBe(200)

    expect(await (await get(base, 'alice')).text()).toBe(alice)
    expect(await (await get(base, 'bob')).text()).toBe(bob)
  })

  it('404s for a user with no history even when other users have some', async () => {
    const { base } = await startService()
    await put(base, 'alice', docText('alice', 4))

    const response = await get(base, 'carol')
    expect(response.status).toBe(404)
    expect((await response.json()).error).toMatch(/no state/i)
    // The 404 is the same one an empty database gives: it says nothing about
    // whether anybody else is stored here.
    const empty = await startService()
    expect((await get(empty.base, 'carol')).status).toBe(404)
  })

  it('does not let a write to one user disturb another', async () => {
    const { base, store } = await startService()
    const bob = docText('bob', 9)
    await put(base, 'bob', bob)
    const bobBefore = store.latest('bob')

    for (let i = 1; i <= 5; i += 1) await put(base, 'alice', docText('alice', i))

    const bobAfter = store.latest('bob')
    expect(bobAfter.id).toBe(bobBefore.id)
    expect(bobAfter.docJson).toBe(bob)
    expect(await (await get(base, 'bob')).text()).toBe(bob)
  })

  it('rejects a PUT whose document disagrees with its target, and stores nothing', async () => {
    const { base, store } = await startService()
    const bob = docText('bob', 9)
    await put(base, 'bob', bob)

    // A client bug: the right target, somebody else's document.
    const response = await put(base, 'alice', bob)
    expect(response.status).toBe(400)
    const { error } = await response.json()
    expect(error).toMatch(/username mismatch/)
    expect(error).toMatch(/Nothing was stored/)

    expect(store.count('alice')).toBe(0)
    expect(store.count('bob')).toBe(1)
    expect(store.latest('bob').docJson).toBe(bob)
    expect((await get(base, 'alice')).status).toBe(404)
  })

  it('records the username on the row it wrote', async () => {
    const { base, store } = await startService()
    await put(base, 'alice', docText('alice', 1))
    await put(base, 'bob', docText('bob', 1))
    expect(store.usernames()).toEqual(['alice', 'bob'])
    expect(store.latest('alice').username).toBe('alice')
    expect(store.latest('bob').username).toBe('bob')
  })
})

// ─── The round trip ─────────────────────────────────────────────────────────

describe('PUT then GET round-trips byte-identically', () => {
  it('returns exactly the bytes that were sent', async () => {
    const { base } = await startService()
    const sent = docText('alice', 9)

    const written = await put(base, 'alice', sent)
    expect(written.status).toBe(200)
    const receipt = await written.json()
    expect(receipt.historyLength).toBe(9)
    expect(receipt.username).toBe('alice')

    const read = await get(base, 'alice')
    expect(read.status).toBe(200)
    const returned = await read.text()

    // `toBe`, not `toEqual` on parsed objects: the layout is the point.
    expect(returned).toBe(sent)
    expect(returned.endsWith('\n')).toBe(true)
  })

  it('preserves formatting a re-serialiser would silently normalise', async () => {
    const { base } = await startService()
    // Key order that JSON.stringify would keep but a schema-shaped rewrite would
    // reorder, a trailing newline, odd-but-legal whitespace, unicode, and a
    // number whose JSON text is not its shortest form.
    const sent =
      '{\n  "username": "alice",\n\t"schemaVersion": 3,\n  "history": [],\n' +
      '  "_note": "hé — ✅ \\u00e9\\ud83d\\ude00",\n  "target": 5.50\n}\n'

    expect((await put(base, 'alice', sent)).status).toBe(200)
    const returned = await (await get(base, 'alice')).text()

    expect(returned).toBe(sent)
    // Proof that the assertion above is not vacuous: a re-serialised body would
    // differ from these bytes.
    expect(JSON.stringify(JSON.parse(sent))).not.toBe(sent)
  })

  it('returns unusual-but-valid JSON formatting byte for byte, newline included', async () => {
    const { base, store } = await startService()

    // Every kind of formatting a JSON library is entitled to normalise, and one
    // thing no other fixture in this file has: **no trailing newline.** The
    // service appends one to its own JSON responses, so a document without one is
    // what proves that the response path leaves a *stored* document alone rather
    // than tidying it on the way out.
    const sent =
      '{"schemaVersion":3,\r\n' +
      '        "history"   :   [ ]   ,\n' +
      '\t"username"\t:\t"alice",\n' +
      '  "_escapes": "tab\\there, \\u00e9\\ud83d\\ude00, \\/solidus\\/",\n' +
      '  "_numbers": [1E2, -0.0, 5.50, 1e-7]\n' +
      '}'

    expect((await put(base, 'alice', sent)).status).toBe(200)

    const read = await get(base, 'alice')
    expect(read.status).toBe(200)
    const returned = await read.text()

    expect(returned).toBe(sent)
    expect(returned.endsWith('\n')).toBe(false)
    // Byte length, not character count: an accidental re-encode of the astral
    // escape would change this and not the string comparison above.
    expect(read.headers.get('content-length')).toBe(String(Buffer.byteLength(sent, 'utf8')))
    expect(read.headers.get('x-snapshot-id')).toBe(String(store.latest('alice').id))
    expect(store.latest('alice').docJson).toBe(sent)

    // Proof the assertions above are not vacuous: every one of those choices is
    // something `JSON.parse` → `JSON.stringify` would rewrite.
    const reserialised = JSON.stringify(JSON.parse(sent))
    expect(reserialised).not.toBe(sent)
    expect(reserialised).not.toContain('1E2')
  })

  it('stores the bytes verbatim and echoes whatever schemaVersion it was given', async () => {
    const { base, store } = await startService()
    // 97 is not a version anything knows, and that is the point: the service does
    // not know versions — it copies the number into a column. This used to say 4
    // back when 4 was imaginary; the client shipped v4 and this test did not
    // change, which is the property being asserted. A number pinned to the client's
    // current constant would be asserting the codec's business instead.
    const sent = docText('alice', 4, { schemaVersion: 97 })
    await put(base, 'alice', sent)

    const latest = store.latest('alice')
    expect(latest.docJson).toBe(sent)
    expect(latest.historyLength).toBe(4)
    expect(latest.schemaVersion).toBe(97)
  })

  it('accepts 3 and 4 alike, because it has no list of versions to be on', async () => {
    // The client owns migration, so both versions are in circulation at once: a
    // phone that has not updated pushes v3 and a browser that has pushes v4. The
    // service stores each as it arrived and refuses neither — there is no allowlist
    // here to add a version to, which is why v4 shipped without touching `server/`.
    const { base, store } = await startService()
    for (const version of [3, 4]) {
      const sent = docText('alice', 2, { schemaVersion: version })
      const response = await put(base, 'alice', sent)
      expect(response.status, String(version)).toBe(200)
      expect(store.latest('alice').docJson, String(version)).toBe(sent)
      expect(store.latest('alice').schemaVersion, String(version)).toBe(version)
    }
  })

  it('stores a v4 document with logged sets in it and derives nothing from them', async () => {
    // `logged` is training content. It crosses the wire as opaque numbers, and the
    // only column derived from `history` is its *length* — a fact about the
    // document, not about the training. If this ever needs a SQL aggregate over
    // `logged`, the service has become a consumer of the programme.
    const { base, store } = await startService()
    const sent = [
      '{',
      '  "schemaVersion": 4,',
      '  "username": "alice",',
      '  "cyclePosition": 1,',
      '',
      '  "sessionsDone": { "push": 1, "squat": 0, "hinge": 0, "core": 1, "pull": 1 },',
      '',
      '  "settings": {',
      '    "persistGranted": null,',
      '    "sync": null',
      '  },',
      '',
      '  "history": [',
      '    {',
      '      "completedAt": "2026-09-01T07:00:00.000Z",',
      '      "position": 0,',
      '      "variant": "medium",',
      '      "exercises": [',
      '        { "pattern": "push", "rungId": "push-05-full-3s-down", "sets": 3, "targetValue": 8, "logged": [8, 8, 6] },',
      '        { "pattern": "core", "rungId": "core-04-hollow-hold", "sets": 2, "targetValue": 27 }',
      '      ]',
      '    }',
      '  ]',
      '}',
      '',
    ].join('\n')

    expect((await put(base, 'alice', sent)).status).toBe(200)

    const latest = store.latest('alice')
    // Byte-for-byte, logs included. The GET hands the same bytes back.
    expect(latest.docJson).toBe(sent)
    expect(latest.schemaVersion).toBe(4)
    // One session, whatever is inside it.
    expect(latest.historyLength).toBe(1)

    expect(await (await get(base, 'alice')).text()).toBe(sent)
  })

  it('holds history.length in the sessions_completed column', async () => {
    const { base, store } = await startService()
    // The v3 document dropped `sessionsCompleted`; the column it populated now
    // holds the length of the history, which is the same fact stated honestly.
    // A document *with* a stray `sessionsCompleted` must not be believed over it.
    const sent = docText('alice', 3).replace(
      '"cyclePosition"',
      '"sessionsCompleted": 999,\n  "cyclePosition"',
    )
    const response = await put(base, 'alice', sent)
    expect((await response.json()).historyLength).toBe(3)
    expect(store.latest('alice').historyLength).toBe(3)
  })

  it('survives a close and reopen of the same file', async () => {
    const service = await startService()
    const sent = docText('alice', 12)
    await put(service.base, 'alice', sent)

    // A second handle on the same path — this is what makes it a durability
    // test rather than a test of an in-process cache.
    const reopened = openSnapshotStore({ file: service.file })
    try {
      expect(reopened.latest('alice').docJson).toBe(sent)
    } finally {
      reopened.close()
    }
  })
})

// ─── Rejection leaves the database alone ────────────────────────────────────

describe('a rejected PUT changes nothing', () => {
  it('rejects a malformed body with 400 and leaves the newest row untouched', async () => {
    const { base, store } = await startService()
    const good = docText('alice', 7)
    await put(base, 'alice', good)
    const before = store.latest('alice')

    const bodies = [
      'not json at all',
      '[]',
      'null',
      '"a string"',
      '{}',
      '{"username": "alice", "history": []}',
      '{"schemaVersion": "3", "username": "alice", "history": []}',
      '{"schemaVersion": 3, "history": []}',
      '{"schemaVersion": 3, "username": "", "history": []}',
      '{"schemaVersion": 3, "username": "Alice", "history": []}',
      '{"schemaVersion": 3, "username": 7, "history": []}',
      '{"schemaVersion": 3, "username": "alice"}',
      '{"schemaVersion": 3, "username": "alice", "history": {}}',
      '{"schemaVersion": 3, "username": "alice", "history": null}',
      '{"schemaVersion": 3, "username": "alice", "history": 3}',
    ]

    for (const body of bodies) {
      const response = await put(base, 'alice', body)
      expect(response.status, `body: ${body}`).toBe(400)
    }

    const after = store.latest('alice')
    expect(after.id).toBe(before.id)
    expect(after.docJson).toBe(good)
    expect(store.count()).toBe(1)

    expect(await (await get(base, 'alice')).text()).toBe(good)
  })

  it('rejects a non-JSON content type with 415', async () => {
    const { base, store } = await startService()
    const response = await put(base, 'alice', docText('alice', 1), { 'Content-Type': 'text/plain' })
    expect(response.status).toBe(415)
    expect(store.count()).toBe(0)
  })

  it('accepts a charset parameter on the content type', async () => {
    const { base } = await startService()
    const response = await put(base, 'alice', docText('alice', 1), {
      'Content-Type': 'application/json; charset=utf-8',
    })
    expect(response.status).toBe(200)
  })

  it('rejects an oversized body and stores nothing', async () => {
    const { base, store } = await startService({ maxBodyBytes: 512 })
    const padded = JSON.stringify({
      schemaVersion: 3,
      username: 'alice',
      history: [],
      _pad: 'x'.repeat(4000),
    })
    expect(padded.length).toBeGreaterThan(512)

    const response = await put(base, 'alice', padded)
    expect(response.status).toBe(413)
    expect(store.count()).toBe(0)

    // The same body is accepted under the default cap, so the 413 above is the
    // cap doing its job rather than the body being malformed.
    const roomy = await startService()
    expect((await put(roomy.base, 'alice', padded)).status).toBe(200)
  })

  it('reports the shallow check directly', () => {
    expect(checkDocument('{"schemaVersion":3,"username":"alice","history":[]}')).toEqual({
      ok: true,
      schemaVersion: 3,
      username: 'alice',
      historyLength: 0,
    })
    expect(checkDocument('{')).toMatchObject({ ok: false })
    expect(checkDocument('{"schemaVersion":3,"username":"alice"}')).toMatchObject({ ok: false })
    expect(checkDocument('{"schemaVersion":3,"username":"..","history":[]}')).toMatchObject({
      ok: false,
    })
  })
})

// ─── Retention ──────────────────────────────────────────────────────────────

describe('retention', () => {
  it('prunes one user to the cap and always keeps their newest', async () => {
    const retention = 5
    const { base, store } = await startService({ retention })

    const sent = []
    for (let i = 1; i <= 12; i += 1) {
      sent.push(docText('alice', i))
      const response = await put(base, 'alice', sent[i - 1])
      expect(response.status).toBe(200)
      expect(store.count('alice')).toBe(Math.min(i, retention))
    }

    expect(store.count('alice')).toBe(retention)
    expect(store.latest('alice').docJson).toBe(sent[11])
    expect(store.latest('alice').historyLength).toBe(12)

    // The survivors are the *newest* five, not an arbitrary five.
    expect(store.ids('alice')).toEqual([12, 11, 10, 9, 8])

    expect(await (await get(base, 'alice')).text()).toBe(sent[11])
  })

  it('never prunes below the cap', async () => {
    const { base, store } = await startService({ retention: 4 })
    for (let i = 1; i <= 3; i += 1) await put(base, 'alice', docText('alice', i))
    expect(store.count('alice')).toBe(3)
    expect(store.ids('alice')).toEqual([3, 2, 1])
  })

  it('does not let a busy user evict a quiet user over HTTP either', async () => {
    const retention = 3
    const { base, store } = await startService({ retention })

    const bobDoc = docText('bob', 1)
    await put(base, 'bob', bobDoc)
    const bobRow = store.latest('bob')

    for (let i = 1; i <= 20; i += 1) await put(base, 'alice', docText('alice', i))

    expect(store.count('alice')).toBe(retention)
    expect(store.count('bob')).toBe(1)
    expect(store.latest('bob').id).toBe(bobRow.id)
    expect(await (await get(base, 'bob')).text()).toBe(bobDoc)
  })

  it('reports retained as this user’s row count, not everybody’s', async () => {
    const { base } = await startService({ retention: 10 })
    await put(base, 'bob', docText('bob', 1))
    await put(base, 'bob', docText('bob', 2))
    const response = await put(base, 'alice', docText('alice', 1))
    // 1, not 3: a count of every row would tell each user how much the others
    // train.
    expect((await response.json()).retained).toBe(1)
  })
})

// ─── Configuration ──────────────────────────────────────────────────────────

describe('readConfig', () => {
  it('binds to 127.0.0.1 by default so it cannot be exposed by accident', () => {
    expect(readConfig({}).host).toBe('127.0.0.1')
    expect(readConfig({}).port).toBe(8787)
    expect(readConfig({}).dbFile).toBe(DEFAULT_DB_FILE)
  })

  it('has no default secret', () => {
    expect(readConfig({}).secret).toBe('')
  })

  it('reads host, port, database path and body cap from the environment', () => {
    const config = readConfig({
      SPORTS_APP_HOST: '0.0.0.0',
      SPORTS_APP_PORT: '9000',
      SPORTS_APP_DB: '/tmp/elsewhere.db',
      SPORTS_APP_MAX_BODY_BYTES: '1234',
      SPORTS_APP_SYNC_SECRET: 'from-the-environment',
    })
    expect(config).toMatchObject({
      host: '0.0.0.0',
      port: 9000,
      dbFile: '/tmp/elsewhere.db',
      maxBodyBytes: 1234,
      secret: 'from-the-environment',
    })
  })
})
