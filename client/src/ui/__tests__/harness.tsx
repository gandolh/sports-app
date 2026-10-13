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
import { configureAuth } from '../../../vendor/ward/ward-auth-react.js'
import { AUTH_BASE_PATH } from '../../persistence/auth.ts'
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

// ─── The service's sign-in routes, faked ────────────────────────────────────

export interface FakeSessionUser {
  readonly username: string
  readonly hasPassword?: boolean
  readonly role?: string
}

export interface FakeAuthOptions {
  /** Who the cookie belongs to, or `null` for nobody. Default: nobody. */
  readonly signedInAs?: FakeSessionUser | null
  readonly origin?: 'local' | 'ward'
  /** Whether the server has Ward configured, and whether this user has it linked. */
  readonly ward?: { readonly enabled: boolean; readonly linked?: boolean }
  /** Why a signed-out session ended, as `GET /session` reports it. */
  readonly reason?: string
  /** Username to password, for `POST /login`. */
  readonly accounts?: Readonly<Record<string, string>>
  /** The address bar, as the vendored client reads it once at startup. */
  readonly href?: string
  /** Make every call fail the way an unreachable service does. */
  readonly down?: boolean
  /** The error `POST /ward/set-password` answers with, or none. */
  readonly setPasswordError?: string
}

export interface FakeAuth {
  /** `METHOD /path` of every request the sign-in client made, in order. */
  readonly calls: string[]
  /** Every URL the client sent the browser to (Ward's pages). */
  readonly navigations: string[]
  readonly bodies: Record<string, unknown>
  /** From now on, fail every call the way an unreachable service does. */
  setDown(down: boolean): void
}

/**
 * Stand in for `/api/auth/*`, so the hooks run for real against a server that
 * answers the way the service does. `fetch` is handed to `configureAuth`, **not**
 * stubbed globally: several tests count calls to the global `fetch` for the state
 * service, and the sign-in client must not be one of them.
 *
 * With nothing given the browser holds no session, which is "nobody logged in".
 */
export function installAuth(options: FakeAuthOptions = {}): FakeAuth {
  const calls: string[] = []
  const navigations: string[] = []
  const bodies: Record<string, unknown> = {}
  let user: FakeSessionUser | null = options.signedInAs ?? null
  let linked = options.ward?.linked ?? false
  let down = options.down ?? false
  const origin = options.origin ?? 'local'
  const wardEnabled = options.ward?.enabled ?? false

  const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })

  function sessionBody() {
    if (user === null) {
      return {
        user: null,
        session: null,
        ward: { enabled: wardEnabled, linked: false },
        ...(options.reason === undefined ? {} : { reason: options.reason }),
      }
    }
    return {
      user: { id: `id-${user.username}`, role: 'user', hasPassword: true, ...user },
      session: { origin, expiresAt: Date.now() + 3_600_000 },
      ward: { enabled: wardEnabled, linked },
    }
  }

  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const path = String(input).slice(AUTH_BASE_PATH.length)
    const method = init?.method ?? 'GET'
    calls.push(`${method} ${path}`)
    if (typeof init?.body === 'string') bodies[`${method} ${path}`] = JSON.parse(init.body)
    if (down) throw new TypeError('fetch failed')

    switch (`${method} ${path}`) {
      case 'GET /session':
        return json(200, sessionBody())
      case 'POST /login': {
        const { username, password } = JSON.parse(String(init?.body)) as {
          username: string
          password: string
        }
        if (options.accounts?.[username] !== password) {
          return json(401, { error: 'invalid_credentials' })
        }
        user = { username }
        return json(200, sessionBody())
      }
      case 'POST /logout':
        user = null
        return new Response(null, { status: 204 })
      case 'POST /ward/start':
      case 'POST /ward/link':
      case 'POST /ward/reauthenticate':
        return json(200, { url: 'https://ward.example/oidc/auth?client_id=sports-app' })
      case 'POST /ward/unlink': {
        if (user !== null && user.hasPassword === false) {
          return json(409, { error: 'no_local_password' })
        }
        linked = false
        return json(200, { signedOut: false })
      }
      case 'POST /ward/set-password':
        return options.setPasswordError === undefined
          ? new Response(null, { status: 204 })
          : json(409, { error: options.setPasswordError })
      case 'POST /password':
        return new Response(null, { status: 204 })
      case 'POST /ward/logout':
        return json(200, { url: 'https://ward.example/oidc/session/end' })
      default:
        return json(404, { error: 'not_found' })
    }
  }

  const href = options.href ?? 'http://localhost/sports-app/'
  configureAuth({
    basePath: AUTH_BASE_PATH,
    fetch: fetchImpl as typeof fetch,
    navigate: (url: string) => {
      navigations.push(url)
    },
    location: { href, replace: () => {} },
  })

  return {
    calls,
    navigations,
    bodies,
    setDown: (value) => {
      down = value
    },
  }
}

export async function renderApp(initialPath: string, auth: FakeAuthOptions | FakeAuth = {}) {
  // A fresh sign-in client every render, so one test's session never leaks into
  // the next. A test that already installed its own passes the handle it got.
  const fake = 'calls' in auth ? auth : installAuth(auth)
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
  return { ...view, router, queryClient, auth: fake }
}

/** The URL the app is currently on, path and search, as a string. */
export function currentUrl(router: Awaited<ReturnType<typeof renderApp>>['router']): string {
  return `${router.state.location.pathname}${router.state.location.searchStr}`
}
