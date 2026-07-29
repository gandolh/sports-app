// @vitest-environment jsdom
//
// **The guilt-free property, mechanically.**
//
// "Returning after two weeks looks identical to returning after one day" is a
// locked product decision (corpus/wiki/decisions.md) and it is the kind of thing
// that stays true right up until somebody adds a helpful "last trained" line. The
// grep in `noDatesInUi.test.ts` stops a formatter from appearing; this stops the
// *rendered output* from depending on a timestamp by any route at all — a derived
// ordering, a sort, an `Array.prototype.at(-1)` on history, a conditional on
// staleness.
//
// The assertion is byte equality of the DOM. It is deliberately brutal: anything
// that makes the two trees differ is either a date leaking in or a rendering
// nondeterminism worth knowing about.
import { cleanup, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { StateDoc } from '../../domain/types.ts'
import { prescribe, recordSession, toSessionResult } from '../../domain/schedule.ts'
import { emptyDoc } from '../../persistence/store.ts'
import { renderApp, resetBrowserState, seedUser } from './harness.tsx'

const USERNAME = 'alice'
const SESSIONS = 6
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Six recorded sessions whose timestamps end `daysAgo` days back, and which are
 * otherwise byte-identical. This file may read a clock; nothing under `src/ui/`
 * may, which is the whole point of it.
 */
function history(daysAgo: number): StateDoc {
  // A fixed epoch rather than the wall clock, so the two documents differ only in
  // the offset under test and the test itself is reproducible.
  const anchor = Date.parse('2026-01-01T07:00:00.000Z')
  let doc = emptyDoc(USERNAME)
  for (let index = 0; index < SESSIONS; index += 1) {
    const at = new Date(anchor - (daysAgo + SESSIONS - index) * DAY_MS).toISOString()
    doc = recordSession(doc, toSessionResult(prescribe(doc, 'medium'), at))
  }
  return doc
}

/**
 * The one concession in this file, and it is not about time.
 *
 * `useId` is a monotonic counter for the lifetime of the React module, so the
 * second render in a file gets `_r_4_` where the first got `_r_0_` — for the same
 * tree, from the same document. Two of the app's inputs and every Base UI `Field`
 * use it to tie a label to its control, which is required rather than optional. So
 * the ids are flattened before the comparison and **nothing else is**: an id that
 * moved, appeared or disappeared still fails, because the flattened text still has
 * to match position for position.
 */
function stableIds(html: string): string {
  return html.replace(/_r_[0-9a-z]+_/g, '_r_')
}

async function renderHtml(doc: StateDoc, path: string): Promise<string> {
  resetBrowserState()
  seedUser(doc)
  const { container } = await renderApp(path)
  const html = stableIds(container.innerHTML)
  cleanup()
  return html
}

beforeEach(() => {
  cleanup()
  resetBrowserState()
})

describe('the app cannot tell how long ago the last session was', () => {
  it('the two fixtures really do differ, and only in their timestamps', () => {
    const recent = history(1)
    const ancient = history(400)

    expect(recent.history[0]?.completedAt).not.toBe(ancient.history[0]?.completedAt)
    expect(recent.history.at(-1)?.completedAt).not.toBe(ancient.history.at(-1)?.completedAt)

    // Everything else is equal, so a difference in the DOM below could only come
    // from a timestamp.
    const strip = (doc: StateDoc): unknown => ({
      ...doc,
      history: doc.history.map(({ completedAt: _completedAt, ...rest }) => rest),
    })
    expect(strip(recent)).toEqual(strip(ancient))
  })

  it('renders the home page byte-identically after 1 day and after 400 days', async () => {
    const recent = await renderHtml(history(1), '/')
    const ancient = await renderHtml(history(400), '/')

    // Guard against comparing two empty strings.
    expect(recent).toContain('Session 7')
    expect(ancient).toBe(recent)
  })

  it('renders /week byte-identically after 1 day and after 400 days', async () => {
    const recent = await renderHtml(history(1), '/week')
    const ancient = await renderHtml(history(400), '/week')
    expect(recent).toContain('The next seven sessions')
    expect(ancient).toBe(recent)
  })

  it('renders /account byte-identically after 1 day and after 400 days', async () => {
    const recent = await renderHtml(history(400), '/account')
    const ancient = await renderHtml(history(1), '/account')
    expect(recent).toContain('sessions completed')
    // The flattening above is only sound if it is flattening something.
    expect(recent).toContain('for="_r_"')
    expect(ancient).toBe(recent)
  })

  it('shows no elapsed-time wording anywhere on the home screen', async () => {
    resetBrowserState()
    seedUser(history(400))
    await renderApp('/')
    const text = document.body.textContent ?? ''
    // "today's numbers" is deliberately *not* on this list. `/` is "today's
    // training" in the decision record itself; what is banned is a "today" that
    // means a calendar day, and a session the user is about to do is not one.
    for (const forbidden of [
      'ago',
      'yesterday',
      'tomorrow',
      'last trained',
      'streak',
      'this week',
      'days',
    ]) {
      expect(text).not.toContain(forbidden)
    }
    // And the one number it does read from history is a count, not a date.
    expect(screen.getByText('Session 7')).toBeTruthy()
  })
})
