/**
 * Session tests — "which username is this browser acting as".
 *
 * Small module, three properties worth holding:
 *
 *   1. **What goes in comes out**, trimmed and otherwise unmodified. In
 *      particular case is *not* folded, because the sync service rejects an
 *      uppercase username rather than folding it, and a client that folded would
 *      let two people believe they had separate accounts while sharing one
 *      document.
 *   2. **A rejected username writes nothing.** The failure is a returned message,
 *      never a throw and never a partial write.
 *   3. **Logging out removes the session key and nothing else.** No document is
 *      touched, because logging out is not a request to delete a history.
 */
import { describe, expect, it } from 'vitest'
import { USERNAME_MAX_LENGTH } from '../codec.ts'
import { SESSION_KEY, clearCurrentUsername, currentUsername, setCurrentUsername } from '../session.ts'
import { STORAGE_KEYS, emptyDoc, save } from '../store.ts'
import type { StorageLike } from '../store.ts'

interface Fake extends StorageLike {
  readonly map: Map<string, string>
  readonly ops: string[]
  onSetItem: ((key: string) => void) | null
  throwOnGet: boolean
}

function fakeStorage(initial: Record<string, string> = {}): Fake {
  const fake: Fake = {
    map: new Map(Object.entries(initial)),
    ops: [],
    onSetItem: null,
    throwOnGet: false,
    getItem(key) {
      if (fake.throwOnGet) throw new Error('SecurityError: storage is blocked')
      return fake.map.get(key) ?? null
    },
    setItem(key, value) {
      fake.onSetItem?.(key)
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

describe('reading and writing the current username', () => {
  it('is null before anybody logs in', () => {
    expect(currentUsername({ storage: fakeStorage() })).toBeNull()
  })

  it('round-trips a username through one key', () => {
    const storage = fakeStorage()
    expect(setCurrentUsername('alice', { storage })).toEqual({ ok: true, username: 'alice' })
    expect(storage.ops).toEqual([`set ${SESSION_KEY}`])
    expect(storage.map.get(SESSION_KEY)).toBe('alice')
    expect(currentUsername({ storage })).toBe('alice')
  })

  it('replaces the previous user rather than accumulating', () => {
    const storage = fakeStorage()
    setCurrentUsername('alice', { storage })
    setCurrentUsername('bob', { storage })
    expect(currentUsername({ storage })).toBe('bob')
    expect([...storage.map.keys()]).toEqual([SESSION_KEY])
  })

  it('trims surrounding whitespace, which cannot merge two accounts', () => {
    const storage = fakeStorage()
    expect(setCurrentUsername('  alice \n', { storage })).toEqual({ ok: true, username: 'alice' })
    expect(storage.map.get(SESSION_KEY)).toBe('alice')
  })

  it('rejects an uppercase username rather than folding it', () => {
    // The service rejects it too, for the same reason. Folding here would produce
    // a client that silently disagrees with the service about who you are.
    const storage = fakeStorage()
    const result = setCurrentUsername('Alice', { storage })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error).toContain('lowercase')
    expect(storage.ops).toEqual([])
    expect(currentUsername({ storage })).toBeNull()
  })

  it('rejects everything else outside the allowlist, and writes nothing', () => {
    const storage = fakeStorage()
    for (const candidate of [
      '',
      '   ',
      '.hidden',
      '-dash',
      '_score',
      'a b',
      'a/b',
      'a\tb',
      'düsseldorf',
      '💪',
      'a'.repeat(USERNAME_MAX_LENGTH + 1),
    ]) {
      const result = setCurrentUsername(candidate, { storage })
      expect(result.ok, JSON.stringify(candidate)).toBe(false)
    }
    expect(storage.ops).toEqual([])
  })

  it('accepts the edges of the allowlist', () => {
    const storage = fakeStorage()
    for (const candidate of ['a', '0', 'a.b-c_d', 'local', 'a'.repeat(USERNAME_MAX_LENGTH)]) {
      expect(setCurrentUsername(candidate, { storage }), candidate).toEqual({
        ok: true,
        username: candidate,
      })
    }
  })

  it('treats a junk stored value as nobody logged in, and leaves it alone', () => {
    // A trip through the login screen costs nothing and creates nothing, so there
    // is no repair worth attempting here — unlike an unreadable *document*.
    const storage = fakeStorage({ [SESSION_KEY]: 'NOT A USERNAME' })
    expect(currentUsername({ storage })).toBeNull()
    expect(storage.map.get(SESSION_KEY)).toBe('NOT A USERNAME')
    expect(storage.ops).toEqual([])
  })
})

describe('logging out', () => {
  it('removes the session key and no document', () => {
    const storage = fakeStorage()
    setCurrentUsername('alice', { storage })
    expect(save(emptyDoc('alice'), { storage }).ok).toBe(true)

    clearCurrentUsername({ storage })

    expect(currentUsername({ storage })).toBeNull()
    expect(storage.map.has(SESSION_KEY)).toBe(false)
    // The training history is exactly where it was. Logging out is not a delete.
    expect(storage.map.has(STORAGE_KEYS.live('alice'))).toBe(true)
  })

  it('does nothing and says nothing when nobody was logged in', () => {
    const storage = fakeStorage()
    expect(() => clearCurrentUsername({ storage })).not.toThrow()
  })
})

describe('storage that is unavailable or hostile', () => {
  it('reports that it cannot remember, rather than pretending it did', () => {
    // These tests run in the `node` environment, which has no localStorage at
    // all — so injecting nothing is the blocked-storage path: the app can still
    // run for this tab, but it will forget on reload.
    const result = setCurrentUsername('alice', {})
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error).toContain('cannot remember')
  })

  it('never throws out of a read', () => {
    const storage = fakeStorage({ [SESSION_KEY]: 'alice' })
    storage.throwOnGet = true
    expect(currentUsername({ storage })).toBeNull()
  })

  it('reports a write that throws', () => {
    const storage = fakeStorage()
    storage.onSetItem = () => {
      throw new Error('QuotaExceededError')
    }
    const result = setCurrentUsername('alice', { storage })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error).toContain('QuotaExceededError')
  })
})

describe('the session key cannot be confused with a document key', () => {
  it('is a different key from every user’s live, shadow and meta key', () => {
    for (const name of ['session.v3', 'sports-app.session.v3', 'alice', '', 'a.b']) {
      expect(STORAGE_KEYS.live(name)).not.toBe(SESSION_KEY)
      expect(STORAGE_KEYS.shadow(name)).not.toBe(SESSION_KEY)
      expect(STORAGE_KEYS.meta(name)).not.toBe(SESSION_KEY)
    }
  })
})
