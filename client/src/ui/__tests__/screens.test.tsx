// @vitest-environment jsdom
//
// The screens, driven through the real router and the real store.
//
// **Scope note.** Brief 27 was split. 27a owns `/` — Today, the finish page and
// the two document states that are not a session — and rebuilt them against the
// new shell; that block below is unchanged from 27a's version. 27b owns the route
// tree, `/plan`, `/progress`, and the port of `/login` and `/account` off the old
// `app.css` vocabulary; those blocks are new or rewritten.
//
// What is NOT here any more: `timeInvariance.test.tsx` and `noDatesInUi.test.ts`,
// which enforced a rule that no longer exists (corpus/wiki/reversals.md). Both
// files were deleted rather than weakened.
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StateDoc } from '@sports-app/shared/types.ts'
import { POSTURAL_NOTICE } from '../../domain/ladders.ts'
import { prescribe, recordSession, toSessionResult } from '../../domain/schedule.ts'
import { SESSION_KEY } from '../../persistence/session.ts'
import { STORAGE_KEYS, emptyDoc } from '../../persistence/store.ts'
import { ACCENTS } from '../components/theme.ts'
import { currentUrl, renderApp, resetBrowserState, seedUser } from './harness.tsx'

const USERNAME = 'alice'
const DAY_MS = 86_400_000

/**
 * `count` real recorded sessions, so the account and progress pages have
 * something to total.
 *
 * The timestamps are a fixed sequence rather than the wall clock so these tests
 * are reproducible. Neither `/account` nor `/progress` reads them; only `/plan`'s
 * calendar reads `completedAt`, and its own fixtures below anchor to the real
 * clock instead, because the calendar renders the real current month.
 */
function trained(count: number): StateDoc {
  const anchor = Date.parse('2026-01-01T07:00:00.000Z')
  let doc = emptyDoc(USERNAME)
  for (let index = 0; index < count; index += 1) {
    const at = new Date(anchor + index * DAY_MS).toISOString()
    doc = recordSession(doc, toSessionResult(prescribe(doc, 'medium'), at))
  }
  return doc
}

/**
 * Six sessions on consecutive days, the last of them `daysAgo` days before now.
 *
 * Anchored to the real clock rather than to a fixed epoch, because the Today
 * screen reads the real clock: a streak is "consecutive days counting back from
 * today", and a fixture pinned to January 2026 would produce a streak of zero
 * forever and prove nothing.
 */
function endingDaysAgo(daysAgo: number): StateDoc {
  const sessions = 6
  const now = Date.now()
  let doc = emptyDoc(USERNAME)
  for (let index = 0; index < sessions; index += 1) {
    const at = new Date(now - (daysAgo + sessions - 1 - index) * DAY_MS).toISOString()
    doc = recordSession(doc, toSessionResult(prescribe(doc, 'medium'), at))
  }
  return doc
}

beforeEach(() => {
  cleanup()
  resetBrowserState()
  vi.unstubAllGlobals()
})

// ─── / — Today ──────────────────────────────────────────────────────────────

describe('/ — Today', () => {
  it('leads with the day, the session number and the rung it is on', async () => {
    seedUser(emptyDoc(USERNAME))
    await renderApp('/')

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Push day')
    // `Session 1 · push rung 3 of 8` — the slot's own ladder, never the daily
    // block, which would put the same two rungs under every single day.
    expect(screen.getByText(/^Session 1 · push rung \d+ of \d+$/)).toBeTruthy()
  })

  it('shows the week as a ring, three tiles and a heatmap', async () => {
    seedUser(endingDaysAgo(0))
    await renderApp('/')

    expect(screen.getByRole('img', { name: /^This week: \d+ of 7 sessions\.$/ })).toBeTruthy()
    expect(screen.getByRole('img', { name: /^Trained on \d+ of the last 42 days\.$/ })).toBeTruthy()
    expect(screen.getByText(/^\d+ sessions completed\.$/)).toBeTruthy()
    expect(screen.getByText(/^\d+ days in a row\.$/)).toBeTruthy()
    expect(screen.getByText(/reps prescribed and completed, all time\.$/)).toBeTruthy()
  })

  it('lists today’s exercises with the target as prose, and the postural notice verbatim', async () => {
    seedUser(emptyDoc(USERNAME))
    await renderApp('/')

    // Targets read as prose. `3 × 8` is rendered too, `aria-hidden`, for the eye.
    expect(screen.getByText('3 sets of 5 reps')).toBeTruthy()
    expect(screen.getByText('2 sets of a 20 second hold')).toBeTruthy()
    expect(document.body.textContent).toContain(POSTURAL_NOTICE)
  })

  it('starts a medium session from the one primary, and easier and harder are one tap each', async () => {
    seedUser(emptyDoc(USERNAME))
    const { router } = await renderApp('/')

    expect(screen.getByRole('button', { name: "Start today's session, easier" })).toBeTruthy()
    expect(screen.getByRole('button', { name: "Start today's session, harder" })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Start workout' }))
    await waitFor(() => expect(currentUrl(router)).toContain('v=medium'))
    expect(currentUrl(router)).toContain('i=0')
  })

  it('carries the four-item tab bar with Today marked as current', async () => {
    seedUser(emptyDoc(USERNAME))
    await renderApp('/')

    const bar = screen.getByRole('navigation', { name: 'Sections' })
    expect(bar.textContent).toBe('TodayPlanProgressYou')
    expect(bar.querySelectorAll('[aria-current="page"]')).toHaveLength(1)
    expect(bar.querySelector('[aria-current="page"]')?.textContent).toBe('Today')
  })

  it('has no tab bar in the player — a session is a mode, not a destination', async () => {
    seedUser(emptyDoc(USERNAME))
    await renderApp('/?v=medium&i=0&d=0')
    expect(screen.queryByRole('navigation', { name: 'Sections' })).toBeNull()
  })

  /**
   * The mechanical statement of "icons are drawn".
   *
   * The streak pill is the exact place an emoji creeps in, and it is one
   * keystroke away at all times. `Extended_Pictographic` covers the emoji block
   * including the text-presentation forms, so a bare `▶` or `⚠` fails this too —
   * which is the point: the family in `icons.tsx` is the only source of
   * iconography in this app.
   */
  /**
   * The plan outranks the history block, and this is the mechanical statement
   * of a decision the phone pass forced.
   *
   * Today shipped as ring, tiles, heatmap, then the plan, on the argument that
   * the primary is a fixed-position button so a training user never has to read
   * any of it. Driven on a 402x874 phone that gave 331px below the fold and a
   * first paint showing one of three exercises. The button being reachable is
   * not the session being knowable, and this app's first principle is that it
   * arrives with the answer already made.
   *
   * Asserted by document order rather than by pixels, because a fold test would
   * bind the assertion to one viewport and this rule holds at every width.
   */
  it('puts today’s plan above the history block', async () => {
    seedUser(endingDaysAgo(0))
    await renderApp('/')

    const headings = [...document.querySelectorAll('h2')].map((h) => h.textContent)
    expect(headings).toContain('Today')
    expect(headings).toContain('How it is going')
    expect(headings.indexOf('Today')).toBeLessThan(headings.indexOf('How it is going'))

    const plan = document.querySelector('h2')
    const ring = screen.getByRole('img', { name: /This week: \d+ of \d+ sessions\./ })
    expect(plan?.textContent).toBe('Today')
    expect(plan?.compareDocumentPosition(ring) ?? 0 & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('renders no emoji anywhere, including the streak pill', async () => {
    seedUser(endingDaysAgo(0))
    await renderApp('/')
    expect(document.body.textContent ?? '').not.toMatch(/\p{Extended_Pictographic}/u)
  })

  it('prescribes exactly the same session after a fortnight away as after a night’s sleep', async () => {
    // The half of the no-dates decision that SURVIVED its reversal: the rotation
    // advances on training and never on the calendar, so the gap changes what the
    // screen says about you and nothing about what it asks you to do.
    async function read(daysAgo: number) {
      resetBrowserState()
      seedUser(endingDaysAgo(daysAgo))
      await renderApp('/')
      const title = screen.getByRole('heading', { level: 1 }).textContent
      const summary = screen.getByText(/^Session \d+ · /).textContent
      const targets = Array.from(document.querySelectorAll('.sr-only'))
        .map((node) => node.textContent ?? '')
        .filter((text) => / sets? of /.test(text))
      const streak = screen.getByText(/^\d+ days in a row\.$/).textContent
      cleanup()
      return { title, summary, targets, streak }
    }

    const fresh = await read(0)
    const lapsed = await read(14)

    expect(fresh.targets.length).toBeGreaterThan(0)
    expect(lapsed.title).toBe(fresh.title)
    expect(lapsed.summary).toBe(fresh.summary)
    expect(lapsed.targets).toEqual(fresh.targets)
    // And the fixtures really do differ, so the equalities above are not vacuous.
    expect(lapsed.streak).not.toBe(fresh.streak)
    expect(lapsed.streak).toBe('0 days in a row.')
  })
})

// ─── /login ─────────────────────────────────────────────────────────────────

describe('/login', () => {
  /*
   * This block asserted a screen that no longer exists. It had a username
   * field, a password field that was never read, and two sentences admitting
   * that anyone who knew a username could open that person's training history.
   *
   * The honesty was the right response to the old design. Ward authenticates a
   * person now and the service keys each document on their subject, so there is
   * no name for a stranger to guess and nothing true left for that copy to say.
   * `/login` is a hand-off to Ward.
   */

  it('is where a browser with nobody logged in ends up', async () => {
    const { router } = await renderApp('/')
    expect(currentUrl(router)).toBe('/login')
  })

  it('has no tab bar — it is not one of the four destinations', async () => {
    await renderApp('/login')
    expect(screen.queryByRole('navigation', { name: 'Sections' })).toBeNull()
  })

  /**
   * The screen takes no credential, and cannot.
   *
   * Asserted as an absence rather than left implicit: a password field here
   * would be the exact dishonesty the old copy was written to avoid — a box
   * that looks like a sign-in, on a page that has no way to check one.
   */
  it('offers no username or password field — the credential is Ward\'s', async () => {
    await renderApp('/login')
    expect(screen.queryByLabelText('Username')).toBeNull()
    expect(screen.queryByLabelText('Password')).toBeNull()
    expect(document.body.textContent).not.toContain('The password is not checked.')
  })

  it('hands off to Ward, carrying where to come back to', async () => {
    await renderApp('/login')
    const link = screen.getByRole('link', { name: 'Continue' })
    const href = link.getAttribute('href') ?? ''

    expect(href.startsWith('/ward/login?next=')).toBe(true)
    // A path, never an absolute URL: Ward validates `next` against the estate's
    // own path roots and refuses anything absolute.
    expect(decodeURIComponent(href.split('next=')[1] ?? '').startsWith('/')).toBe(true)
    expect(href).not.toContain('http')
  })

  /**
   * Signing in needs the network now, because it needs Ward — and that is not
   * the regression it looks like. The property that mattered was that the
   * **app** opens offline for somebody already signed in, which it still does:
   * `session.ts` reads the cached name synchronously and nothing on the
   * session-critical path awaits anything.
   */
  it('still lets an established session open the app with fetch throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('offline')
      }),
    )

    seedUser(trained(0))
    const { router } = await renderApp('/')

    await waitFor(() => expect(currentUrl(router)).toBe('/'))
    expect(screen.getByRole('button', { name: 'Start workout' })).toBeTruthy()
  })
})


// ─── /plan ──────────────────────────────────────────────────────────────────

describe('/plan', () => {
  it('carries the four-item tab bar with Plan marked as current', async () => {
    seedUser(trained(4))
    await renderApp('/plan')

    const bar = screen.getByRole('navigation', { name: 'Sections' })
    expect(bar.querySelector('[aria-current="page"]')?.textContent).toBe('Plan')
  })

  it('renders a calendar with exactly one day marked as today', async () => {
    seedUser(trained(4))
    await renderApp('/plan')

    expect(document.querySelector('table')).toBeTruthy()
    // Exactly one cell's accessible name says "today" — the sr-only label on the
    // calendar cell, not the visible digit, which carries no such word.
    expect(screen.getAllByText(/today/).length).toBe(1)
  })

  it('shows seven sessions in rotation order, numbered by session and not by day', async () => {
    seedUser(trained(4))
    await renderApp('/plan')

    // The top-level `<ol>` is "Coming up"; each session's own exercises sit in a
    // nested `<ul>`, so `ol > li` reaches exactly the seven session cards.
    const cards = document.querySelectorAll('ol > li')
    expect(cards).toHaveLength(7)

    // Four sessions done, so the next is session 5, and position 4 of the
    // rotation is Legs. Cardio always follows Legs and never precedes it.
    expect(Array.from(cards).map((card) => card.querySelector('h3')?.textContent)).toEqual([
      'Legs',
      'Cardio',
      'Push',
      'Legs',
      'Cardio',
      'Push',
      'Legs',
    ])

    expect(screen.getByText(/Session 5/)).toBeTruthy()
    expect(screen.getByText('Session 11')).toBeTruthy()
  })

  it('surfaces POSTURAL_NOTICE, since every one of the seven contains the pull exercise', async () => {
    seedUser(trained(1))
    await renderApp('/plan')
    expect(document.body.textContent).toContain(POSTURAL_NOTICE)
  })

  it('leaves the stored document completely untouched by the projection', async () => {
    const doc = trained(3)
    seedUser(doc)
    const before = localStorage.getItem(STORAGE_KEYS.live(USERNAME))
    await renderApp('/plan')
    expect(localStorage.getItem(STORAGE_KEYS.live(USERNAME))).toBe(before)
  })

  it('carries the honest note about what a missed day costs', async () => {
    seedUser(emptyDoc(USERNAME))
    await renderApp('/plan')

    // The argument is invariant; the day name inside it is not — it depends on
    // which day of the current real month happens to be the most recent one with
    // no session, which is why this asserts the load-bearing half rather than a
    // specific weekday.
    expect(document.body.textContent).toContain(
      'The rotation moves when you train, not when the calendar does',
    )
    expect(document.body.textContent).toContain('is marked because you asked to see it')
    expect(document.body.textContent).toContain('the next session is still the next session')
  })
})

// ─── /progress ──────────────────────────────────────────────────────────────

describe('/progress', () => {
  it('carries the four-item tab bar with Progress marked as current', async () => {
    seedUser(trained(20))
    await renderApp('/progress')

    const bar = screen.getByRole('navigation', { name: 'Sections' })
    expect(bar.querySelector('[aria-current="page"]')?.textContent).toBe('Progress')
  })

  it('draws the push-target chart as one labelled image, with tiles above it', async () => {
    seedUser(trained(20))
    await renderApp('/progress')

    expect(screen.getByRole('img', { name: /push rep target/i })).toBeTruthy()
    expect(document.querySelector('polyline')).toBeTruthy()
    expect(screen.getByText(/^\d+ sessions completed\.$/)).toBeTruthy()
    expect(screen.getByText(/^\d+ milestones reached\.$/)).toBeTruthy()
    expect(screen.getByText(/^\d+ ladders reached their top rung\.$/)).toBeTruthy()
  })

  it('carries the honest note that the chart is the schedule, not a measurement', async () => {
    seedUser(trained(20))
    await renderApp('/progress')

    expect(document.body.textContent).toContain(
      'The app prescribes on a fixed six-week clock and never adapts to what you log',
    )
    expect(document.body.textContent).toContain('this line was knowable on day one')
  })

  it('lists milestones newest first, keyed by session number', async () => {
    seedUser(trained(130))
    await renderApp('/progress')

    const ordinals = Array.from(document.querySelectorAll('[data-testid="milestone-ordinal"]')).map(
      (node) => Number((node.textContent ?? '').replace('Session ', '')),
    )
    expect(ordinals.length).toBeGreaterThan(1)
    for (let index = 1; index < ordinals.length; index += 1) {
      expect(ordinals[index - 1] ?? 0).toBeGreaterThanOrEqual(ordinals[index] ?? 0)
    }
  })

  it('teaches the empty state rather than showing an empty list', async () => {
    seedUser(emptyDoc(USERNAME))
    await renderApp('/progress')
    expect(document.body.textContent).toContain('Nothing yet')
    expect(document.querySelectorAll('[data-testid="milestone"]')).toHaveLength(0)
  })
})

// ─── /account ───────────────────────────────────────────────────────────────

describe('/account', () => {
  /**
   * The appearance controls, which are the only two settings in the app.
   *
   * They are asserted through the DOM stamp rather than through
   * `localStorage`, because the stamp is what the sixteen palettes in
   * `tokens.css` actually key off. A preference that persists and is never
   * applied is the exact shape this control shipped in before 2026-09-04:
   * `theme.ts` was complete, tested-adjacent, and imported by nothing, so every
   * accent but mint was unreachable while `contrast.test.ts` went on proving all
   * sixteen were legible. Legible and reachable are different claims.
   */
  it('stamps the chosen theme on the root, and clears it for System', async () => {
    seedUser(trained(2))
    await renderApp('/account')

    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')

    fireEvent.click(screen.getByRole('radio', { name: 'Light' }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')

    // Removed, not set to 'light': absent is what keeps the page following the
    // OS when the OS changes at sunset, and a written 'light' would look
    // identical today and quietly stop tracking.
    fireEvent.click(screen.getByRole('radio', { name: 'System' }))
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('stamps a chosen accent, and stores mint as the absence of one', async () => {
    seedUser(trained(2))
    await renderApp('/account')

    fireEvent.click(screen.getByRole('radio', { name: 'violet' }))
    expect(document.documentElement.getAttribute('data-accent')).toBe('violet')
    expect(localStorage.getItem('sports-app.accent')).toBe('violet')

    // Mint is what an unstamped root already resolves to, so "I never chose"
    // and "I chose the default" are deliberately the same state.
    fireEvent.click(screen.getByRole('radio', { name: 'mint' }))
    expect(document.documentElement.hasAttribute('data-accent')).toBe(false)
    expect(localStorage.getItem('sports-app.accent')).toBeNull()
  })

  it('offers every accent the palette declares, so none is unreachable', async () => {
    seedUser(trained(2))
    await renderApp('/account')

    const group = screen.getByRole('radiogroup', { name: 'Accent colour' })
    const names = Array.from(group.querySelectorAll('[role="radio"]')).map(
      (node) => node.textContent,
    )
    expect(names).toEqual([...ACCENTS])
  })

  it('carries the four-item tab bar with You marked as current', async () => {
    seedUser(trained(2))
    await renderApp('/account')

    const bar = screen.getByRole('navigation', { name: 'Sections' })
    expect(bar.querySelector('[aria-current="page"]')?.textContent).toBe('You')
  })

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

  it('has no chart of its own — the schedule’s shape is `/progress`’s to plot', async () => {
    seedUser(trained(60))
    await renderApp('/account')
    expect(document.querySelector('polyline')).toBeNull()
    expect(screen.queryByRole('img', { name: /push rep target/i })).toBeNull()
  })

  it('lists milestones newest first, keyed by session number', async () => {
    seedUser(trained(130))
    await renderApp('/account')

    const ordinals = Array.from(document.querySelectorAll('[data-testid="milestone-ordinal"]')).map(
      (node) => Number((node.textContent ?? '').replace('Session ', '')),
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
    expect(document.querySelectorAll('[data-testid="milestone"]')).toHaveLength(0)
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

describe('/library', () => {
  it('loads the reference lazily and filters it', async () => {
    seedUser(trained(2))
    await renderApp('/library')

    // Lazily imported: the ~190KB chunk is not in the critical path of the one
    // screen that has to paint fast, so the list arrives after a tick.
    const search = await screen.findByRole('searchbox', { name: /search the exercise reference/i })
    expect(await screen.findByText(/186 bodyweight exercises/)).toBeTruthy()

    fireEvent.change(search, { target: { value: 'plank' } })
    await waitFor(() => {
      expect(screen.getByRole('status', { name: '' }).textContent).toMatch(/of 186$/)
    })
  })

  it('does not repeat a muscle listed in both lists', async () => {
    seedUser(trained(2))
    await renderApp('/library')
    await screen.findByRole('searchbox', { name: /search the exercise reference/i })

    // free-exercise-db keeps its two muscle lists disjoint far more reliably
    // than the previous source, so this now guards a bug that shipped once
    // rather than one visible in the current data. Kept deliberately: the
    // dedupe costs nothing and a future re-import is exactly when it returns.
    // The list capitalises with CSS, so the text content is the record's own
    // casing — a screenshot cannot tell the two apart.
    const row = screen.getByText('Clock Push-Up').closest('details')
    expect(row).not.toBeNull()
    const listed = (row!.querySelector('[data-testid="muscles"]')?.textContent ?? '')
      .split('·')
      .map((muscle) => muscle.trim().toLowerCase())
      .filter((muscle) => muscle.length > 0)

    expect(listed.length).toBeGreaterThan(1)
    expect(new Set(listed).size).toBe(listed.length)
  })

  it('says plainly that nothing in it is scheduled', async () => {
    seedUser(trained(2))
    await renderApp('/library')
    expect(screen.getByTestId('honest-note').textContent).toMatch(/A reference, not a plan/)
  })

  /**
   * The reference is reachable from Account and NOT from the tab bar. That is
   * the design: this app's thesis is that there is nothing to browse on the way
   * to a set, and a fifth tab would make browsing a primary destination.
   */
  it('is not a tab bar destination', async () => {
    seedUser(trained(2))
    await renderApp('/account')

    const bar = screen.getByRole('navigation', { name: 'Sections' })
    expect(bar.textContent).not.toMatch(/reference|library/i)
    expect(screen.getByRole('link', { name: 'Open the reference' })).toBeTruthy()
  })
})

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
    expect(screen.queryByRole('button', { name: 'Start workout' })).toBeNull()
    // And nothing was written over it.
    expect(localStorage.getItem(STORAGE_KEYS.live(USERNAME))).toBe('{ this is not a document')
  })
})

describe('the first ever run', () => {
  it('creates and saves an empty document with no ceremony', async () => {
    localStorage.setItem(SESSION_KEY, USERNAME)
    await renderApp('/')

    expect(screen.getByText(/^Session 1 · /)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start workout' })).toBeTruthy()
    expect(localStorage.getItem(STORAGE_KEYS.live(USERNAME))).toContain('"username": "alice"')
  })
})
