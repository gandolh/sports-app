// @vitest-environment jsdom
//
// `/login`, `/week`, `/account`, and the two document states that are not a
// session.
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StateDoc } from '@sports-app/shared/types.ts'
import { prescribe, recordSession, toSessionResult } from '../../domain/schedule.ts'
import { SESSION_KEY, currentUsername } from '../../persistence/session.ts'
import { STORAGE_KEYS, emptyDoc } from '../../persistence/store.ts'
import { currentUrl, renderApp, resetBrowserState, seedUser } from './harness.tsx'

const USERNAME = 'alice'

/**
 * `count` real recorded sessions, so the account page has something to total.
 *
 * The timestamps are ISO because the codec validates them on the way back in —
 * and they are a fixed sequence rather than the wall clock so these tests are
 * reproducible. Nothing in `client/src/ui/` reads them; that is the subject of
 * `timeInvariance.test.tsx`.
 */
function trained(count: number): StateDoc {
  const anchor = Date.parse('2026-01-01T07:00:00.000Z')
  let doc = emptyDoc(USERNAME)
  for (let index = 0; index < count; index += 1) {
    const at = new Date(anchor + index * 86_400_000).toISOString()
    doc = recordSession(doc, toSessionResult(prescribe(doc, 'medium'), at))
  }
  return doc
}

beforeEach(() => {
  cleanup()
  resetBrowserState()
  vi.unstubAllGlobals()
})

// ─── /login ─────────────────────────────────────────────────────────────────

describe('/login', () => {
  it('is where a browser with nobody logged in ends up', async () => {
    const { router } = await renderApp('/')
    expect(currentUrl(router)).toBe('/login')
  })

  it('states plainly that the password is not checked', async () => {
    await renderApp('/login')
    expect(document.body.textContent).toContain('The password is not checked.')
    expect(document.body.textContent).toContain(
      'anyone who knows a username can open that username’s training history',
    )
  })

  it('works with no network at all — there is nothing to verify', async () => {
    // Every path out of this screen would have to go through `fetch`, so making
    // it throw is the strongest available statement of "offline".
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('offline')
      }),
    )

    const { router } = await renderApp('/login')
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: USERNAME } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'anything at all' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => expect(currentUrl(router)).toBe('/'))
    expect(currentUsername()).toBe(USERNAME)
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy()
  })

  it('shows the store’s own rejection message verbatim, and does not log anybody in', async () => {
    await renderApp('/login')
    // Uppercase is rejected rather than folded: two people must not end up
    // sharing one document while believing they have separate accounts.
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'Alice' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    const error = await screen.findByText(/That username will not work/)
    expect(error.textContent).toContain('starting with a lowercase letter or a digit')
    expect(currentUsername()).toBeNull()
  })
})

// ─── /week ──────────────────────────────────────────────────────────────────

describe('/week', () => {
  it('shows seven sessions in rotation order, numbered by session and not by day', async () => {
    seedUser(trained(4))
    await renderApp('/week')

    const cells = document.querySelectorAll('.week__cell')
    expect(cells).toHaveLength(7)

    // Four sessions done, so the next is session 5, and position 4 of the
    // rotation is Legs. Cardio always follows Legs and never precedes it.
    expect(
      Array.from(cells).map((cell) => cell.querySelector('.week__label')?.textContent),
    ).toEqual(['Legs', 'Cardio', 'Push', 'Legs', 'Cardio', 'Push', 'Legs'])

    expect(screen.getByText(/Session 5/)).toBeTruthy()
    expect(screen.getByText('Session 11')).toBeTruthy()
  })

  it('surfaces POSTURAL_NOTICE, since every one of the seven contains the pull exercise', async () => {
    seedUser(trained(1))
    await renderApp('/week')
    expect(document.body.textContent).toContain('Postural work, not pulling strength.')
  })

  it('leaves the stored document completely untouched by the projection', async () => {
    const doc = trained(3)
    seedUser(doc)
    const before = localStorage.getItem(STORAGE_KEYS.live(USERNAME))
    await renderApp('/week')
    expect(localStorage.getItem(STORAGE_KEYS.live(USERNAME))).toBe(before)
  })
})

// ─── /account ───────────────────────────────────────────────────────────────

describe('/account', () => {
  it('shows the username, the session count and total work ever', async () => {
    seedUser(trained(9))
    await renderApp('/account')

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(USERNAME)
    expect(screen.getByText('9')).toBeTruthy()
    expect(screen.getByText('sessions completed')).toBeTruthy()
    expect(screen.getByText('Total work ever')).toBeTruthy()
    expect(screen.getByText('Time held')).toBeTruthy()
    // The pull row is labelled as posture, never as a pull total.
    expect(screen.getByText('Posture (pull)')).toBeTruthy()
  })

  it('has no chart, because a fixed schedule plotted against session number is a straight line', async () => {
    seedUser(trained(60))
    await renderApp('/account')
    expect(document.querySelectorAll('svg')).toHaveLength(0)
    expect(document.querySelectorAll('canvas')).toHaveLength(0)
  })

  it('lists milestones newest first, keyed by session number', async () => {
    seedUser(trained(130))
    await renderApp('/account')

    const ordinals = Array.from(document.querySelectorAll('.milestone__ordinal')).map((node) =>
      Number((node.textContent ?? '').replace('Session ', '')),
    )
    expect(ordinals.length).toBeGreaterThan(1)
    for (let index = 1; index < ordinals.length; index += 1) {
      expect(ordinals[index - 1] ?? 0).toBeGreaterThanOrEqual(ordinals[index] ?? 0)
    }
  })

  it('teaches the empty state rather than showing an empty list', async () => {
    seedUser(emptyDoc(USERNAME))
    await renderApp('/account')
    expect(document.body.textContent).toContain('Nothing yet')
    expect(document.querySelectorAll('.milestone')).toHaveLength(0)
  })

  it('says without hedging that a pattern at its top rung has finished the ladder', async () => {
    const base = trained(3)
    seedUser({ ...base, sessionsDone: { ...base.sessionsDone, push: 84 } })
    await renderApp('/account')

    expect(screen.getByText('Ladders finished')).toBeTruthy()
    const text = document.body.textContent ?? ''
    expect(text).toContain('Push has reached the top of its ladder — Archer push-up.')
    expect(text).toContain('the target now cycles between 5 and 12 reps and keeps cycling')
    expect(text).toContain('reaching it is a finish')
  })

  it('logging out forgets the username and keeps every document where it was', async () => {
    seedUser(trained(2))
    const stored = localStorage.getItem(STORAGE_KEYS.live(USERNAME))
    const { router } = await renderApp('/account')

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))

    await waitFor(() => expect(currentUrl(router)).toBe('/login'))
    expect(localStorage.getItem(SESSION_KEY)).toBeNull()
    expect(localStorage.getItem(STORAGE_KEYS.live(USERNAME))).toBe(stored)
  })
})

// ─── The document states that are not a session ─────────────────────────────

describe('an unreadable document', () => {
  it('is reported, not silently replaced with a fresh one', async () => {
    localStorage.setItem(SESSION_KEY, USERNAME)
    localStorage.setItem(STORAGE_KEYS.live(USERNAME), '{ this is not a document')

    await renderApp('/')

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'The saved training history could not be read.',
    )
    expect(screen.getByRole('alert').textContent).toContain('read-only')
    // No training path: a fresh document here would look exactly like months of
    // work having never happened.
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull()
    // And nothing was written over it.
    expect(localStorage.getItem(STORAGE_KEYS.live(USERNAME))).toBe('{ this is not a document')
  })
})

describe('the first ever run', () => {
  it('creates and saves an empty document with no ceremony', async () => {
    localStorage.setItem(SESSION_KEY, USERNAME)
    await renderApp('/')

    expect(screen.getByText('Session 1')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy()
    expect(localStorage.getItem(STORAGE_KEYS.live(USERNAME))).toContain('"username": "alice"')
  })
})
