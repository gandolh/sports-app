// @vitest-environment jsdom
//
// Shared setup for the route tests. Not a `.test.` file, so vitest does not run
// it, and it sits inside `__tests__/` so the two source-grep invariant tests
// exclude it along with the tests themselves.
//
// Every test here drives the **real** router over a memory history and the
// **real** store over jsdom's `localStorage`. Nothing is mocked, on purpose: the
// two properties these tests exist to protect — "the position lives in the URL"
// and "a reload resumes on the same exercise" — are properties of the URL and of
// storage, and a test that stubbed either would assert nothing.
import { act, render } from '@testing-library/react'
import { createMemoryHistory } from '@tanstack/react-router'
import type { StateDoc } from '@sports-app/shared/types.ts'
import { serialise } from '../../persistence/codec.ts'
import { SESSION_KEY } from '../../persistence/session.ts'
import { STORAGE_KEYS, clearReadOnly } from '../../persistence/store.ts'
import { AppRoot, createAppQueryClient, createAppRouter } from '../App.tsx'

// jsdom has no layout engine, so its `window.scrollTo` logs "Not implemented" on
// every router navigation — twenty-seven lines of noise per test file, hiding real
// failures. A no-op is the whole of what the router wants from it here.
if (typeof window !== 'undefined') {
  window.scrollTo = () => {}
}

/** Log this document's owner in and put the document where `store.load` reads it. */
export function seedUser(doc: StateDoc): void {
  localStorage.setItem(SESSION_KEY, doc.username)
  localStorage.setItem(STORAGE_KEYS.live(doc.username), serialise(doc))
}

/** The read-only latch is module state, so it outlives a test unless cleared. */
export function resetBrowserState(): void {
  localStorage.clear()
  clearReadOnly()
}

export async function renderApp(initialPath: string) {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [initialPath] }))
  const queryClient = createAppQueryClient()
  // Resolve `beforeLoad` before the first paint, so the tests see a settled tree
  // rather than racing the router's own resolution.
  await router.load()
  // The router's own transition state settles in an update *after* mount, so the
  // async `act` is what makes a `container.innerHTML` read immediately afterwards
  // the final tree rather than an intermediate one.
  let view!: ReturnType<typeof render>
  await act(async () => {
    view = render(<AppRoot router={router} queryClient={queryClient} />)
  })
  return { ...view, router, queryClient }
}

/** The URL the app is currently on, path and search, as a string. */
export function currentUrl(router: Awaited<ReturnType<typeof renderApp>>['router']): string {
  return `${router.state.location.pathname}${router.state.location.searchStr}`
}
