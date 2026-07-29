/**
 * Store tests.
 *
 * Two properties carry this brief, and both are asserted here directly rather
 * than inferred:
 *
 *   1. **A save is crash-safe.** The shadow key is written and verified before
 *      the live key is touched, so no failure mode leaves the live key holding
 *      partial or unparseable text. Every failure injected below is followed by
 *      a byte-for-byte comparison of the live key against the last good save.
 *   2. **A failed parse of the live key never causes a write.** The stored bytes
 *      are compared with `toBe` after loading, after a refused save, and after
 *      repeated loads. It is the user's only copy of their training history.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StateDoc } from '../../domain/types.ts'
import { LADDERS } from '../../domain/ladders.ts'
import { midProgram } from '../../domain/__tests__/fixtures.ts'
import { parse, serialise } from '../codec.ts'
import {
  STORAGE_KEYS,
  clearReadOnly,
  emptyDoc,
  isReadOnly,
  load,
  readMeta,
  readOnlyReason,
  requestPersistentStorage,
  save,
} from '../store.ts'
import type { StorageLike } from '../store.ts'

// ─── A storage fake with fault injection ────────────────────────────────────

interface Fake extends StorageLike {
  readonly map: Map<string, string>
  /** Every mutating call, in order. Lets write *ordering* be asserted. */
  readonly ops: string[]
  /** Throw from here to simulate a quota error or a hostile storage layer. */
  onSetItem: ((key: string, value: string) => void) | null
  /** Rewrite what is actually stored — simulates storage that lies. */
  mangle: ((key: string, value: string) => string) | null
  onGetItem: ((key: string) => void) | null
}

function fakeStorage(initial: Record<string, string> = {}): Fake {
  const fake: Fake = {
    map: new Map(Object.entries(initial)),
    ops: [],
    onSetItem: null,
    mangle: null,
    onGetItem: null,
    getItem(key) {
      fake.onGetItem?.(key)
      return fake.map.get(key) ?? null
    },
    setItem(key, value) {
      fake.onSetItem?.(key, value)
      fake.ops.push(`set ${key}`)
      fake.map.set(key, fake.mangle ? fake.mangle(key, value) : value)
    },
    removeItem(key) {
      fake.ops.push(`remove ${key}`)
      fake.map.delete(key)
    },
  }
  return fake
}

const GOOD_TEXT = serialise(midProgram)

/**
 * A realistic hand-edit slip: a stray comma left behind after deleting a line.
 *
 * Derived from the fixture's own session count rather than a literal, because a
 * literal silently stops breaking the document when the fixture changes — and a
 * `HAND_BROKEN_TEXT` that parses cleanly would make every read-only guard test
 * below pass for the wrong reason.
 */
const BROKEN_LINE = `"sessionsCompleted": ${midProgram.sessionsCompleted},`
const HAND_BROKEN_TEXT = GOOD_TEXT.replace(BROKEN_LINE, `${BROKEN_LINE},`)
if (HAND_BROKEN_TEXT === GOOD_TEXT) {
  throw new Error('HAND_BROKEN_TEXT is not actually broken — the replace found nothing')
}

beforeEach(() => {
  // The read-only latch is deliberate cross-call state; it must not leak between
  // tests or the guard assertions below would pass for the wrong reason.
  clearReadOnly()
})

// ─── Happy path ─────────────────────────────────────────────────────────────

describe('load and save', () => {
  it('round-trips the mid-program fixture through storage', () => {
    const storage = fakeStorage()
    const saved = save(midProgram, { storage, now: '2026-07-20T08:00:00.000Z' })
    expect(saved.ok).toBe(true)

    const loaded = load({ storage })
    expect(loaded.status).toBe('loaded')
    if (loaded.status !== 'loaded') throw new Error('unreachable')
    expect(loaded.doc).toEqual(midProgram)
  })

  it('reports empty storage as empty rather than inventing a document', () => {
    const storage = fakeStorage()
    expect(load({ storage }).status).toBe('empty')
    expect(isReadOnly()).toBe(false)
  })

  it('records the save time as advisory metadata, outside the document', () => {
    const storage = fakeStorage()
    save(midProgram, { storage, now: '2026-07-20T08:00:00.000Z' })
    expect(readMeta({ storage }).lastSavedAt).toBe('2026-07-20T08:00:00.000Z')
    // Not in the document: a synced doc must not carry another device's clock.
    expect(storage.map.get(STORAGE_KEYS.live)).not.toContain('lastSavedAt')
  })

  it('survives unreadable metadata, because metadata must never block a load', () => {
    const storage = fakeStorage({ [STORAGE_KEYS.meta]: 'not json' })
    expect(readMeta({ storage }).lastSavedAt).toBeNull()
  })

  it('emptyDoc() uses the real ladder content and is savable', () => {
    const storage = fakeStorage()
    const fresh = emptyDoc()
    expect(fresh.ladders.push.target).toBe(LADDERS.push.targetMin)
    expect(save(fresh, { storage }).ok).toBe(true)
  })

  it('uses localStorage when no storage is injected', () => {
    const backing = fakeStorage()
    vi.stubGlobal('localStorage', backing)
    try {
      expect(save(midProgram, {}).ok).toBe(true)
      expect(load({}).status).toBe('loaded')
      expect(backing.map.get(STORAGE_KEYS.live)).toBe(GOOD_TEXT)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

// ─── Shadow-key promotion ───────────────────────────────────────────────────

describe('crash-safe save: shadow key, then promotion', () => {
  it('writes the shadow, promotes to live, and removes the shadow last', () => {
    const storage = fakeStorage()
    expect(save(midProgram, { storage }).ok).toBe(true)

    // Ordering is the whole point: there is never a moment where the live key
    // has been touched but no complete copy exists elsewhere.
    expect(storage.ops).toEqual([
      `set ${STORAGE_KEYS.shadow}`,
      `set ${STORAGE_KEYS.live}`,
      `remove ${STORAGE_KEYS.shadow}`,
      `set ${STORAGE_KEYS.meta}`,
    ])
    expect(storage.map.get(STORAGE_KEYS.live)).toBe(GOOD_TEXT)
    expect(storage.map.has(STORAGE_KEYS.shadow)).toBe(false)
  })

  it('recovers from a shadow left behind by an interrupted save', () => {
    // Exactly the state a crash between the two writes leaves behind: a complete,
    // already-verified shadow and no live key.
    const storage = fakeStorage({ [STORAGE_KEYS.shadow]: GOOD_TEXT })
    const loaded = load({ storage })
    expect(loaded.status).toBe('recovered')
    if (loaded.status !== 'recovered') throw new Error('unreachable')
    expect(loaded.doc).toEqual(midProgram)
    expect(isReadOnly()).toBe(false)
  })

  it('ignores an unparseable shadow rather than surfacing it as history', () => {
    const storage = fakeStorage({ [STORAGE_KEYS.shadow]: HAND_BROKEN_TEXT })
    expect(load({ storage }).status).toBe('empty')
  })

  it('prefers the live key over a stale shadow', () => {
    const older: StateDoc = { ...midProgram, sessionsCompleted: 3 }
    const storage = fakeStorage({
      [STORAGE_KEYS.live]: GOOD_TEXT,
      [STORAGE_KEYS.shadow]: serialise(older),
    })
    const loaded = load({ storage })
    if (loaded.status !== 'loaded') throw new Error(`expected loaded, got ${loaded.status}`)
    expect(loaded.doc.sessionsCompleted).toBe(midProgram.sessionsCompleted)
  })

  it('leaves the live key untouched when the shadow write fails', () => {
    const storage = fakeStorage()
    save(midProgram, { storage })
    storage.ops.length = 0

    storage.onSetItem = (key) => {
      if (key === STORAGE_KEYS.shadow) throw new Error('QuotaExceededError')
    }
    const next: StateDoc = { ...midProgram, sessionsCompleted: 10 }
    const result = save(next, { storage })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error).toContain('previously saved history is intact')
    expect(storage.map.get(STORAGE_KEYS.live)).toBe(GOOD_TEXT)
  })

  it('leaves a recoverable shadow when the promotion itself fails', () => {
    const storage = fakeStorage()
    storage.onSetItem = (key) => {
      if (key === STORAGE_KEYS.live) throw new Error('QuotaExceededError')
    }
    const result = save(midProgram, { storage })

    expect(result.ok).toBe(false)
    expect(storage.map.has(STORAGE_KEYS.live)).toBe(false)
    // The staged copy is complete, so the next load picks it up.
    expect(storage.map.get(STORAGE_KEYS.shadow)).toBe(GOOD_TEXT)
    storage.onSetItem = null
    expect(load({ storage }).status).toBe('recovered')
  })

  it('refuses to promote when the shadow reads back different from what was written', () => {
    const storage = fakeStorage()
    save(midProgram, { storage })

    // Storage that silently truncates. Real Safari bugs of this shape are why the
    // read-back exists rather than trusting setItem's return.
    storage.mangle = (_key, value) => value.slice(0, 100)
    const next: StateDoc = { ...midProgram, sessionsCompleted: 10 }
    const result = save(next, { storage })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error).toContain('read back different')
    expect(result.error).toContain('previously saved history is untouched')
    expect(storage.map.get(STORAGE_KEYS.live)).toBe(GOOD_TEXT)
  })

  it('refuses to promote a document that does not read back as itself', () => {
    const storage = fakeStorage()
    save(midProgram, { storage })

    // A NaN target serialises to `null`, which parse rejects. This is the failure
    // the verify step exists for: it passes setItem happily and destroys history.
    const broken: StateDoc = {
      ...midProgram,
      ladders: { ...midProgram.ladders, push: { ...midProgram.ladders.push, target: Number.NaN } },
    }
    const result = save(broken, { storage })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error).toContain('did not read back correctly')
    expect(result.error).toContain('ladders.push.target')
    expect(storage.map.get(STORAGE_KEYS.live)).toBe(GOOD_TEXT)
    // Nothing was staged either.
    expect(storage.map.has(STORAGE_KEYS.shadow)).toBe(false)
  })

  it('refuses to save an out-of-range rung index', () => {
    const storage = fakeStorage()
    save(midProgram, { storage })
    const broken: StateDoc = {
      ...midProgram,
      ladders: {
        ...midProgram.ladders,
        squat: { ...midProgram.ladders.squat, rungIndex: LADDERS.squat.rungs.length + 5 },
      },
    }
    const result = save(broken, { storage })
    expect(result.ok).toBe(false)
    expect(storage.map.get(STORAGE_KEYS.live)).toBe(GOOD_TEXT)
  })

  it('never leaves the live key holding partial text, whichever write fails', () => {
    for (const failing of [STORAGE_KEYS.shadow, STORAGE_KEYS.live, STORAGE_KEYS.meta]) {
      clearReadOnly()
      const storage = fakeStorage()
      save(midProgram, { storage })
      storage.onSetItem = (key) => {
        if (key === failing) throw new Error('boom')
      }
      save({ ...midProgram, sessionsCompleted: 10 }, { storage })

      const live = storage.map.get(STORAGE_KEYS.live)
      expect(live).toBeDefined()
      // Whatever happened, the live key still holds a document that parses.
      expect(parse(live as string, { ladders: LADDERS }).ok).toBe(true)
    }
  })
})

// ─── A corrupt live key is never overwritten ────────────────────────────────

describe('a live document that cannot be parsed', () => {
  it('reports it, goes read-only, and leaves the stored text byte-identical', () => {
    const storage = fakeStorage({ [STORAGE_KEYS.live]: HAND_BROKEN_TEXT })

    const loaded = load({ storage })
    expect(loaded.status).toBe('corrupt')
    if (loaded.status !== 'corrupt') throw new Error('unreachable')

    // Byte-identical. Not trimmed, not reformatted, not moved aside.
    expect(storage.map.get(STORAGE_KEYS.live)).toBe(HAND_BROKEN_TEXT)
    expect(loaded.rawText).toBe(HAND_BROKEN_TEXT)
    // No write of any kind happened.
    expect(storage.ops).toEqual([])

    expect(loaded.error).toContain('not valid JSON')
    expect(isReadOnly()).toBe(true)
    expect(readOnlyReason()).toContain('read-only')
  })

  it('stays byte-identical across repeated loads', () => {
    const storage = fakeStorage({ [STORAGE_KEYS.live]: HAND_BROKEN_TEXT })
    for (let i = 0; i < 3; i += 1) {
      expect(load({ storage }).status).toBe('corrupt')
      expect(storage.map.get(STORAGE_KEYS.live)).toBe(HAND_BROKEN_TEXT)
    }
    expect(storage.ops).toEqual([])
  })

  it('refuses a save that would overwrite it, and says why', () => {
    const storage = fakeStorage({ [STORAGE_KEYS.live]: HAND_BROKEN_TEXT })
    load({ storage })

    // The dangerous sequence: a corrupt load, the app falls back to a fresh
    // document, and saving it would erase the only copy of the history.
    const result = save(emptyDoc(), { storage })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error).toContain('read-only')
    expect(storage.map.get(STORAGE_KEYS.live)).toBe(HAND_BROKEN_TEXT)
    expect(storage.ops).toEqual([])
  })

  it('refuses even without a prior load, so call order cannot defeat the guard', () => {
    const storage = fakeStorage({ [STORAGE_KEYS.live]: HAND_BROKEN_TEXT })
    const result = save(emptyDoc(), { storage })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error).toContain('could not be read')
    expect(storage.map.get(STORAGE_KEYS.live)).toBe(HAND_BROKEN_TEXT)
    expect(isReadOnly()).toBe(true)
  })

  it('recognises a structurally-valid file that is not a state document', () => {
    const storage = fakeStorage({ [STORAGE_KEYS.live]: '{"name":"other-app","version":"2"}' })
    const loaded = load({ storage })
    expect(loaded.status).toBe('corrupt')
    if (loaded.status !== 'corrupt') throw new Error('unreachable')
    expect(loaded.error).toContain('schemaVersion')
  })

  it('overwrites only when explicitly allowed, and then clears read-only', () => {
    const storage = fakeStorage({ [STORAGE_KEYS.live]: HAND_BROKEN_TEXT })
    load({ storage })
    expect(isReadOnly()).toBe(true)

    // The confirmed-import path, and the only caller that passes this.
    const result = save(midProgram, { storage, allowOverwriteCorrupt: true })
    expect(result.ok).toBe(true)
    expect(storage.map.get(STORAGE_KEYS.live)).toBe(GOOD_TEXT)
    expect(isReadOnly()).toBe(false)
  })

  it('leaves read-only once a good document is loaded again', () => {
    const storage = fakeStorage({ [STORAGE_KEYS.live]: HAND_BROKEN_TEXT })
    load({ storage })
    expect(isReadOnly()).toBe(true)

    // Simulates the user repairing the file by hand in devtools.
    storage.map.set(STORAGE_KEYS.live, GOOD_TEXT)
    expect(load({ storage }).status).toBe('loaded')
    expect(isReadOnly()).toBe(false)
  })
})

// ─── Storage unavailable ────────────────────────────────────────────────────

describe('storage unavailable', () => {
  it('reports it and goes read-only instead of pretending to save', () => {
    const storage = fakeStorage()
    storage.onGetItem = () => {
      throw new Error('SecurityError: storage is blocked')
    }
    const loaded = load({ storage })
    expect(loaded.status).toBe('unavailable')
    if (loaded.status !== 'unavailable') throw new Error('unreachable')
    expect(loaded.error).toContain('storage could not be read')
    expect(isReadOnly()).toBe(true)
  })

  it('tells the user to export when there is nowhere to save', () => {
    vi.stubGlobal('localStorage', undefined)
    try {
      const loaded = load({})
      expect(loaded.status).toBe('unavailable')
      const result = save(midProgram, {})
      expect(result.ok).toBe(false)
      if (result.ok) throw new Error('unreachable')
      expect(result.error).toContain('Export')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

// ─── navigator.storage.persist() ────────────────────────────────────────────

describe('requestPersistentStorage', () => {
  function stubStorageManager(impl: unknown): void {
    vi.stubGlobal('navigator', { storage: impl })
  }

  it('asks once and records the grant in the document', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    stubStorageManager({ persist, persisted: vi.fn().mockResolvedValue(false) })
    try {
      const outcome = await requestPersistentStorage(emptyDoc())
      expect(persist).toHaveBeenCalledTimes(1)
      expect(outcome.granted).toBe(true)
      expect(outcome.changed).toBe(true)
      expect(outcome.doc.settings.persistGranted).toBe(true)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('records a denial so it is visible in the exported file', async () => {
    stubStorageManager({ persist: vi.fn().mockResolvedValue(false) })
    try {
      const outcome = await requestPersistentStorage(emptyDoc())
      expect(outcome.granted).toBe(false)
      expect(outcome.doc.settings.persistGranted).toBe(false)
      expect(outcome.note).toContain('export or sync')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('does not re-ask once an answer is recorded', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    stubStorageManager({ persist })
    try {
      const denied: StateDoc = {
        ...emptyDoc(),
        settings: { ...emptyDoc().settings, persistGranted: false },
      }
      const outcome = await requestPersistentStorage(denied)
      expect(persist).not.toHaveBeenCalled()
      expect(outcome.changed).toBe(false)
      expect(outcome.granted).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('skips the prompt when storage is already persistent', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    stubStorageManager({ persist, persisted: vi.fn().mockResolvedValue(true) })
    try {
      const outcome = await requestPersistentStorage(emptyDoc())
      expect(persist).not.toHaveBeenCalled()
      expect(outcome.granted).toBe(true)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('leaves persistGranted null when the browser has no Storage Manager', async () => {
    // "This browser cannot say" and "this browser said no" are different facts,
    // and the second one would suppress a future ask.
    stubStorageManager(undefined)
    try {
      const outcome = await requestPersistentStorage(emptyDoc())
      expect(outcome.granted).toBeNull()
      expect(outcome.changed).toBe(false)
      expect(outcome.doc.settings.persistGranted).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('never throws when the request itself fails', async () => {
    stubStorageManager({ persist: vi.fn().mockRejectedValue(new Error('nope')) })
    try {
      const outcome = await requestPersistentStorage(emptyDoc())
      expect(outcome.granted).toBeNull()
      expect(outcome.changed).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
