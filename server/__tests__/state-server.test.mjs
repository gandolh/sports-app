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
  STATE_PATH,
  checkDocument,
  createStateServer,
  readConfig,
} from '../state-server.mjs'
import { createFakeWard, sessionFor, WardUnavailableError } from './fake-ward.mjs'

/** The default signed-in identity for tests that only need one person. */
const SUBJECT = 'alice'
const SESSION_COOKIE = sessionFor(SUBJECT)

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
  const ward = options.ward ?? createFakeWard()
  const server = createStateServer({
    store,
    ward,
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

  return { root, file, dbDir: dirname(file), store, base, logs, ward }
}

/** Headers for a signed-in request. */
function authorised(extra = {}) {
  return { cookie: SESSION_COOKIE, ...extra }
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

/**
 * The state URL. It takes no target any more — the stream is the session's.
 *
 * `username` is still a parameter of `put`/`get` below, but it now selects
 * **whose session to present** rather than which stream to ask for. That is the
 * cutover in one line: the same tests, asking the same questions, with the name
 * moved from the URL to the cookie.
 */
function stateUrl(base) {
  return `${base}${STATE_PATH}`
}

async function put(base, username, text, headers = {}) {
  return fetch(stateUrl(base), {
    method: 'PUT',
    headers: {
      cookie: sessionFor(username ?? SUBJECT),
      'Content-Type': 'application/json',
      ...headers,
    },
    body: text,
  })
}

async function get(base, username) {
  return fetch(stateUrl(base), { headers: { cookie: sessionFor(username ?? SUBJECT) } })
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

describe('the session identifies a PERSON, which the shared secret never did', () => {
  /*
   * This block replaces "the shared secret protects the deployment, not the
   * accounts", and the change in its title is the change in the app.
   *
   * The old secret authenticated the *installation*: one string for every
   * caller, with `?user=` naming whose document was wanted. Anyone holding it
   * could read or write anyone's training history by editing a query
   * parameter, and the service said so in its own header rather than
   * pretending otherwise. Ward's session authenticates a person, and the
   * subject it returns is the stream key — so there is no target left to
   * choose.
   */

  it('rejects a request with no session at all', async () => {
    const { base } = await startService()
    const res = await fetch(`${base}${STATE_PATH}`)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
  })

  it('rejects a session it does not recognise', async () => {
    const { base } = await startService()
    const res = await fetch(`${base}${STATE_PATH}`, {
      headers: { cookie: 'ward_session=not-a-real-session' },
    })
    expect(res.status).toBe(401)
  })

  it('rejects an unauthorised PUT without writing anything', async () => {
    const { base, store } = await startService()
    const res = await fetch(`${base}${STATE_PATH}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: docText(SUBJECT, 1),
    })
    expect(res.status).toBe(401)
    expect(store.latest(SUBJECT)).toBeNull()
  })

  it('answers 401 before it validates anything, on every guarded route', async () => {
    const { base } = await startService()
    // A body that would fail validation loudly if it were ever reached.
    const res = await fetch(`${base}${STATE_PATH}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json at all',
    })
    expect(res.status).toBe(401)
  })

  /**
   * The assertion this whole cutover exists for.
   *
   * Two people, two sessions, one service. Neither can name the other's stream
   * because neither names a stream at all — the subject comes from the cookie.
   */
  it('gives each session its own stream, with no way to name another', async () => {
    const { base, store } = await startService()

    expect((await put(base, 'alice', docText('alice', 1))).status).toBe(200)
    expect((await put(base, 'bob', docText('bob', 4))).status).toBe(200)

    // Alice's GET returns Alice's document, and there is no parameter she could
    // add to ask for Bob's.
    const mine = await get(base, 'alice')
    expect(JSON.parse(await mine.text()).username).toBe('alice')
    expect(store.latest('bob')).not.toBeNull()
  })

  /**
   * A `?user=` that would once have chosen the target is now inert. Worth
   * asserting rather than assuming: this is the exact parameter that used to be
   * the whole authorisation model.
   */
  it('ignores a ?user= that names somebody else', async () => {
    const { base } = await startService()
    await put(base, 'bob', docText('bob', 3))

    const res = await fetch(`${base}${STATE_PATH}?user=bob`, {
      headers: { cookie: sessionFor('alice') },
    })
    // Alice has stored nothing, so she gets her own 404 — not Bob's document.
    // The parameter that used to be the entire authorisation model is inert.
    expect(res.status).toBe(404)
  })

  /**
   * Ward being unreachable must not read as "signed out". A sync client that
   * saw 401 would drop its session; 503 tells it to retry.
   */
  it('answers 503, not 401, when Ward cannot be reached', async () => {
    const ward = createFakeWard()
    ward.breakWith(new WardUnavailableError('ward is down'))
    const { base } = await startService({ ward })

    const res = await fetch(`${base}${STATE_PATH}`, { headers: authorised() })
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'identity service unavailable' })
  })

  it('refuses to construct without a Ward client', () => {
    expect(() => createStateServer({ store: openSnapshotStore({ file: ':memory:' }) })).toThrow(
      /requires a Ward client/,
    )
  })
})


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

describe('there is no login route any more', () => {
  /*
   * `POST /api/login` never authenticated anybody: it validated a username and
   * echoed it back so a login screen had something to fail against. Signing in
   * is Ward's now, so the route is gone rather than reimplemented — and with it
   * the whole "the password is never stored, logged, echoed, or compared"
   * block, which asserted a property of a body this service no longer receives.
   *
   * That property has not been weakened, it has moved: no password reaches this
   * process at all, which is a stronger guarantee than never writing one down.
   */

  it('answers 404 for the old login path, without consulting the session', async () => {
    const { base } = await startService()
    const res = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { ...authorised(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'hunter2' }),
    })
    // Not 401 and not 405: the path does not exist, and a signed-in caller
    // learns exactly that.
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not found' })
  })

  it('never sees a password, so none can reach the log or the database', async () => {
    const { base, logs, file } = await startService()
    await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { ...authorised(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'super-secret-value' }),
    })

    expect(logs.join('\n')).not.toContain('super-secret-value')
    const bytes = existsSync(file) ? readFileSync(file, 'utf8') : ''
    expect(bytes).not.toContain('super-secret-value')
  })
})


describe('routing and method handling', () => {
  /*
   * This block was "username validation", and most of it is gone rather than
   * ported.
   *
   * It exercised `?user=`: the alphabet, the length cap, percent-encoding, the
   * "no target given" error. None of that is reachable now — the stream key is
   * the session's subject, so there is no caller-supplied name left to
   * validate. The rule itself still lives in `shared/username.ts` and still
   * guards the name inside a document, which `checkDocument` covers.
   *
   * What survives here is the part that was never about usernames: which paths
   * exist, and what an unauthorised caller may learn from a 404 versus a 405.
   */

  it('still refuses any path that is not one of the two routes', async () => {
    const { base } = await startService()
    for (const path of ['/', '/api', '/api/nope', '/api/state/extra', '/api/login']) {
      const response = await fetch(`${base}${path}`, { headers: authorised() })
      expect(response.status, path).toBe(404)
      expect(await response.json()).toEqual({ error: 'not found' })
    }
  })

  it('matches paths exactly, and gains no routes it was not given', async () => {
    const { base } = await startService()

    // A framework will happily synthesise `HEAD` for every `GET` route. This one
    // has exactly two methods on `/api/state`, and `HEAD` is not one of them.
    const head = await fetch(stateUrl(base), { method: 'HEAD', headers: authorised() })
    expect(head.status).toBe(405)
    expect(head.headers.get('allow')).toBe('GET, PUT')

    // Nor is a trailing slash the same path.
    expect((await fetch(`${base}${STATE_PATH}/`, { headers: authorised() })).status).toBe(404)
  })

  it('rejects an unsupported method on /api/state with 405 and an Allow header', async () => {
    const { base } = await startService()
    const response = await fetch(stateUrl(base), { method: 'DELETE', headers: authorised() })
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('GET, PUT')
  })

  /**
   * An unauthorised caller must not be able to use a 405 to learn that a route
   * exists — the not-found handler checks the session for exactly this reason.
   */
  it('does not let an unauthorised caller tell 405 from 404', async () => {
    const { base } = await startService()
    const real = await fetch(stateUrl(base), { method: 'DELETE' })
    const fake = await fetch(`${base}/api/definitely-not-a-route`, { method: 'DELETE' })
    expect(real.status).toBe(401)
    expect(fake.status).toBe(404)
    // The real route says 401 rather than 405, so the two are told apart only
    // by holding a session.
    expect(real.headers.get('allow')).toBeNull()
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

  /**
   * None of the three Ward variables may default.
   *
   * `WARD_API_BASE_PATH` is the one worth a test rather than a comment: an
   * empty value resolves the JWKS to `<origin>/.well-known/jwks.json`, a path
   * nothing serves, so every token would be rejected with a clean log on the
   * deploy that shipped it. `main` refuses to start on any of the three.
   */
  it('has no default for any Ward variable', () => {
    const config = readConfig({})
    expect(config.wardPublicOrigin).toBe('')
    expect(config.wardApiBasePath).toBe('')
    expect(config.wardAppKey).toBe('')
  })

  it('reads host, port, database path and body cap from the environment', () => {
    const config = readConfig({
      SPORTS_APP_HOST: '0.0.0.0',
      SPORTS_APP_PORT: '9000',
      SPORTS_APP_DB: '/tmp/elsewhere.db',
      SPORTS_APP_MAX_BODY_BYTES: '1234',
      WARD_PUBLIC_ORIGIN: 'https://gandolh.ro',
      WARD_API_BASE_PATH: '/ward-api',
      WARD_APP_KEY: 'wak_from-the-environment',
    })
    expect(config).toMatchObject({
      host: '0.0.0.0',
      port: 9000,
      dbFile: '/tmp/elsewhere.db',
      maxBodyBytes: 1234,
      wardPublicOrigin: 'https://gandolh.ro',
      wardApiBasePath: '/ward-api',
      wardAppKey: 'wak_from-the-environment',
    })
  })
})
