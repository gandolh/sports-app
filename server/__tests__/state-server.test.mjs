/**
 * Service tests, against a real SQLite file.
 *
 * Every test here opens a genuine `DatabaseSync` on a temporary path and drives
 * the service over a real HTTP socket. There is no mock database and no mock
 * transport, because the three properties worth testing are all properties of
 * the real thing:
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
 *   3. **Retention prunes to the cap and always keeps the newest.** A mock
 *      cannot tell you whether the `DELETE ... WHERE id NOT IN (...)` actually
 *      keeps the right rows.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { CURRENT_SCHEMA_VERSION } from '../../src/domain/types.ts'
import { LADDERS } from '../../src/domain/ladders.ts'
import { emptyDoc, serialise } from '../../src/persistence/codec.ts'
import { DEFAULT_DB_DIR, DEFAULT_DB_FILE, PROJECT_ROOT, RETENTION, openSnapshotStore } from '../db.mjs'
import {
  SECRET_HEADER,
  checkDocument,
  createStateServer,
  readConfig,
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
  const store = openSnapshotStore({ file, ...(options.retention ? { retention: options.retention } : {}) })
  const server = createStateServer({
    store,
    secret: SECRET,
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

  return { root, file, store, base }
}

function authorised(extra = {}) {
  return { [SECRET_HEADER]: SECRET, ...extra }
}

async function put(base, text, headers = {}) {
  return fetch(`${base}/api/state`, {
    method: 'PUT',
    headers: authorised({ 'Content-Type': 'application/json', ...headers }),
    body: text,
  })
}

/** A real document, produced by the same serialiser the app uses. */
function docText(sessionsCompleted) {
  const doc = emptyDoc(LADDERS)
  return serialise({ ...doc, sessionsCompleted, cyclePosition: sessionsCompleted % 3 })
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

// ─── Auth ───────────────────────────────────────────────────────────────────

describe('auth', () => {
  it('rejects a missing secret with 401', async () => {
    const { base } = await startService()
    const response = await fetch(`${base}/api/state`)
    expect(response.status).toBe(401)
  })

  it('rejects a wrong secret with 401', async () => {
    const { base } = await startService()
    const response = await fetch(`${base}/api/state`, {
      headers: { [SECRET_HEADER]: 'not-the-secret' },
    })
    expect(response.status).toBe(401)
  })

  it('rejects a wrong secret that happens to be the right length', async () => {
    const { base } = await startService()
    const sameLength = 'x'.repeat(SECRET.length)
    expect(sameLength.length).toBe(SECRET.length)
    const response = await fetch(`${base}/api/state`, {
      headers: { [SECRET_HEADER]: sameLength },
    })
    expect(response.status).toBe(401)
  })

  it('rejects an unauthorised PUT without writing anything', async () => {
    const { base, store } = await startService()
    const response = await fetch(`${base}/api/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: docText(1),
    })
    expect(response.status).toBe(401)
    expect(store.count()).toBe(0)
  })

  it('answers /api/health with no secret at all', async () => {
    const { base } = await startService()
    const response = await fetch(`${base}/api/health`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
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

// ─── GET before any PUT ─────────────────────────────────────────────────────

describe('GET /api/state', () => {
  it('returns 404 before anything has been stored', async () => {
    const { base } = await startService()
    const response = await fetch(`${base}/api/state`, { headers: authorised() })
    expect(response.status).toBe(404)
    expect((await response.json()).error).toMatch(/no state/i)
  })

  it('returns 404 for any other route', async () => {
    const { base } = await startService()
    for (const path of ['/', '/api', '/api/states', '/db/app.db', '/../.gitignore']) {
      const response = await fetch(`${base}${path}`, { headers: authorised() })
      expect(response.status).toBe(404)
    }
  })

  it('rejects an unsupported method with 405 and an Allow header', async () => {
    const { base } = await startService()
    const response = await fetch(`${base}/api/state`, {
      method: 'DELETE',
      headers: authorised(),
    })
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('GET, PUT')
  })
})

// ─── The round trip ─────────────────────────────────────────────────────────

describe('PUT then GET round-trips byte-identically', () => {
  it('returns exactly the bytes that were sent, for a real serialised document', async () => {
    const { base } = await startService()
    const sent = docText(9)

    const written = await put(base, sent)
    expect(written.status).toBe(200)
    expect((await written.json()).sessionsCompleted).toBe(9)

    const read = await fetch(`${base}/api/state`, { headers: authorised() })
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
      '{\n  "sessionsCompleted": 3,\n\t"schemaVersion": 1,\n' +
      '  "_note": "hé — ✅ \\u00e9\\ud83d\\ude00",\n  "target": 5.50\n}\n'

    expect(await (await put(base, sent)).status).toBe(200)
    const returned = await (await fetch(`${base}/api/state`, { headers: authorised() })).text()

    expect(returned).toBe(sent)
    // Proof that the assertion above is not vacuous: a re-serialised body would
    // differ from these bytes.
    expect(JSON.stringify(JSON.parse(sent))).not.toBe(sent)
  })

  it('stores the bytes verbatim in doc_json', async () => {
    const { base, store } = await startService()
    const sent = docText(4)
    await put(base, sent)
    expect(store.latest().docJson).toBe(sent)
    expect(store.latest().sessionsCompleted).toBe(4)
    // Read from the domain rather than hardcoded: `docText` builds a real
    // document, so pinning a literal here would break on every schema bump
    // while proving nothing about the server, which only echoes the field.
    expect(store.latest().schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
  })

  it('survives a close and reopen of the same file', async () => {
    const service = await startService()
    const sent = docText(12)
    await put(service.base, sent)

    // A second handle on the same path — this is what makes it a durability
    // test rather than a test of an in-process cache.
    const reopened = openSnapshotStore({ file: service.file })
    try {
      expect(reopened.latest().docJson).toBe(sent)
    } finally {
      reopened.close()
    }
  })
})

// ─── Rejection leaves the database alone ────────────────────────────────────

describe('a rejected PUT changes nothing', () => {
  it('rejects a malformed body with 400 and leaves the newest row untouched', async () => {
    const { base, store } = await startService()
    const good = docText(7)
    await put(base, good)
    const before = store.latest()

    const bodies = [
      'not json at all',
      '[]',
      'null',
      '"a string"',
      '{}',
      '{"sessionsCompleted": 3}',
      '{"schemaVersion": "1", "sessionsCompleted": 3}',
      '{"schemaVersion": 1}',
      '{"schemaVersion": 1, "sessionsCompleted": -1}',
      '{"schemaVersion": 1, "sessionsCompleted": 2.5}',
      '{"schemaVersion": 1, "sessionsCompleted": "3"}',
    ]

    for (const body of bodies) {
      const response = await put(base, body)
      expect(response.status, `body: ${body}`).toBe(400)
    }

    const after = store.latest()
    expect(after.id).toBe(before.id)
    expect(after.docJson).toBe(good)
    expect(store.count()).toBe(1)

    const read = await fetch(`${base}/api/state`, { headers: authorised() })
    expect(await read.text()).toBe(good)
  })

  it('rejects a non-JSON content type with 415', async () => {
    const { base, store } = await startService()
    const response = await put(base, docText(1), { 'Content-Type': 'text/plain' })
    expect(response.status).toBe(415)
    expect(store.count()).toBe(0)
  })

  it('accepts a charset parameter on the content type', async () => {
    const { base } = await startService()
    const response = await put(base, docText(1), {
      'Content-Type': 'application/json; charset=utf-8',
    })
    expect(response.status).toBe(200)
  })

  it('rejects an oversized body and stores nothing', async () => {
    const { base, store } = await startService({ maxBodyBytes: 512 })
    const padded = JSON.stringify({
      schemaVersion: 1,
      sessionsCompleted: 1,
      _pad: 'x'.repeat(4000),
    })
    expect(padded.length).toBeGreaterThan(512)

    const response = await put(base, padded)
    expect(response.status).toBe(413)
    expect(store.count()).toBe(0)

    // The same body is accepted under the default cap, so the 413 above is the
    // cap doing its job rather than the body being malformed.
    const roomy = await startService()
    expect((await put(roomy.base, padded)).status).toBe(200)
  })

  it('reports the shallow check directly', () => {
    expect(checkDocument('{"schemaVersion":1,"sessionsCompleted":0}')).toEqual({
      ok: true,
      schemaVersion: 1,
      sessionsCompleted: 0,
    })
    expect(checkDocument('{')).toMatchObject({ ok: false })
    expect(checkDocument('{"schemaVersion":1,"sessionsCompleted":-1}')).toMatchObject({ ok: false })
  })
})

// ─── Retention ──────────────────────────────────────────────────────────────

describe('retention', () => {
  it('prunes to the cap and always keeps the newest', async () => {
    const retention = 5
    const { base, store } = await startService({ retention })

    const sent = []
    for (let i = 1; i <= 12; i += 1) {
      sent.push(docText(i))
      const response = await put(base, sent[i - 1])
      expect(response.status).toBe(200)
      expect(store.count()).toBe(Math.min(i, retention))
    }

    expect(store.count()).toBe(retention)

    // The newest row is the newest write, byte-for-byte.
    expect(store.latest().docJson).toBe(sent[11])
    expect(store.latest().sessionsCompleted).toBe(12)

    // And the survivors are the *newest* five, not an arbitrary five.
    const ids = store.ids()
    expect(ids.length).toBe(retention)
    expect(ids).toEqual([12, 11, 10, 9, 8])

    const read = await fetch(`${base}/api/state`, { headers: authorised() })
    expect(await read.text()).toBe(sent[11])
  })

  it('never prunes below the cap', async () => {
    const { base, store } = await startService({ retention: 4 })
    for (let i = 1; i <= 3; i += 1) {
      await put(base, docText(i))
    }
    expect(store.count()).toBe(3)
    expect(store.ids()).toEqual([3, 2, 1])
  })

  it('defaults to a retention small enough that the quadratic term stays small', () => {
    // Not a tuning knob: snapshot size grows with sessions and total size grows
    // with retention × sessions. This assertion exists so that raising it is a
    // deliberate act with a failing test attached.
    expect(RETENTION).toBe(20)
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
