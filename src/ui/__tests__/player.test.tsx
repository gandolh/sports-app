// @vitest-environment jsdom
//
// The player's behaviour, driven through the real router and the real store.
//
// The first test in this file is the most important behavioural test in the
// project: **Next is never gated**. Everything else here protects a content
// requirement that exists for a safety reason.
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { POSTURAL_NOTICE } from '../../domain/ladders.ts'
import type { Pattern, StateDoc } from '../../domain/types.ts'
import { parse } from '../../persistence/codec.ts'
import { STORAGE_KEYS, emptyDoc } from '../../persistence/store.ts'
import { currentUrl, renderApp, resetBrowserState, seedUser } from './harness.tsx'

const USERNAME = 'alice'

/** A document with specific per-pattern counters, so a test can reach any rung. */
function docWith(sessionsDone: Partial<Record<Pattern, number>> = {}): StateDoc {
  const base = emptyDoc(USERNAME)
  return { ...base, sessionsDone: { ...base.sessionsDone, ...sessionsDone } }
}

function withCyclePosition(doc: StateDoc, cyclePosition: number): StateDoc {
  return { ...doc, cyclePosition }
}

function nextButton(): HTMLButtonElement {
  return screen.getByTestId('next') as HTMLButtonElement
}

/** Asserts the button is live by every mechanism that could take it away. */
function expectLive(button: HTMLButtonElement): void {
  expect(button.disabled).toBe(false)
  expect(button.hasAttribute('disabled')).toBe(false)
  expect(button.getAttribute('aria-disabled')).toBeNull()
  expect(getComputedStyle(button).pointerEvents).not.toBe('none')
}

type Router = Awaited<ReturnType<typeof renderApp>>['router']

/** One tap of Next, settled. The URL moving is what "it worked" means here. */
async function tapNext(router: Router): Promise<void> {
  const before = currentUrl(router)
  fireEvent.click(nextButton())
  await waitFor(() => expect(currentUrl(router)).not.toBe(before))
}

beforeEach(() => {
  cleanup()
  resetBrowserState()
})

// ─────────────────────────────────────────────────────────────────────────────

describe('Next is never gated', () => {
  it('is live before the countdown is started, while it runs, and after it is abandoned', async () => {
    // Item 1 of the Push slot is the daily front plank: a timed exercise, which
    // is the only kind that has a countdown to gate on in the first place.
    seedUser(docWith())
    await renderApp(`/?v=medium&i=1&d=0`)

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Front plank')

    // Before.
    expectLive(nextButton())

    // While running.
    fireEvent.click(screen.getByRole('button', { name: /^Start \d+s$/ }))
    expect(screen.getByRole('button', { name: 'Stop the clock' })).toBeTruthy()
    expectLive(nextButton())

    // Abandoned.
    fireEvent.click(screen.getByRole('button', { name: 'Stop the clock' }))
    expect(screen.getByRole('button', { name: /^Start \d+s$/ }))
    expectLive(nextButton())
  })

  it('actually advances when tapped mid-countdown, not merely looks enabled', async () => {
    seedUser(docWith())
    const { router } = await renderApp(`/?v=medium&i=1&d=0`)
    fireEvent.click(screen.getByRole('button', { name: /^Start \d+s$/ }))
    await tapNext(router)
    expect(currentUrl(router)).toContain('d=1')
  })

  it('has no countdown at all on a rep exercise', async () => {
    seedUser(docWith())
    await renderApp(`/?v=medium&i=0&d=0`)
    expect(screen.queryByRole('timer')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Start/ })).toBeNull()
    expectLive(nextButton())
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('a safetyCritical rung', () => {
  // push-09-archer sits at rung index 8; the push ladder starts at index 2 and
  // takes 14 sessions per rung, so 84 sessions of push lands exactly on it.
  const AT_ARCHER = 84

  it('renders its first cue in a separate element from the remaining cues', async () => {
    seedUser(docWith({ push: AT_ARCHER }))
    await renderApp(`/?v=medium&i=0&d=0`)

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Archer push-up')

    const safety = screen.getByTestId('safety-cue')
    const list = screen.getByTestId('cue-list')

    expect(safety).not.toBe(list)
    expect(safety.contains(list)).toBe(false)
    expect(list.contains(safety)).toBe(false)

    expect(safety.textContent).toContain('Safety check first:')
    // The whole point: it is not also item one of four in the list.
    expect(list.textContent).not.toContain('Safety check first:')
    expect(list.querySelectorAll('li')).toHaveLength(3)

    // And it renders *first*, which is what makes it readable without scrolling
    // on a phone: ahead of the target numeral as well as of the other cues.
    const order = (before: Element, after: Element): boolean =>
      (before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

    const movement = screen.getByText('Archer push-up').closest('.movement')
    const hero = document.querySelector('.hero')
    expect(movement).not.toBeNull()
    expect(hero).not.toBeNull()

    expect(order(movement as Element, safety)).toBe(true)
    expect(order(safety, hero as Element)).toBe(true)
    expect(order(safety, list)).toBe(true)
  })

  it('is the only case that gets a separate block — an ordinary rung has none', async () => {
    seedUser(docWith())
    await renderApp(`/?v=medium&i=0&d=0`)
    expect(screen.queryByTestId('safety-cue')).toBeNull()
    expect(screen.getByTestId('cue-list').querySelectorAll('li')).toHaveLength(4)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('POSTURAL_NOTICE', () => {
  it('appears verbatim on the pull exercise page', async () => {
    seedUser(docWith())
    // The daily block is core then pull, so item 2 of the Push slot is the pull.
    await renderApp(`/?v=medium&i=2&d=0`)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Prone T raise')
    expect(document.body.textContent).toContain(POSTURAL_NOTICE)
  })

  it('appears verbatim on the home screen, where the pull exercise is listed', async () => {
    seedUser(docWith())
    await renderApp('/')
    expect(document.body.textContent).toContain(POSTURAL_NOTICE)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('the position lives in the URL', () => {
  it('resumes on the same exercise after a reload', async () => {
    seedUser(docWith())
    const first = await renderApp(`/?v=medium&i=0&d=0`)

    // Three taps clears the push exercise's three sets and lands on the plank.
    await tapNext(first.router)
    await tapNext(first.router)
    await tapNext(first.router)

    const url = currentUrl(first.router)
    expect(url).toContain('i=1')
    const heading = screen.getByRole('heading', { level: 1 }).textContent
    const rail = screen.getByText('Push · 2 of 3').textContent

    // A reload is a brand-new router, a brand-new query cache and a brand-new
    // React tree at the same URL. Nothing survives except the URL and storage.
    cleanup()
    await renderApp(url)

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(heading)
    expect(screen.getByText('Push · 2 of 3').textContent).toBe(rail)
  })

  it('clamps a position that no longer exists rather than breaking the screen', async () => {
    seedUser(docWith())
    await renderApp(`/?v=medium&i=99&d=99`)
    // The Push slot's last item is the pull exercise; the last dot of it.
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Prone T raise')
    expectLive(nextButton())
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('the variant is a load dial, never a signal', () => {
  /** Plays a whole Push session — 3 push sets, 2 core, 2 pull — and reads back what was stored. */
  async function playFullSession(variant: string): Promise<StateDoc> {
    resetBrowserState()
    // Four sessions into the push rung, so medium's target is mid-range and
    // `easy` has somewhere to go. At the bottom of a rung easy and medium are the
    // same number, which would make the comparison below prove nothing.
    seedUser(docWith({ push: 4 }))
    const { router } = await renderApp(`/?v=${variant}&i=0&d=0`)
    for (let tap = 0; tap < 7; tap += 1) await tapNext(router)
    await screen.findByText('Session complete.')

    const text = localStorage.getItem(STORAGE_KEYS.live(USERNAME))
    cleanup()
    const stored = parse(text ?? '', { username: USERNAME })
    if (!stored.ok) throw new Error(stored.error)
    return stored.doc
  }

  it('advances sessionsDone exactly as medium would when easy is chosen', async () => {
    const easy = await playFullSession('easy')
    const medium = await playFullSession('medium')

    expect(easy.sessionsDone).toEqual(medium.sessionsDone)
    expect(easy.cyclePosition).toBe(medium.cyclePosition)
    expect(easy.history).toHaveLength(1)
    expect(medium.history).toHaveLength(1)

    // The equality above must not be vacuous: the variant has to have actually
    // changed today's numbers, and to have been recorded as the pick it was.
    expect(easy.history[0]?.variant).toBe('easy')
    expect(medium.history[0]?.variant).toBe('medium')
    const easyTarget = easy.history[0]?.exercises[0]?.targetValue ?? 0
    const mediumTarget = medium.history[0]?.exercises[0]?.targetValue ?? 0
    expect(easyTarget).toBeLessThan(mediumTarget)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('the cardio slot', () => {
  it('is one page with five rounds and a sixty-second clock', async () => {
    // Position 2 of the rotation is Cardio, which always follows Legs.
    seedUser(withCyclePosition(docWith(), 2))
    await renderApp(`/?v=medium&i=0&d=0`)

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Cardio')
    expect(screen.getByRole('img', { name: '0 of 5 rounds marked' })).toBeTruthy()
    expect(screen.getByRole('timer', { name: '60 second hard round' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start 60s' })).toBeTruthy()
    expectLive(nextButton())
  })

  it('records no exercise of its own, only the daily block', async () => {
    seedUser(withCyclePosition(docWith(), 2))
    const { router } = await renderApp(`/?v=medium&i=0&d=0`)
    // 5 cardio rounds, then 2 core, then 2 pull.
    for (let tap = 0; tap < 9; tap += 1) await tapNext(router)
    await screen.findByText('Session complete.')

    const stored = parse(localStorage.getItem(STORAGE_KEYS.live(USERNAME)) ?? '', {
      username: USERNAME,
    })
    if (!stored.ok) throw new Error(stored.error)
    expect(stored.doc.history[0]?.exercises.map((e) => e.pattern)).toEqual(['core', 'pull'])
  })
})
