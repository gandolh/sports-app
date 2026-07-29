/**
 * Sync tests.
 *
 * The four properties this brief actually turns on, each asserted directly:
 *
 *   1. **`push` cannot break a workout.** Every failure mode — a rejecting
 *      `fetch`, a synchronously throwing `fetch`, a 500, a 401 — resolves to a
 *      value. Nothing here is allowed to reject, because on the session path it
 *      is called as `void push(doc)` right after the local save has already
 *      succeeded.
 *   2. **`push` refuses while the store is read-only.** The latch is set the
 *      real way, by loading corrupt text through `store.load`, not by stubbing a
 *      predicate — the wiring is the thing being tested.
 *   3. **A malformed remote body is rejected by the codec**, with the codec's
 *      own message, and nothing is written.
 *   4. **Remote-ahead prompts rather than overwriting.** Asserted twice over:
 *      the returned status carries both counts, *and* no write happens in either
 *      direction (no `PUT` is issued and storage is not touched).
 *
 * `navigator.onLine` gets its own test, because brief 01 observed it reporting
 * `true` while offline and a reflex to "improve" this module by gating on it
 * would be a regression.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StateDoc, SyncSettings } from '../../domain/types.ts'
import { parse, serialise } from '../codec.ts'
import {
  STORAGE_KEYS,
  clearReadOnly,
  emptyDoc,
  isReadOnly,
  load,
  readOnlyReason,
} from '../store.ts'
import type { StorageLike } from '../store.ts'
import {
  DEFAULT_TIMEOUT_MS,
  SECRET_HEADER,
  applyRemote,
  checkSync,
  compareSessions,
  endpoint,
  pull,
  push,
  saveAndPush,
} from '../sync.ts'

const TARGET: SyncSettings = { baseUrl: 'http://127.0.0.1:8787', secret: 'shared-test-secret' }

// ─── Fakes ──────────────────────────────────────────────────────────────────

interface Fake extends StorageLike {
  readonly map: Map<string, string>
  /** Every mutating call, in order. An empty list proves nothing was written. */
  readonly ops: string[]
}

function fakeStorage(initial: Record<string, string> = {}): Fake {
  const fake: Fake = {
    map: new Map(Object.entries(initial)),
    ops: [],
    getItem(key) {
      return fake.map.get(key) ?? null
    },
    setItem(key, value) {
      fake.ops.push(`set ${key}`)
      fake.map.set(key, value)
    },
    removeItem(key) {
      fake.ops.push(`remove ${key}`)
      fake.map.delete(key)
    },
  }
  return fake
}

let storage: Fake
let logged: { message: string; cause?: unknown }[]

function log(message: string, cause?: unknown): void {
  logged.push(cause === undefined ? { message } : { message, cause })
}

beforeEach(() => {
  clearReadOnly()
  logged = []
  storage = fakeStorage()
  // Installed as the ambient storage so "nothing was written" can be asserted
  // against `storage.ops` even for functions that take no storage argument.
  vi.stubGlobal('localStorage', storage)
})

afterEach(() => {
  vi.unstubAllGlobals()
  clearReadOnly()
})

function docWith(sessionsCompleted: number, sync: SyncSettings | null = TARGET): StateDoc {
  const base = emptyDoc()
  return {
    ...base,
    sessionsCompleted,
    cyclePosition: sessionsCompleted % 3,
    settings: { ...base.settings, sync },
  }
}

type FetchFake = ReturnType<typeof vi.fn> & typeof fetch

/** A `fetch` that answers every call with the same response. */
function responder(body: string, init: ResponseInit = { status: 200 }): FetchFake {
  return vi.fn(() => Promise.resolve(new Response(body, init))) as unknown as FetchFake
}

function failer(cause: unknown): FetchFake {
  return vi.fn(() => Promise.reject(cause)) as unknown as FetchFake
}

function callsWithMethod(fetchImpl: FetchFake, method: string): unknown[] {
  const mock = fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }
  return mock.mock.calls.filter(([, init]) => init.method === method)
}

function headersOf(fetchImpl: FetchFake, index = 0): Record<string, string> {
  const mock = fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }
  const init = mock.mock.calls[index]?.[1]
  return (init?.headers ?? {}) as Record<string, string>
}

function urlOf(fetchImpl: FetchFake, index = 0): string {
  const mock = fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }
  return mock.mock.calls[index]?.[0] ?? ''
}

// ─── endpoint ───────────────────────────────────────────────────────────────

describe('endpoint', () => {
  it('joins a base URL and a path without doubling the slash', () => {
    expect(endpoint('http://host:8787', '/api/state')).toBe('http://host:8787/api/state')
    expect(endpoint('http://host:8787/', '/api/state')).toBe('http://host:8787/api/state')
    expect(endpoint('http://host:8787///', '/api/state')).toBe('http://host:8787/api/state')
    expect(endpoint('  http://host:8787  ', '/api/state')).toBe('http://host:8787/api/state')
  })

  it('treats an empty base URL as same-origin, which is the dev-proxy case', () => {
    expect(endpoint('', '/api/state')).toBe('/api/state')
    expect(endpoint('/', '/api/state')).toBe('/api/state')
  })
})

// ─── push ───────────────────────────────────────────────────────────────────

describe('push', () => {
  it('sends the serialised document to PUT /api/state with the secret in a header', async () => {
    const fetchImpl = responder('{"id":1}')
    const doc = docWith(5)

    const outcome = await push(doc, { fetchImpl, log })

    expect(outcome).toEqual({ ok: true, status: 200, bytes: serialise(doc).length })
    expect(urlOf(fetchImpl)).toBe('http://127.0.0.1:8787/api/state')

    const mock = fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }
    const init = mock.mock.calls[0]?.[1]
    expect(init?.method).toBe('PUT')
    expect(init?.body).toBe(serialise(doc))
    expect(headersOf(fetchImpl)[SECRET_HEADER]).toBe(TARGET.secret)
    expect(headersOf(fetchImpl)['Content-Type']).toBe('application/json')
  })

  it('keeps the secret out of the URL', async () => {
    const fetchImpl = responder('{}')
    await push(docWith(1), { fetchImpl, log })
    expect(urlOf(fetchImpl)).not.toContain(TARGET.secret)
  })

  it('swallows a network failure: resolves, never rejects, never throws', async () => {
    const fetchImpl = failer(new TypeError('Failed to fetch'))

    const outcome = await push(docWith(5), { fetchImpl, log })

    expect(outcome).toEqual({ ok: false, reason: 'network', error: 'Failed to fetch' })
    expect(logged[0]?.message).toMatch(/saved locally/)
  })

  it('swallows a fetch that throws synchronously', async () => {
    const fetchImpl = vi.fn(() => {
      throw new Error('boom')
    }) as unknown as FetchFake

    await expect(push(docWith(5), { fetchImpl, log })).resolves.toEqual({
      ok: false,
      reason: 'network',
      error: 'boom',
    })
  })

  it('produces no unhandled rejection when called as fire-and-forget', async () => {
    const unhandled = vi.fn()
    const scope = globalThis as unknown as {
      addEventListener?: (t: string, l: () => void) => void
      removeEventListener?: (t: string, l: () => void) => void
    }
    // Node reports these on `process`, browsers on `window`. Either way the
    // assertion below is really about `push` returning a settled promise.
    scope.addEventListener?.('unhandledrejection', unhandled)

    void push(docWith(5), { fetchImpl: failer(new Error('offline')), log })
    await new Promise((resolve) => setTimeout(resolve, 0))

    scope.removeEventListener?.('unhandledrejection', unhandled)
    expect(unhandled).not.toHaveBeenCalled()
  })

  it('reports a service rejection without throwing', async () => {
    const fetchImpl = responder('{"error":"unauthorized"}', { status: 401 })
    const outcome = await push(docWith(5), { fetchImpl, log })
    expect(outcome).toMatchObject({ ok: false, reason: 'rejected' })
    if (!outcome.ok) expect(outcome.error).toMatch(/secret/)
  })

  it('does nothing when sync is not configured', async () => {
    const fetchImpl = responder('{}')
    const outcome = await push(docWith(5, null), { fetchImpl, log })
    expect(outcome).toMatchObject({ ok: false, reason: 'not-configured' })
    expect(fetchImpl).not.toHaveBeenCalled()
    // Not a failure — an unconfigured optional feature is not worth a warning.
    expect(logged).toEqual([])
  })

  it('refuses while the store is read-only, and does not reach the network', async () => {
    // The latch is set the real way: a live key holding text the codec cannot
    // read. Uploading it would replace the last good remote snapshot with a
    // document the app never validated.
    const corrupt = fakeStorage({ [STORAGE_KEYS.live]: '{ "schemaVersion": 1,, }' })
    const loaded = load({ storage: corrupt })
    expect(loaded.status).toBe('corrupt')
    expect(isReadOnly()).toBe(true)
    expect(readOnlyReason()).toMatch(/read-only/)

    const fetchImpl = responder('{}')
    const outcome = await push(docWith(5), { fetchImpl, log })

    expect(outcome).toMatchObject({ ok: false, reason: 'read-only' })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(logged[0]?.message).toMatch(/never validated/)
  })

  it('never reads navigator.onLine — it lies (brief 01)', async () => {
    let reads = 0
    vi.stubGlobal('navigator', {
      get onLine() {
        reads += 1
        return false
      },
    })

    const fetchImpl = responder('{}')
    const outcome = await push(docWith(5), { fetchImpl, log })

    // An implementation that gated on onLine would have skipped the request.
    expect(reads).toBe(0)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(outcome.ok).toBe(true)
  })

  it('writes nothing to local storage', async () => {
    await push(docWith(5), { fetchImpl: responder('{}'), log })
    expect(storage.ops).toEqual([])
  })

  it('passes an abort signal so a black-holed connection cannot hang forever', async () => {
    const fetchImpl = responder('{}')
    await push(docWith(5), { fetchImpl, log, timeoutMs: DEFAULT_TIMEOUT_MS })
    const mock = fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }
    expect(mock.mock.calls[0]?.[1].signal).toBeInstanceOf(AbortSignal)
  })
})

// ─── pull ───────────────────────────────────────────────────────────────────

describe('pull', () => {
  it('round-trips a real serialised document through the codec', async () => {
    const remote = docWith(11)
    const fetchImpl = responder(serialise(remote))

    const outcome = await pull(TARGET, { fetchImpl, log })

    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      expect(outcome.doc).toEqual(remote)
      expect(outcome.text).toBe(serialise(remote))
    }
    expect(headersOf(fetchImpl)[SECRET_HEADER]).toBe(TARGET.secret)
  })

  it('rejects a malformed body via the codec, with the codec message', async () => {
    // Structurally a JSON object with a valid schemaVersion — the server's
    // shallow check would have let this through. The codec is what catches it.
    const fetchImpl = responder('{"schemaVersion": 1, "sessionsCompleted": 3}')

    const outcome = await pull(TARGET, { fetchImpl, log })

    expect(outcome).toMatchObject({ ok: false, reason: 'invalid' })
    if (!outcome.ok) {
      expect(outcome.error).toContain('nothing was changed')
      // The codec's own path-prefixed problems, not a rewritten summary.
      const direct = parse('{"schemaVersion": 1, "sessionsCompleted": 3}')
      expect(direct.ok).toBe(false)
      if (!direct.ok) expect(outcome.error).toContain(direct.error)
    }
    expect(storage.ops).toEqual([])
  })

  it('rejects a body that is not JSON at all, such as a captive-portal page', async () => {
    const fetchImpl = responder('<!doctype html><title>Sign in</title>')
    const outcome = await pull(TARGET, { fetchImpl, log })
    expect(outcome).toMatchObject({ ok: false, reason: 'invalid' })
    if (!outcome.ok) expect(outcome.error).toMatch(/not valid JSON/)
  })

  it('rejects a document whose rungIndex is out of range for the real ladders', async () => {
    // Bounds checking only happens because `pull` passes `{ ladders: LADDERS }`.
    const remote = docWith(4)
    const text = serialise({
      ...remote,
      ladders: { ...remote.ladders, push: { ...remote.ladders.push, rungIndex: 999 } },
    })
    const outcome = await pull(TARGET, { fetchImpl: responder(text), log })
    expect(outcome).toMatchObject({ ok: false, reason: 'invalid' })
    if (!outcome.ok) expect(outcome.error).toContain('ladders.push.rungIndex')
  })

  it('maps 404 to the empty (new-service) case rather than an error', async () => {
    const outcome = await pull(TARGET, {
      fetchImpl: responder('{"error":"no state"}', { status: 404 }),
      log,
    })
    expect(outcome).toMatchObject({ ok: false, reason: 'empty' })
  })

  it('maps 401 to unauthorized', async () => {
    const outcome = await pull(TARGET, {
      fetchImpl: responder('{"error":"unauthorized"}', { status: 401 }),
      log,
    })
    expect(outcome).toMatchObject({ ok: false, reason: 'unauthorized' })
  })

  it('maps a transport failure to network without throwing', async () => {
    await expect(
      pull(TARGET, { fetchImpl: failer(new TypeError('Load failed')), log }),
    ).resolves.toMatchObject({ ok: false, reason: 'network' })
  })
})

// ─── Conflict handling ──────────────────────────────────────────────────────

describe('compareSessions', () => {
  it('is a plain comparison of two monotonic counters', () => {
    expect(compareSessions(10, 9)).toBe('local-ahead')
    expect(compareSessions(9, 9)).toBe('equal')
    expect(compareSessions(9, 10)).toBe('remote-ahead')
  })
})

describe('checkSync', () => {
  it('prompts instead of overwriting when the remote is ahead', async () => {
    const local = docWith(9)
    const remote = docWith(12)
    const fetchImpl = responder(serialise(remote))

    const status = await checkSync(local, TARGET, { fetchImpl, log })

    // Both numbers, so the UI can state the choice plainly.
    expect(status).toMatchObject({ kind: 'conflict', localSessions: 9, remoteSessions: 12 })
    if (status.kind === 'conflict') expect(status.remote.sessionsCompleted).toBe(12)

    // And no overwrite in either direction: no upload…
    expect(callsWithMethod(fetchImpl, 'PUT')).toHaveLength(0)
    // …and nothing written locally.
    expect(storage.ops).toEqual([])
  })

  it('is safe to push when local is ahead, and still writes nothing by itself', async () => {
    const status = await checkSync(docWith(12), TARGET, {
      fetchImpl: responder(serialise(docWith(9))),
      log,
    })
    expect(status).toEqual({ kind: 'local-ahead', localSessions: 12, remoteSessions: 9 })
    expect(storage.ops).toEqual([])
  })

  it('reports in-sync when the counts are equal', async () => {
    const status = await checkSync(docWith(9), TARGET, {
      fetchImpl: responder(serialise(docWith(9))),
      log,
    })
    expect(status).toEqual({ kind: 'in-sync', sessions: 9 })
  })

  it('reports remote-empty when the service has never been written to', async () => {
    const status = await checkSync(docWith(3), TARGET, {
      fetchImpl: responder('{"error":"none"}', { status: 404 }),
      log,
    })
    expect(status).toEqual({ kind: 'remote-empty', localSessions: 3 })
  })

  it('offers to adopt the remote copy when there is no local document', async () => {
    const remote = docWith(7)
    const status = await checkSync(null, TARGET, { fetchImpl: responder(serialise(remote)), log })
    expect(status).toMatchObject({ kind: 'adopt-remote', remoteSessions: 7 })
    // Still no write — adopting is a separate, explicit step.
    expect(storage.ops).toEqual([])
  })

  it('reports not-configured without touching the network', async () => {
    const fetchImpl = responder('{}')
    expect(await checkSync(docWith(3), null, { fetchImpl, log })).toEqual({
      kind: 'not-configured',
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('surfaces a failure instead of guessing', async () => {
    const status = await checkSync(docWith(3), TARGET, {
      fetchImpl: failer(new TypeError('Failed to fetch')),
      log,
    })
    expect(status).toMatchObject({ kind: 'failed', reason: 'network' })
  })
})

// ─── applyRemote ────────────────────────────────────────────────────────────

describe('applyRemote', () => {
  it('writes through store.save, so the document is verified before promotion', async () => {
    const remote = docWith(6)
    const result = applyRemote(remote, { storage })

    expect(result.ok).toBe(true)
    // The shadow key was written and then removed: verify-before-promote.
    expect(storage.ops).toEqual([
      `set ${STORAGE_KEYS.shadow}`,
      `set ${STORAGE_KEYS.live}`,
      `remove ${STORAGE_KEYS.shadow}`,
      `set ${STORAGE_KEYS.meta}`,
    ])
    expect(storage.map.get(STORAGE_KEYS.live)).toBe(serialise(remote))

    const reloaded = load({ storage })
    expect(reloaded.status).toBe('loaded')
    if (reloaded.status === 'loaded') expect(reloaded.doc).toEqual(remote)
  })

  it('refuses to overwrite a corrupt local document unless told to', () => {
    const corrupt = fakeStorage({ [STORAGE_KEYS.live]: 'this is not a state document' })
    expect(load({ storage: corrupt }).status).toBe('corrupt')
    const before = corrupt.map.get(STORAGE_KEYS.live)

    const refused = applyRemote(docWith(6), { storage: corrupt })
    expect(refused.ok).toBe(false)
    // Byte-for-byte untouched: it may be the only copy, and hand-repairable.
    expect(corrupt.map.get(STORAGE_KEYS.live)).toBe(before)

    const forced = applyRemote(docWith(6), { storage: corrupt, allowOverwriteCorrupt: true })
    expect(forced.ok).toBe(true)
    expect(corrupt.map.get(STORAGE_KEYS.live)).toBe(serialise(docWith(6)))
  })

  it('keeps this device’s sync settings rather than adopting the remote copy’s', () => {
    const otherDevice: SyncSettings = { baseUrl: 'http://192.168.1.40:8787', secret: 'theirs' }
    const remote = docWith(6, otherDevice)

    applyRemote(remote, { storage, preserveSync: TARGET })

    const reloaded = load({ storage })
    expect(reloaded.status).toBe('loaded')
    if (reloaded.status === 'loaded') {
      expect(reloaded.doc.settings.sync).toEqual(TARGET)
      // Everything else came from the remote document.
      expect(reloaded.doc.sessionsCompleted).toBe(6)
    }
  })

  it('keeps the remote sync settings when no override is given', () => {
    const otherDevice: SyncSettings = { baseUrl: 'http://192.168.1.40:8787', secret: 'theirs' }
    applyRemote(docWith(6, otherDevice), { storage })
    const reloaded = load({ storage })
    if (reloaded.status === 'loaded') expect(reloaded.doc.settings.sync).toEqual(otherDevice)
  })
})

// ─── The session path ───────────────────────────────────────────────────────

describe('saveAndPush', () => {
  it('completes a session normally with the service unreachable, leaving local state intact', async () => {
    // Session 1 lands while the service is up.
    const first = docWith(1)
    expect(saveAndPush(first, { storage, fetchImpl: responder('{}'), log }).ok).toBe(true)

    // Session 2 lands while the service is unreachable. From the caller's point
    // of view nothing is different: the save succeeds and no error surfaces.
    const second = docWith(2)
    const result = saveAndPush(second, {
      storage,
      fetchImpl: failer(new TypeError('Failed to fetch')),
      log,
    })

    expect(result.ok).toBe(true)
    // Let the fire-and-forget push settle. It must not reject.
    await new Promise((resolve) => setTimeout(resolve, 0))

    // Local state is the session that was just completed, byte-for-byte.
    expect(storage.map.get(STORAGE_KEYS.live)).toBe(serialise(second))
    const reloaded = load({ storage })
    expect(reloaded.status).toBe('loaded')
    if (reloaded.status === 'loaded') expect(reloaded.doc.sessionsCompleted).toBe(2)

    // The failure is a log line and nothing more.
    expect(logged.map((entry) => entry.message)).toContain(
      'Sync push failed; the session is saved locally and will sync later.',
    )
  })

  it('does not upload a document the store refused to save', async () => {
    const corrupt = fakeStorage({ [STORAGE_KEYS.live]: 'not a state document' })
    expect(load({ storage: corrupt }).status).toBe('corrupt')

    const fetchImpl = responder('{}')
    const result = saveAndPush(docWith(3), { storage: corrupt, fetchImpl, log })

    expect(result.ok).toBe(false)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('returns at local-save speed without awaiting the upload', () => {
    let settled = false
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          setTimeout(() => {
            settled = true
            resolve(new Response('{}'))
          }, 50)
        }),
    ) as unknown as FetchFake

    const result = saveAndPush(docWith(4), { storage, fetchImpl, log })

    expect(result.ok).toBe(true)
    // The save has already returned while the request is still in flight.
    expect(settled).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
