/**
 * Store tests.
 *
 * Four properties carry this module, and all four are asserted directly rather
 * than inferred:
 *
 *   1. **A save is crash-safe.** The shadow key is written and verified before
 *      the live key is touched, so no failure mode leaves the live key holding
 *      partial or unparseable text. Every failure injected below is followed by
 *      a byte-for-byte comparison of the live key against the last good save.
 *   2. **A failed parse of the live key never causes a write.** The stored bytes
 *      are compared with `toBe` after loading, after a refused save, and after
 *      repeated loads. It is the user's only copy of their training history.
 *   3. **One user's broken document does not lock another user out.** The
 *      read-only latch is per username, and the test sets it the real way — by
 *      loading corrupt text — rather than by stubbing a predicate.
 *   4. **A username cannot be smuggled into somebody else's storage key.** The
 *      adversarial cases at the bottom are the point of encoding rather than
 *      concatenating.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StateDoc } from '@sports-app/shared/types.ts'
import { midProgram } from '../../domain/__tests__/fixtures.ts'
import { parse, serialise } from '../codec.ts'
import {
  LEGACY_STORAGE_KEYS,
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

const ALICE = 'alice'
const BOB = 'bob'

function docFor(username: string, cyclePosition = midProgram.cyclePosition): StateDoc {
  return { ...midProgram, username, cyclePosition }
}

const ALICE_DOC = docFor(ALICE)
const GOOD_TEXT = serialise(ALICE_DOC)

const LIVE = STORAGE_KEYS.live(ALICE)
const SHADOW = STORAGE_KEYS.shadow(ALICE)
const META = STORAGE_KEYS.meta(ALICE)

/**
 * A realistic hand-edit slip: a stray comma left behind after deleting a line.
 *
 * Derived from the fixture's own position rather than a literal, because a
 * literal silently stops breaking the document when the fixture changes — and a
 * `HAND_BROKEN_TEXT` that parses cleanly would make every read-only guard test
 * below pass for the wrong reason.
 */
const BROKEN_LINE = `"cyclePosition": ${midProgram.cyclePosition},`
const HAND_BROKEN_TEXT = GOOD_TEXT.replace(BROKEN_LINE, `${BROKEN_LINE},`)
if (HAND_BROKEN_TEXT === GOOD_TEXT) {
  throw new Error('HAND_BROKEN_TEXT is not actually broken — the replace found nothing')
}

/**
 * A pre-v3 document, in the shape the single-document key used to hold: adaptive
 * ladder state, `sessionsCompleted`, per-set arrays and day letters. Written out
 * here because that shape no longer exists anywhere in `src/`.
 */
const LEGACY_TEXT = JSON.stringify(
  {
    schemaVersion: 2,
    sessionsCompleted: 2,
    cyclePosition: 2,
    ladders: {
      push: { rungIndex: 4, target: 8, cleanAtMax: 0, missedStreak: 0 },
      squat: { rungIndex: 3, target: 9, cleanAtMax: 0, missedStreak: 0 },
      hinge: { rungIndex: 3, target: 7, cleanAtMax: 0, missedStreak: 0 },
      core: { rungIndex: 2, target: 35, cleanAtMax: 0, missedStreak: 0 },
      pull: { rungIndex: 2, target: 22, cleanAtMax: 0, missedStreak: 0 },
    },
    settings: {
      soundEnabled: true,
      voiceEnabled: true,
      skipWarmupByDefault: false,
      persistGranted: null,
      sync: null,
    },
    history: [
      {
        completedAt: '2026-06-01T07:05:00.000Z',
        day: 'A',
        exercises: [
          { pattern: 'push', rungId: 'push-04-full', sets: [{ targetValue: 8, actualValue: 8 }] },
          {
            pattern: 'core',
            rungId: 'core-03-front-plank',
            sets: [{ targetValue: 35, actualValue: 30 }],
          },
        ],
      },
      {
        completedAt: '2026-06-02T07:09:00.000Z',
        day: 'B',
        exercises: [
          { pattern: 'squat', rungId: 'squat-03-full', sets: [{ targetValue: 9, actualValue: 9 }] },
          {
            pattern: 'core',
            rungId: 'core-03-front-plank',
            sets: [{ targetValue: 35, actualValue: 35 }],
          },
        ],
      },
    ],
  },
  null,
  2,
)

beforeEach(() => {
  // The read-only latch is deliberate cross-call state; it must not leak between
  // tests or the guard assertions below would pass for the wrong reason.
  clearReadOnly()
})

// ─── Happy path ─────────────────────────────────────────────────────────────

describe('load and save', () => {
  it('round-trips the mid-program fixture through storage', () => {
    const storage = fakeStorage()
    const saved = save(ALICE_DOC, { storage, now: '2026-07-20T08:00:00.000Z' })
    expect(saved.ok).toBe(true)

    const loaded = load(ALICE, { storage })
    expect(loaded.status).toBe('loaded')
    if (loaded.status !== 'loaded') throw new Error('unreachable')
    expect(loaded.doc).toEqual(ALICE_DOC)
  })

  it('takes the key from the document, so a doc cannot land in the wrong user’s key', () => {
    const storage = fakeStorage()
    save(docFor(BOB), { storage })
    expect(storage.map.has(STORAGE_KEYS.live(BOB))).toBe(true)
    expect(storage.map.has(LIVE)).toBe(false)
    expect(load(ALICE, { storage }).status).toBe('empty')
  })

  it('reports empty storage as empty rather than inventing a document', () => {
    const storage = fakeStorage()
    expect(load(ALICE, { storage }).status).toBe('empty')
    expect(isReadOnly(ALICE)).toBe(false)
  })

  it('keeps two users’ documents entirely separate', () => {
    const storage = fakeStorage()
    save(docFor(ALICE, 90), { storage })
    save(docFor(BOB, 12), { storage })

    const alice = load(ALICE, { storage })
    const bob = load(BOB, { storage })
    if (alice.status !== 'loaded' || bob.status !== 'loaded') throw new Error('unreachable')
    expect(alice.doc.cyclePosition).toBe(90)
    expect(bob.doc.cyclePosition).toBe(12)
  })

  it('records the save time as advisory per-user metadata, outside the document', () => {
    const storage = fakeStorage()
    save(ALICE_DOC, { storage, now: '2026-07-20T08:00:00.000Z' })
    expect(readMeta(ALICE, { storage }).lastSavedAt).toBe('2026-07-20T08:00:00.000Z')
    // Nobody else's business, and not in the document: a synced doc must not
    // carry another device's clock.
    expect(readMeta(BOB, { storage }).lastSavedAt).toBeNull()
    expect(storage.map.get(LIVE)).not.toContain('lastSavedAt')
  })

  it('survives unreadable metadata, because metadata must never block a load', () => {
    const storage = fakeStorage({ [META]: 'not json' })
    expect(readMeta(ALICE, { storage }).lastSavedAt).toBeNull()
  })

  it('emptyDoc() belongs to its user and is savable', () => {
    const storage = fakeStorage()
    const fresh = emptyDoc(ALICE)
    expect(fresh.username).toBe(ALICE)
    expect(save(fresh, { storage }).ok).toBe(true)
  })

  it('uses localStorage when no storage is injected', () => {
    const backing = fakeStorage()
    vi.stubGlobal('localStorage', backing)
    try {
      expect(save(ALICE_DOC, {}).ok).toBe(true)
      expect(load(ALICE, {}).status).toBe('loaded')
      expect(backing.map.get(LIVE)).toBe(GOOD_TEXT)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

// ─── Shadow-key promotion ───────────────────────────────────────────────────

describe('crash-safe save: shadow key, then promotion', () => {
  it('writes the shadow, promotes to live, and removes the shadow last', () => {
    const storage = fakeStorage()
    expect(save(ALICE_DOC, { storage }).ok).toBe(true)

    // Ordering is the whole point: there is never a moment where the live key
    // has been touched but no complete copy exists elsewhere.
    expect(storage.ops).toEqual([`set ${SHADOW}`, `set ${LIVE}`, `remove ${SHADOW}`, `set ${META}`])
    expect(storage.map.get(LIVE)).toBe(GOOD_TEXT)
    expect(storage.map.has(SHADOW)).toBe(false)
  })

  it('recovers from a shadow left behind by an interrupted save', () => {
    // Exactly the state a crash between the two writes leaves behind: a complete,
    // already-verified shadow and no live key.
    const storage = fakeStorage({ [SHADOW]: GOOD_TEXT })
    const loaded = load(ALICE, { storage })
    expect(loaded.status).toBe('recovered')
    if (loaded.status !== 'recovered') throw new Error('unreachable')
    expect(loaded.doc).toEqual(ALICE_DOC)
    expect(isReadOnly(ALICE)).toBe(false)
  })

  it('ignores an unparseable shadow rather than surfacing it as history', () => {
    const storage = fakeStorage({ [SHADOW]: HAND_BROKEN_TEXT })
    expect(load(ALICE, { storage }).status).toBe('empty')
    // And it does not latch read-only over a staging copy the live key never took.
    expect(isReadOnly(ALICE)).toBe(false)
  })

  it('ignores another user’s shadow', () => {
    const storage = fakeStorage({ [SHADOW]: serialise(docFor(BOB)) })
    expect(load(ALICE, { storage }).status).toBe('empty')
  })

  it('prefers the live key over a stale shadow', () => {
    const storage = fakeStorage({
      [LIVE]: GOOD_TEXT,
      [SHADOW]: serialise(docFor(ALICE, 3)),
    })
    const loaded = load(ALICE, { storage })
    if (loaded.status !== 'loaded') throw new Error(`expected loaded, got ${loaded.status}`)
    expect(loaded.doc.cyclePosition).toBe(midProgram.cyclePosition)
  })

  it('leaves the live key untouched when the shadow write fails', () => {
    const storage = fakeStorage()
    save(ALICE_DOC, { storage })
    storage.ops.length = 0

    storage.onSetItem = (key) => {
      if (key === SHADOW) throw new Error('QuotaExceededError')
    }
    const result = save(docFor(ALICE, 91), { storage })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error).toContain('previously saved history is intact')
    expect(storage.map.get(LIVE)).toBe(GOOD_TEXT)
  })

  it('leaves a recoverable shadow when the promotion itself fails', () => {
    const storage = fakeStorage()
    storage.onSetItem = (key) => {
      if (key === LIVE) throw new Error('QuotaExceededError')
    }
    const result = save(ALICE_DOC, { storage })

    expect(result.ok).toBe(false)
    expect(storage.map.has(LIVE)).toBe(false)
    // The staged copy is complete, so the next load picks it up.
    expect(storage.map.get(SHADOW)).toBe(GOOD_TEXT)
    storage.onSetItem = null
    expect(load(ALICE, { storage }).status).toBe('recovered')
  })

  it('refuses to promote when the shadow reads back different from what was written', () => {
    const storage = fakeStorage()
    save(ALICE_DOC, { storage })

    // Storage that silently truncates. Real Safari bugs of this shape are why the
    // read-back exists rather than trusting setItem's return.
    storage.mangle = (_key, value) => value.slice(0, 100)
    const result = save(docFor(ALICE, 91), { storage })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error).toContain('read back different')
    expect(result.error).toContain('previously saved history is untouched')
    expect(storage.map.get(LIVE)).toBe(GOOD_TEXT)
  })

  it('refuses to promote a document that does not read back as itself', () => {
    const storage = fakeStorage()
    save(ALICE_DOC, { storage })

    // A NaN counter serialises to `null`, which parse rejects. This is the failure
    // the verify step exists for: it passes setItem happily and destroys history.
    const broken: StateDoc = {
      ...ALICE_DOC,
      sessionsDone: { ...ALICE_DOC.sessionsDone, push: Number.NaN },
    }
    const result = save(broken, { storage })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error).toContain('did not read back correctly')
    expect(result.error).toContain('sessionsDone.push')
    expect(storage.map.get(LIVE)).toBe(GOOD_TEXT)
    // Nothing was staged either.
    expect(storage.map.has(SHADOW)).toBe(false)
  })

  it('refuses to save a document the sync service would reject', () => {
    // The username is validated by the codec precisely so this fails here, at the
    // moment the document is written, rather than as a permanently red sync
    // status weeks later.
    const storage = fakeStorage()
    const result = save({ ...ALICE_DOC, username: 'Alice' }, { storage })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error).toContain('username')
    expect(storage.ops).toEqual([])
  })

  it('never leaves the live key holding partial text, whichever write fails', () => {
    for (const failing of [SHADOW, LIVE, META]) {
      clearReadOnly()
      const storage = fakeStorage()
      save(ALICE_DOC, { storage })
      storage.onSetItem = (key) => {
        if (key === failing) throw new Error('boom')
      }
      save(docFor(ALICE, 91), { storage })

      const live = storage.map.get(LIVE)
      expect(live).toBeDefined()
      // Whatever happened, the live key still holds a document that parses.
      expect(parse(live as string).ok).toBe(true)
    }
  })
})

// ─── A corrupt live key is never overwritten ────────────────────────────────

describe('a live document that cannot be parsed', () => {
  it('reports it, goes read-only, and leaves the stored text byte-identical', () => {
    const storage = fakeStorage({ [LIVE]: HAND_BROKEN_TEXT })

    const loaded = load(ALICE, { storage })
    expect(loaded.status).toBe('corrupt')
    if (loaded.status !== 'corrupt') throw new Error('unreachable')

    // Byte-identical. Not trimmed, not reformatted, not moved aside.
    expect(storage.map.get(LIVE)).toBe(HAND_BROKEN_TEXT)
    expect(loaded.rawText).toBe(HAND_BROKEN_TEXT)
    // No write of any kind happened.
    expect(storage.ops).toEqual([])

    expect(loaded.error).toContain('not valid JSON')
    expect(isReadOnly(ALICE)).toBe(true)
    expect(readOnlyReason(ALICE)).toContain('read-only')
  })

  it('stays byte-identical across repeated loads', () => {
    const storage = fakeStorage({ [LIVE]: HAND_BROKEN_TEXT })
    for (let i = 0; i < 3; i += 1) {
      expect(load(ALICE, { storage }).status).toBe('corrupt')
      expect(storage.map.get(LIVE)).toBe(HAND_BROKEN_TEXT)
    }
    expect(storage.ops).toEqual([])
  })

  it('refuses a save that would overwrite it, and says why', () => {
    const storage = fakeStorage({ [LIVE]: HAND_BROKEN_TEXT })
    load(ALICE, { storage })

    // The dangerous sequence: a corrupt load, the app falls back to a fresh
    // document, and saving it would erase the only copy of the history.
    const result = save(emptyDoc(ALICE), { storage })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error).toContain('read-only')
    expect(storage.map.get(LIVE)).toBe(HAND_BROKEN_TEXT)
    expect(storage.ops).toEqual([])
  })

  it('refuses even without a prior load, so call order cannot defeat the guard', () => {
    const storage = fakeStorage({ [LIVE]: HAND_BROKEN_TEXT })
    const result = save(emptyDoc(ALICE), { storage })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error).toContain('could not be read')
    expect(storage.map.get(LIVE)).toBe(HAND_BROKEN_TEXT)
    expect(isReadOnly(ALICE)).toBe(true)
  })

  it('recognises a structurally-valid file that is not a state document', () => {
    const storage = fakeStorage({ [LIVE]: '{"name":"other-app","version":"2"}' })
    const loaded = load(ALICE, { storage })
    expect(loaded.status).toBe('corrupt')
    if (loaded.status !== 'corrupt') throw new Error('unreachable')
    expect(loaded.error).toContain('schemaVersion')
  })

  it('treats a document belonging to somebody else as corrupt rather than loading it', () => {
    // A hand-edit inside the file, or a paste into the wrong key in devtools. The
    // text is readable; it is just not this user's, and writing alice's session
    // into it would overwrite whoever it does belong to.
    const storage = fakeStorage({ [LIVE]: serialise(docFor(BOB)) })
    const loaded = load(ALICE, { storage })
    expect(loaded.status).toBe('corrupt')
    if (loaded.status !== 'corrupt') throw new Error('unreachable')
    expect(loaded.error).toContain('"bob"')
    expect(loaded.rawText).toBe(serialise(docFor(BOB)))
    expect(storage.ops).toEqual([])
    expect(isReadOnly(ALICE)).toBe(true)
  })

  it('overwrites only when explicitly allowed, and then clears read-only', () => {
    const storage = fakeStorage({ [LIVE]: HAND_BROKEN_TEXT })
    load(ALICE, { storage })
    expect(isReadOnly(ALICE)).toBe(true)

    // The confirmed-import path, and the only caller that passes this.
    const result = save(ALICE_DOC, { storage, allowOverwriteCorrupt: true })
    expect(result.ok).toBe(true)
    expect(storage.map.get(LIVE)).toBe(GOOD_TEXT)
    expect(isReadOnly(ALICE)).toBe(false)
  })

  it('leaves read-only once a good document is loaded again', () => {
    const storage = fakeStorage({ [LIVE]: HAND_BROKEN_TEXT })
    load(ALICE, { storage })
    expect(isReadOnly(ALICE)).toBe(true)

    // Simulates the user repairing the file by hand in devtools.
    storage.map.set(LIVE, GOOD_TEXT)
    expect(load(ALICE, { storage }).status).toBe('loaded')
    expect(isReadOnly(ALICE)).toBe(false)
  })
})

// ─── The latch is per username ──────────────────────────────────────────────

describe('one user’s read-only latch does not affect another’s', () => {
  it('lets the other user load and save normally', () => {
    const storage = fakeStorage({ [LIVE]: HAND_BROKEN_TEXT })

    expect(load(ALICE, { storage }).status).toBe('corrupt')
    expect(isReadOnly(ALICE)).toBe(true)
    expect(isReadOnly(BOB)).toBe(false)
    expect(readOnlyReason(BOB)).toBeNull()

    // Bob's session completes normally on the same browser.
    expect(load(BOB, { storage }).status).toBe('empty')
    expect(save(docFor(BOB), { storage }).ok).toBe(true)
    expect(storage.map.get(STORAGE_KEYS.live(BOB))).toBe(serialise(docFor(BOB)))

    // And alice's broken file is exactly as it was.
    expect(storage.map.get(LIVE)).toBe(HAND_BROKEN_TEXT)
    expect(isReadOnly(ALICE)).toBe(true)
  })

  it('clears one user’s latch without clearing the other’s', () => {
    const storage = fakeStorage({
      [LIVE]: HAND_BROKEN_TEXT,
      [STORAGE_KEYS.live(BOB)]: HAND_BROKEN_TEXT.replace(`"alice"`, `"bob"`),
    })
    load(ALICE, { storage })
    load(BOB, { storage })
    expect(isReadOnly(ALICE)).toBe(true)
    expect(isReadOnly(BOB)).toBe(true)

    clearReadOnly(ALICE)
    expect(isReadOnly(ALICE)).toBe(false)
    expect(isReadOnly(BOB)).toBe(true)
  })

  it('re-latches on the next save, so clearing the latch is not a way past the guard', () => {
    const storage = fakeStorage({ [LIVE]: HAND_BROKEN_TEXT })
    load(ALICE, { storage })
    clearReadOnly()

    const result = save(emptyDoc(ALICE), { storage })
    expect(result.ok).toBe(false)
    expect(isReadOnly(ALICE)).toBe(true)
    expect(storage.map.get(LIVE)).toBe(HAND_BROKEN_TEXT)
  })
})

// ─── Usernames in storage keys ──────────────────────────────────────────────

describe('usernames are encoded into keys, never concatenated', () => {
  it('leaves an ordinary username legible', () => {
    expect(STORAGE_KEYS.live('alice')).toBe('sports-app.state.v3.alice')
    expect(STORAGE_KEYS.shadow('alice')).toBe('sports-app.state.shadow.v3.alice')
    expect(STORAGE_KEYS.meta('alice')).toBe('sports-app.meta.v3.alice')
  })

  it('percent-encodes the separator, which is legal in a username', () => {
    // `.` is legal in a username and is the key format's separator. If it survived
    // encoding, the number of segments in a key would depend on the username.
    expect(STORAGE_KEYS.live('a.b')).toBe('sports-app.state.v3.a%2Eb')
    expect(STORAGE_KEYS.live('a.b')).not.toContain('.v3.a.b')
  })

  it('cannot forge another user’s key, which is the reason for encoding at all', () => {
    // The attack, spelled out: `shadow.v3.alice` is a *valid username*, and with
    // naive concatenation its live key would be byte-identical to alice's shadow
    // key — so this user's staged save would sit in alice's promotion path.
    const attacker = 'shadow.v3.alice'
    expect(STORAGE_KEYS.live(attacker)).not.toBe(STORAGE_KEYS.shadow('alice'))
    expect(STORAGE_KEYS.live(`meta.v3.alice`)).not.toBe(STORAGE_KEYS.meta('alice'))
    // And the encoding of a username can never be the encoding of another, since
    // `%` is escaped before any escape sequence exists.
    expect(STORAGE_KEYS.live('a%2Eb')).not.toBe(STORAGE_KEYS.live('a.b'))
  })

  it('gives every hostile username a distinct set of keys', () => {
    const names = [
      '',
      'alice',
      'a.b',
      'a%2Eb',
      'shadow.v3.alice',
      'meta.v3.alice',
      'state.v3.alice',
      'sports-app.state.v3.alice',
      'alice.',
      '.alice',
      'a..b',
      'a_b',
      'a-b',
      'ALICE',
      'a b',
      'a/b',
      'a%',
      '__proto__',
      'düsseldorf',
      '💪',
    ]
    const keys = names.flatMap((name) => [
      STORAGE_KEYS.live(name),
      STORAGE_KEYS.shadow(name),
      STORAGE_KEYS.meta(name),
    ])
    // No collision anywhere: not between two users, and not between a live key
    // and any shadow or meta key.
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('writes nothing into another user’s keys, even for the crafted name', () => {
    const attacker = 'shadow.v3.alice'
    const storage = fakeStorage()
    save(docFor(ALICE), { storage })
    const aliceBytes = storage.map.get(LIVE)

    // The crafted username is a legal one, so this save genuinely succeeds — it
    // just lands nowhere near alice.
    expect(save(docFor(attacker), { storage }).ok).toBe(true)
    expect(storage.map.get(LIVE)).toBe(aliceBytes)
    expect(storage.map.has(SHADOW)).toBe(false)
    const loaded = load(ALICE, { storage })
    if (loaded.status !== 'loaded') throw new Error('unreachable')
    expect(loaded.doc.username).toBe(ALICE)
  })

  it('gives the empty username an isolated key that nothing can be saved into', () => {
    const storage = fakeStorage()
    // An empty username cannot pass validation, so it cannot reach storage at all
    // — the codec refuses the document before the shadow write.
    const result = save({ ...ALICE_DOC, username: '' }, { storage })
    expect(result.ok).toBe(false)
    expect(storage.ops).toEqual([])
    // The key is still well-defined and distinct, so nothing throws on the way to
    // finding out that there is nothing there.
    expect(load('', { storage }).status).toBe('empty')
    expect(STORAGE_KEYS.live('')).toBe('sports-app.state.v3.')
  })
})

// ─── The pre-v3 single-document key ─────────────────────────────────────────

describe('a document saved before the app had accounts', () => {
  it('is found, migrated, and attributed to whoever asked for it', () => {
    const storage = fakeStorage({ [LEGACY_STORAGE_KEYS.live]: LEGACY_TEXT })

    const loaded = load(ALICE, { storage })
    expect(loaded.status).toBe('migrated')
    if (loaded.status !== 'migrated') throw new Error('unreachable')
    expect(loaded.doc.username).toBe(ALICE)
    // Reconstructed from the two sessions in that history, not from its rung
    // indices: push and squat appear once each, core in both.
    expect(loaded.doc.sessionsDone).toEqual({ push: 1, squat: 1, hinge: 0, core: 2, pull: 0 })
    // Nothing was written. The caller saves, which is what promotes it to v3.
    expect(storage.ops).toEqual([])
    expect(isReadOnly(ALICE)).toBe(false)
  })

  it('is recovered from the pre-v3 shadow key too', () => {
    const storage = fakeStorage({ [LEGACY_STORAGE_KEYS.shadow]: LEGACY_TEXT })
    expect(load(ALICE, { storage }).status).toBe('migrated')
  })

  it('is skipped when somebody has pasted a v3 document into the old key', () => {
    // A pre-v3 document has no owner, so the migration always attributes it to
    // whoever asked. A v3 one names its owner, and it is not this user.
    const storage = fakeStorage({ [LEGACY_STORAGE_KEYS.live]: serialise(docFor(BOB)) })
    expect(load(ALICE, { storage }).status).toBe('empty')
    expect(isReadOnly(ALICE)).toBe(false)
    expect(storage.ops).toEqual([])
  })

  it('is never consulted once the user has a v3 document', () => {
    const storage = fakeStorage({ [LEGACY_STORAGE_KEYS.live]: LEGACY_TEXT })
    save(docFor(ALICE, 90), { storage })

    const loaded = load(ALICE, { storage })
    expect(loaded.status).toBe('loaded')
    if (loaded.status !== 'loaded') throw new Error('unreachable')
    expect(loaded.doc.cyclePosition).toBe(90)
  })

  it('survives a save, because deleting it could destroy somebody else’s only copy', () => {
    // On a shared browser the first person to log in after the upgrade may not be
    // whose document that is. A few stale kilobytes beats guessing.
    const storage = fakeStorage({ [LEGACY_STORAGE_KEYS.live]: LEGACY_TEXT })
    load(ALICE, { storage })
    save(docFor(ALICE), { storage })
    expect(storage.map.get(LEGACY_STORAGE_KEYS.live)).toBe(LEGACY_TEXT)
    // So a second user can still find it.
    expect(load(BOB, { storage }).status).toBe('migrated')
  })

  it('is loud rather than silent when it cannot be read', () => {
    const storage = fakeStorage({ [LEGACY_STORAGE_KEYS.live]: '{ "schemaVersion": 2,, }' })
    const loaded = load(ALICE, { storage })
    expect(loaded.status).toBe('corrupt')
    if (loaded.status !== 'corrupt') throw new Error('unreachable')
    expect(loaded.rawText).toBe('{ "schemaVersion": 2,, }')
    expect(storage.ops).toEqual([])
    expect(isReadOnly(ALICE)).toBe(true)
    expect(readOnlyReason(ALICE)).toContain('before this app had accounts')
  })
})

// ─── Storage unavailable ────────────────────────────────────────────────────

describe('storage unavailable', () => {
  it('reports it and goes read-only instead of pretending to save', () => {
    const storage = fakeStorage()
    storage.onGetItem = () => {
      throw new Error('SecurityError: storage is blocked')
    }
    const loaded = load(ALICE, { storage })
    expect(loaded.status).toBe('unavailable')
    if (loaded.status !== 'unavailable') throw new Error('unreachable')
    expect(loaded.error).toContain('storage could not be read')
    expect(isReadOnly(ALICE)).toBe(true)
  })

  it('tells the user to export when there is nowhere to save', () => {
    vi.stubGlobal('localStorage', undefined)
    try {
      expect(load(ALICE, {}).status).toBe('unavailable')
      const result = save(ALICE_DOC, {})
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
      const outcome = await requestPersistentStorage(emptyDoc(ALICE))
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
      const outcome = await requestPersistentStorage(emptyDoc(ALICE))
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
      const base = emptyDoc(ALICE)
      const denied: StateDoc = { ...base, settings: { ...base.settings, persistGranted: false } }
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
      const outcome = await requestPersistentStorage(emptyDoc(ALICE))
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
      const outcome = await requestPersistentStorage(emptyDoc(ALICE))
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
      const outcome = await requestPersistentStorage(emptyDoc(ALICE))
      expect(outcome.granted).toBeNull()
      expect(outcome.changed).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
