// @vitest-environment jsdom
//
// The player's behaviour, driven through the real router and the real store.
//
// The first test in this file is the most important behavioural test in the
// project: **Next is never gated** — not by the countdown, and since the v4
// logging reversal, not by the log either. Everything else here protects a
// content or safety requirement that has a reason written next to it in the
// component.
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { POSTURAL_NOTICE, getRung } from '../../domain/ladders.ts'
import type { Pattern, StateDoc } from '@sports-app/shared/types.ts'
import { prescribe, recordSession, toSessionResult } from '../../domain/schedule.ts'
import { parse } from '../../persistence/codec.ts'
import { STORAGE_KEYS, emptyDoc } from '../../persistence/store.ts'
import { currentUrl, renderApp, resetBrowserState, seedUser } from './harness.tsx'

const USERNAME = 'alice'

/** A document with specific per-pattern counters, so a test can reach any rung. */
function docWith(sessionsDone: Partial<Record<Pattern, number>> = {}): StateDoc {
  const base = emptyDoc(USERNAME)
  return { ...base, sessionsDone: { ...base.sessionsDone, ...sessionsDone } }
}

/**
 * A document carrying one real recorded session, so `Comparison` has a previous
 * record to show. It returns null when the pattern has never been recorded,
 * which is why `docWith()` alone is not enough for an ordering assertion that
 * involves it.
 */
function docWithHistory(): StateDoc {
  const base = docWith()
  const result = toSessionResult(prescribe(base, 'medium'), '2026-09-01T07:00:00.000Z')
  // Recording advances the rotation, so pin it back to the same slot: the point
  // is a session whose pattern HAS a previous record, and Legs day's would not.
  return withCyclePosition(recordSession(base, result), base.cyclePosition)
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

/** `a` comes before `b` in document order. */
function precedes(a: Element, b: Element): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
}

/** The document as the codec will read it back, which is the only proof that counts. */
function storedDoc(): StateDoc {
  const stored = parse(localStorage.getItem(STORAGE_KEYS.live(USERNAME)) ?? '', {
    username: USERNAME,
  })
  if (!stored.ok) throw new Error(stored.error)
  return stored.doc
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

describe('the stop rule', () => {
  it('renders above the cue list, and not inside it', async () => {
    seedUser(docWith())
    await renderApp(`/?v=medium&i=0&d=0`)

    const stop = screen.getByTestId('stop-rule')
    const cues = screen.getByTestId('cue-list')

    // Its own box, outside the list. Tucking it into the top of the list "so it
    // reads together" is the single easiest way to undo brief 24, and it would
    // pass a text-only assertion.
    expect(cues.contains(stop)).toBe(false)
    expect(stop.contains(cues)).toBe(false)
    expect(precedes(stop, cues)).toBe(true)
  })

  it('is the rung’s own `stopRule`, verbatim', async () => {
    seedUser(docWith())
    await renderApp(`/?v=medium&i=0&d=0`)
    // The push ladder starts at rung index 2 and nothing has been trained.
    const rung = getRung('push', 2)
    expect(screen.getByTestId('stop-rule').textContent).toContain(rung.stopRule)
    // And it is no longer the last cue, which is where it lived before brief 24.
    expect(screen.getByTestId('cue-list').textContent).not.toContain(rung.stopRule)
  })

  /**
   * Ordering, not presence — and it is a separate assertion from "above the
   * cues" on purpose.
   *
   * The stop rule was already above the cues when the build shipped, and that
   * was still not enough on a 402x874 phone: the comparison strip sat between
   * the numeral and the stop rule and pushed the sentence far enough down that
   * it truncated mid-clause at the fold while still looking complete. Presence
   * and order relative to the cues are both satisfiable while the line is
   * unreadable at the moment it matters, so the position that actually needed
   * locking is this one.
   */
  it('outranks the comparison strip, not just the cues', async () => {
    seedUser(docWithHistory())
    await renderApp('/?v=medium&i=0&d=0')

    const stop = screen.getByTestId('stop-rule')
    const comparison = screen.getByTestId('comparison')
    const cues = screen.getByTestId('cue-list')

    // Node.compareDocumentPosition: FOLLOWING means the argument comes after.
    expect(stop.compareDocumentPosition(comparison) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(stop.compareDocumentPosition(cues) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('is absent on the cardio slot, which has no rung and no stop rule', async () => {
    seedUser(withCyclePosition(docWith(), 2))
    await renderApp(`/?v=medium&i=0&d=0`)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Cardio')
    expect(screen.queryByTestId('stop-rule')).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('a safetyCritical rung', () => {
  // The push ladder starts at index 2 and takes 14 sessions per rung, so 84
  // sessions clamps to the top rung — `push-09-archer`, at index 7.
  const AT_ARCHER = 84
  const ARCHER = getRung('push', 7)

  it('renders its first cue in a separate element from the remaining cues', async () => {
    seedUser(docWith({ push: AT_ARCHER }))
    await renderApp(`/?v=medium&i=0&d=0`)

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Archer push-up')
    expect(ARCHER.safetyCritical).toBe(true)

    const safety = screen.getByTestId('safety-cue')
    const list = screen.getByTestId('cue-list')

    expect(safety).not.toBe(list)
    expect(safety.contains(list)).toBe(false)
    expect(list.contains(safety)).toBe(false)

    expect(safety.textContent).toContain('Safety check first:')
    // The whole point: it is not also item one of the list. The count is derived
    // from the content rather than written down, so re-cueing a rung cannot
    // silently turn this into an assertion about nothing.
    expect(list.textContent).not.toContain('Safety check first:')
    expect(list.querySelectorAll('li')).toHaveLength(ARCHER.cues.length - 1)

    // And it renders *first*, which is what makes it readable without scrolling
    // on a phone: ahead of the target numeral, the stop rule and the other cues.
    const hero = screen.getByText(ARCHER.name)
    expect(precedes(hero, safety)).toBe(true)
    expect(precedes(safety, screen.getByTestId('stop-rule'))).toBe(true)
    expect(precedes(safety, list)).toBe(true)
  })

  it('is the only case that gets a separate block — an ordinary rung has none', async () => {
    seedUser(docWith())
    await renderApp(`/?v=medium&i=0&d=0`)
    expect(screen.queryByTestId('safety-cue')).toBeNull()
    expect(screen.getByTestId('cue-list').querySelectorAll('li')).toHaveLength(
      getRung('push', 2).cues.length,
    )
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

  it('is a warning that never turns red and never offers to go away', async () => {
    seedUser(docWith())
    await renderApp(`/?v=medium&i=2&d=0`)
    const note = screen.getByTestId('honest-note')
    // No dismiss affordance of any kind inside it. `<HonestNote>` has no
    // `onDismiss` prop to add one with, and this is what says so from outside.
    expect(note.querySelectorAll('button')).toHaveLength(0)
    // The danger hue belongs to the stop rule alone. The class list is the only
    // place this is observable without a layout engine.
    expect(note.className).toContain('warn')
    expect(note.className).not.toContain('dang')
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('the countdown is not announced sixty times a minute', () => {
  it('is a role=timer whose numeral is hidden and is in no live region', async () => {
    seedUser(docWith())
    await renderApp(`/?v=medium&i=1&d=0`)

    const timer = screen.getByRole('timer')
    // The one rule that makes this app usable with a screen reader on the screen
    // that matters most: a per-second value inside `aria-live` announces sixty
    // times a minute.
    expect(timer.querySelector('[aria-live]')).toBeNull()
    expect(timer.getAttribute('aria-live')).toBeNull()
    // The numeral is inside an `aria-hidden` container; the timer's own label
    // carries the duration.
    const numeral = timer.querySelector('[aria-hidden="true"]')
    expect(numeral).not.toBeNull()
    expect(timer.getAttribute('aria-label')).toMatch(/^\d+ second hold$/)
  })

  it('announces the set transition once, politely, and on rep exercises too', async () => {
    seedUser(docWith())
    // Item 0 is a rep exercise — no clock at all, so this announcement cannot be
    // the countdown's and has to be the player's own.
    const { router } = await renderApp(`/?v=medium&i=0&d=0`)

    const region = screen.getByTestId('set-announcement')
    expect(region.getAttribute('aria-live')).toBe('polite')
    expect(region.textContent).toContain('Set 1 of 3')

    await tapNext(router)
    expect(screen.getByTestId('set-announcement').textContent).toContain('Set 2 of 3')
    // Targets read as prose, never as `3 × 8`.
    expect(screen.getByTestId('set-announcement').textContent).toContain('sets of')
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

describe('logging is offered and never demanded', () => {
  /** Walks the whole Push session — 3 push sets, 2 core, 2 pull — from wherever it is. */
  async function playToTheEnd(router: Router, taps: number): Promise<void> {
    for (let tap = 0; tap < taps; tap += 1) await tapNext(router)
    await screen.findByText('Session complete.')
  }

  it('records nothing at all when the log buttons are never touched', async () => {
    seedUser(docWith({ push: 4 }))
    const { router } = await renderApp(`/?v=medium&i=0&d=0`)
    await playToTheEnd(router, 7)

    const text = localStorage.getItem(STORAGE_KEYS.live(USERNAME)) ?? ''
    // The key must be ABSENT, not `[]`. Absent means "no answer was given";
    // an empty array means "I did nothing", and they are different facts.
    expect(text).not.toContain('logged')
    for (const exercise of storedDoc().history[0]?.exercises ?? []) {
      expect('logged' in exercise).toBe(false)
    }
  })

  it('records the target when Log is tapped, and it survives the codec', async () => {
    seedUser(docWith({ push: 4 }))
    const { router } = await renderApp(`/?v=medium&i=0&d=0`)

    const log = screen.getByRole('button', { name: /^Log \d+ reps? for this set/ })
    const target = Number(/\d+/.exec(log.textContent ?? '')?.[0])
    expect(Number.isFinite(target)).toBe(true)
    fireEvent.click(log)

    // The button reports the state back rather than silently succeeding.
    expect(screen.getByRole('button', { name: /^Logged \d+ reps?\. Tap to remove\./ })).toBeTruthy()

    await playToTheEnd(router, 7)

    const push = storedDoc().history[0]?.exercises.find((e) => e.pattern === 'push')
    expect(push?.logged).toEqual([target])
    // Only the set that was logged. Two untouched sets are not zeroes.
    expect(push?.sets).toBe(3)
  })

  it('takes a different number through Log other', async () => {
    seedUser(docWith({ push: 4 }))
    const { router } = await renderApp(`/?v=medium&i=0&d=0`)

    fireEvent.click(screen.getByRole('button', { name: 'Log a different number for this set' }))
    fireEvent.change(screen.getByLabelText('Reps'), { target: { value: '11' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await playToTheEnd(router, 7)
    expect(storedDoc().history[0]?.exercises.find((e) => e.pattern === 'push')?.logged).toEqual([
      11,
    ])
  })

  it('does not change what comes next — the schedule is fixed either way', async () => {
    seedUser(docWith({ push: 4 }))
    const logged = await (async () => {
      const { router } = await renderApp(`/?v=medium&i=0&d=0`)
      fireEvent.click(screen.getByRole('button', { name: /^Log \d+ reps? for this set/ }))
      await playToTheEnd(router, 7)
      const doc = storedDoc()
      cleanup()
      return doc
    })()

    resetBrowserState()
    seedUser(docWith({ push: 4 }))
    const skipped = await (async () => {
      const { router } = await renderApp(`/?v=medium&i=0&d=0`)
      await playToTheEnd(router, 7)
      const doc = storedDoc()
      cleanup()
      return doc
    })()

    // The governing invariant, from the outside: a logged value reaches nothing
    // that decides the next session.
    expect(logged.sessionsDone).toEqual(skipped.sessionsDone)
    expect(logged.cyclePosition).toBe(skipped.cyclePosition)
    // And the assertion is not vacuous — one of them really did record a log.
    expect(logged.history[0]?.exercises[0]?.logged).toBeDefined()
    expect(skipped.history[0]?.exercises[0]?.logged).toBeUndefined()
  })

  it('offers nothing to log on the cardio slot, which is prescribed by breathlessness', async () => {
    seedUser(withCyclePosition(docWith(), 2))
    await renderApp(`/?v=medium&i=0&d=0`)
    expect(screen.queryByRole('button', { name: /^Log/ })).toBeNull()
    expect(document.body.textContent).toContain('There is nothing to log.')
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

    const doc = storedDoc()
    cleanup()
    return doc
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

    expect(storedDoc().history[0]?.exercises.map((e) => e.pattern)).toEqual(['core', 'pull'])
  })
})
