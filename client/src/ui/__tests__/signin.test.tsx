// @vitest-environment jsdom
//
// Signing in: the page, the session call that ends the loop, the Ward button, and
// the account's sign-in settings.
//
// The vendored hooks run for real. What is faked is the service's `/api/auth/*`
// surface (`installAuth` in the harness), handed to the client as its `fetch`, so
// nothing here depends on a server and nothing touches the global `fetch` that the
// sync tests count calls to.
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StateDoc } from '@sports-app/shared/types.ts'
import { SESSION_KEY } from '../../persistence/session.ts'
import { emptyDoc } from '../../persistence/store.ts'
import { currentUrl, installAuth, renderApp, resetBrowserState, seedUser } from './harness.tsx'

const USERNAME = 'alice'
const PASSWORD = 'correct-horse-battery'

function doc(): StateDoc {
  return emptyDoc(USERNAME)
}

beforeEach(() => {
  cleanup()
  resetBrowserState()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ─── Local sign-in ──────────────────────────────────────────────────────────

describe('/login with a password', () => {
  it('signs in, remembers who, and goes on to the app', async () => {
    const { router, auth } = await renderApp('/login', { accounts: { [USERNAME]: PASSWORD } })

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: USERNAME } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: PASSWORD } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(currentUrl(router)).toBe('/'))
    expect(localStorage.getItem(SESSION_KEY)).toBe(USERNAME)
    expect(auth.bodies['POST /login']).toEqual({ username: USERNAME, password: PASSWORD })
  })

  it('says so when the password is wrong, and writes nothing', async () => {
    const { router } = await renderApp('/login', { accounts: { [USERNAME]: PASSWORD } })

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: USERNAME } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'not-it' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('That username and password do not match.')).toBeTruthy()
    expect(currentUrl(router)).toBe('/login')
    expect(localStorage.getItem(SESSION_KEY)).toBeNull()
  })

  it('says it cannot reach the service, rather than that the password is wrong', async () => {
    await renderApp('/login', { down: true })

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: USERNAME } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: PASSWORD } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText(/Could not reach the service/)).toBeTruthy()
  })
})

// ─── Going on to the screen that was asked for ──────────────────────────────

describe('a sign-in goes on to the screen that was asked for', () => {
  async function signInWithPassword(): Promise<void> {
    fireEvent.change(await screen.findByLabelText('Username'), { target: { value: USERNAME } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: PASSWORD } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  }

  it('a signed-out visit to /plan signs in to /plan, and Back does not return to /login', async () => {
    const { router } = await renderApp('/plan', { accounts: { [USERNAME]: PASSWORD } })

    // The guard says where the person was going.
    expect(currentUrl(router)).toBe('/login?next=%2Fplan')

    await signInWithPassword()

    await waitFor(() => expect(currentUrl(router)).toBe('/plan'))
    expect(await screen.findByText('This month')).toBeTruthy()
    expect(localStorage.getItem(SESSION_KEY)).toBe(USERNAME)
    // The guard's redirect and the page's navigation both replace, so the tab has
    // one entry: there is no /login behind the plan to go Back to.
    expect(router.history.canGoBack()).toBe(false)
  })

  it.each(['/progress', '/library', '/account'])('every guarded screen says so: %s', async (path) => {
    const { router } = await renderApp(path)
    expect(currentUrl(router)).toBe(`/login?next=${encodeURIComponent(path)}`)
  })

  it('a plain visit to / shows a clean /login, with no next', async () => {
    const { router } = await renderApp('/', { accounts: { [USERNAME]: PASSWORD } })
    expect(currentUrl(router)).toBe('/login')

    await signInWithPassword()
    await waitFor(() => expect(currentUrl(router)).toBe('/'))
  })

  it.each(['//evil.example', 'https://evil.example', '/\\evil', '/login'])(
    'a next of %s is dropped and the sign-in lands on /',
    async (next) => {
      const { router } = await renderApp(`/login?next=${encodeURIComponent(next)}`, {
        accounts: { [USERNAME]: PASSWORD },
      })

      await signInWithPassword()

      await waitFor(() => expect(localStorage.getItem(SESSION_KEY)).toBe(USERNAME))
      await waitFor(() => expect(currentUrl(router)).toBe('/'))
    },
  )

  it('the Ward button asks to come back through /login with the same next', async () => {
    const { router, auth } = await renderApp('/plan', { ward: { enabled: true } })
    expect(currentUrl(router)).toBe('/login?next=%2Fplan')

    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with Ward' }))

    await waitFor(() => expect(auth.navigations).toHaveLength(1))
    // `/login`, not `/plan`: the page that writes the cached username is the one
    // Ward lands on. The base is `/` under test; the deploy's is `/sports-app/`.
    expect(auth.bodies['POST /ward/start']).toEqual({ returnTo: '/login?next=%2Fplan' })
  })

  it('the redirect back from Ward is remembered on /login and goes on to next', async () => {
    const { router } = await renderApp('/login?next=%2Fplan', {
      signedInAs: { username: USERNAME },
      origin: 'ward',
      ward: { enabled: true, linked: true },
      href: 'http://localhost/sports-app/login?next=%2Fplan',
    })

    await waitFor(() => expect(localStorage.getItem(SESSION_KEY)).toBe(USERNAME))
    await waitFor(() => expect(currentUrl(router)).toBe('/plan'))
    expect(await screen.findByText('This month')).toBeTruthy()
  })
})

// ─── Trying again after a refused Ward sign-in ──────────────────────────────

describe('a retry after a refused Ward sign-in goes on to the screen that was asked for', () => {
  /**
   * Where the service lands a refused sign-in (ward-auth 0.7.0): the login page,
   * the code, and the return the sign-in was started with. No `next` of its own.
   */
  function refusedWith(returnTo: string): string {
    return `http://localhost/login?ward_error=access_denied&ward_return_to=${encodeURIComponent(returnTo)}`
  }

  it('/plan, refused at Ward, tried again and let in: /plan shows', async () => {
    // A signed-out visit to /plan starts a Ward sign-in.
    const first = await renderApp('/plan', { ward: { enabled: true } })
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with Ward' }))
    await waitFor(() => expect(first.auth.navigations).toHaveLength(1))
    const asked = first.auth.bodies['POST /ward/start'] as { returnTo: string }
    expect(asked).toEqual({ returnTo: '/login?next=%2Fplan' })

    // Ward refuses, and the service lands on /login with the code and that return.
    cleanup()
    const refused = await renderApp('/login', {
      ward: { enabled: true },
      href: refusedWith(asked.returnTo),
    })
    expect(await screen.findByText(/Ward did not let you in here/)).toBeTruthy()

    // Trying again asks for the same return.
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Ward' }))
    await waitFor(() => expect(refused.auth.navigations).toHaveLength(1))
    expect(refused.auth.bodies['POST /ward/start']).toEqual(asked)

    // Ward lets them in this time, and the service lands on that return.
    cleanup()
    const { router } = await renderApp(asked.returnTo, {
      signedInAs: { username: USERNAME },
      origin: 'ward',
      ward: { enabled: true, linked: true },
    })
    await waitFor(() => expect(localStorage.getItem(SESSION_KEY)).toBe(USERNAME))
    await waitFor(() => expect(currentUrl(router)).toBe('/plan'))
    expect(await screen.findByText('This month')).toBeTruthy()
  })

  it('a password sign-in after the refusal goes on to the asked screen too', async () => {
    const { router } = await renderApp('/login', {
      accounts: { [USERNAME]: PASSWORD },
      ward: { enabled: true },
      href: refusedWith('/login?next=%2Fplan'),
    })
    expect(await screen.findByText(/Ward did not let you in here/)).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: USERNAME } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: PASSWORD } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(currentUrl(router)).toBe('/plan'))
  })

  it.each([
    // Off the origin: the library drops these before the page sees them.
    '//evil.example',
    'https://evil.example',
    // On the origin, but the `next` inside fails brief 32's rules.
    '/login?next=%2F%2Fevil.example',
    '/login?next=https%3A%2F%2Fevil.example',
    '/login?next=%2Flogin',
    // On the origin, but not this app's login page, so not a return it made.
    '/plan',
  ])('a carried return of %s is not used again', async (returnTo) => {
    const { auth } = await renderApp('/login', {
      ward: { enabled: true },
      href: refusedWith(returnTo),
    })
    expect(await screen.findByText(/Ward did not let you in here/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Ward' }))

    await waitFor(() => expect(auth.navigations).toHaveLength(1))
    expect(auth.bodies['POST /ward/start']).toEqual({})
  })
})

// ─── The loop ───────────────────────────────────────────────────────────────

describe('the sign-in loop', () => {
  /*
   * The bug: after Ward's redirect the browser held a valid cookie and no cached
   * username, every route guard sent it to /login, and nothing on /login asked the
   * service who the cookie belonged to. The session call is that question.
   */
  it('ends: a live session with no cached name is remembered and lands on the app', async () => {
    expect(localStorage.getItem(SESSION_KEY)).toBeNull()

    const { router, auth } = await renderApp('/', {
      signedInAs: { username: USERNAME },
      origin: 'ward',
      ward: { enabled: true, linked: true },
    })

    await waitFor(() => expect(localStorage.getItem(SESSION_KEY)).toBe(USERNAME))
    await waitFor(() => expect(currentUrl(router)).toBe('/'))
    expect(auth.calls).toContain('GET /session')
    // It settled on the app; it is not bouncing between the two.
    expect(screen.queryByLabelText('Username')).toBeNull()
  })

  it('does not forget the cached name when the service cannot be reached', async () => {
    seedUser(doc())
    const { router } = await renderApp('/', { down: true })

    expect(currentUrl(router)).toBe('/')
    expect(localStorage.getItem(SESSION_KEY)).toBe(USERNAME)
  })

  it('does not forget the cached name when the session call says signed out', async () => {
    seedUser(doc())
    await renderApp('/account', { signedInAs: null })

    expect(await screen.findByText(/You are not signed in to the service/)).toBeTruthy()
    expect(localStorage.getItem(SESSION_KEY)).toBe(USERNAME)
  })

  it('says why instead of looping when browser storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    const { router } = await renderApp('/login', { signedInAs: { username: USERNAME } })

    expect(await screen.findByText(/Could not remember the username/)).toBeTruthy()
    expect(currentUrl(router)).toBe('/login')
  })
})

// ─── Sign in with Ward ──────────────────────────────────────────────────────

describe('"Sign in with Ward"', () => {
  it('is offered only when the service has Ward configured', async () => {
    await renderApp('/login', { ward: { enabled: false } })
    await screen.findByLabelText('Username')
    expect(screen.queryByRole('button', { name: 'Sign in with Ward' })).toBeNull()

    cleanup()
    await renderApp('/login', { ward: { enabled: true } })
    expect(await screen.findByRole('button', { name: 'Sign in with Ward' })).toBeTruthy()
  })

  it('asks the service for Ward’s address and sends the browser there', async () => {
    const { auth } = await renderApp('/login', { ward: { enabled: true } })

    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with Ward' }))

    await waitFor(() => expect(auth.navigations).toHaveLength(1))
    expect(auth.calls).toContain('POST /ward/start')
    // Nowhere was asked for, so no return either: the service lands it on /login.
    expect(auth.bodies['POST /ward/start']).toEqual({})
    // The URL is the service's to choose; the page does not build one.
    expect(auth.navigations[0]).toMatch(/^https:\/\/ward\.example\//)
  })

  it.each([
    ['access_denied', /Ward did not let you in here/],
    ['ward_unavailable', /Ward is unreachable right now/],
    ['ward_misconfigured', /setup problem on the server/],
    ['invalid_callback', /expired or was interrupted/],
  ])('words %s, from the redirect back', async (code, message) => {
    await renderApp('/login', {
      ward: { enabled: true },
      href: `http://localhost/sports-app/login?ward_error=${code}`,
    })
    expect(await screen.findByText(message)).toBeTruthy()
  })

  it('words a session that ended, so a revoke is not a mystery', async () => {
    await renderApp('/login', { ward: { enabled: true }, reason: 'ward_session_ended' })
    expect(await screen.findByText(/Your Ward session ended/)).toBeTruthy()
  })

  it('says an account name the app cannot use is the operator’s to fix', async () => {
    await renderApp('/login', { reason: 'unsupported_username' })
    expect(await screen.findByText(/cannot be used here/)).toBeTruthy()
  })
})

// ─── The account's sign-in settings ─────────────────────────────────────────

describe('/account sign-in settings', () => {
  it('links Ward from settings, which is the only way an existing account gets one', async () => {
    seedUser(doc())
    const { auth } = await renderApp('/account', {
      signedInAs: { username: USERNAME },
      ward: { enabled: true, linked: false },
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Link Ward' }))

    await waitFor(() => expect(auth.navigations).toHaveLength(1))
    expect(auth.calls).toContain('POST /ward/link')
  })

  it('unlinks Ward', async () => {
    seedUser(doc())
    const { auth } = await renderApp('/account', {
      signedInAs: { username: USERNAME, hasPassword: true },
      ward: { enabled: true, linked: true },
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Unlink Ward' }))

    await waitFor(() => expect(auth.calls).toContain('POST /ward/unlink'))
    expect(await screen.findByRole('button', { name: 'Link Ward' })).toBeTruthy()
  })

  it('refuses to unlink for an account with no password, and says what to do', async () => {
    seedUser(doc())
    await renderApp('/account', {
      signedInAs: { username: USERNAME, hasPassword: false },
      origin: 'ward',
      ward: { enabled: true, linked: true },
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Unlink Ward' }))

    expect(await screen.findByText(/Set a password first/)).toBeTruthy()
  })

  it('sets a first local password for an account that only has Ward', async () => {
    seedUser(doc())
    const { auth } = await renderApp('/account', {
      signedInAs: { username: USERNAME, hasPassword: false },
      origin: 'ward',
      ward: { enabled: true, linked: true },
    })

    fireEvent.change(await screen.findByLabelText('New password'), {
      target: { value: PASSWORD },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Set password' }))

    await waitFor(() => expect(auth.bodies['POST /ward/set-password']).toEqual({ newPassword: PASSWORD }))
    expect(await screen.findByText(/Password set/)).toBeTruthy()
  })

  it('asks Ward to confirm when the Ward sign-in is too old to set a password', async () => {
    seedUser(doc())
    const { auth } = await renderApp('/account', {
      signedInAs: { username: USERNAME, hasPassword: false },
      origin: 'ward',
      ward: { enabled: true, linked: true },
      setPasswordError: 'reauthentication_required',
    })

    fireEvent.change(await screen.findByLabelText('New password'), {
      target: { value: PASSWORD },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Set password' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Confirm with Ward' }))
    await waitFor(() => expect(auth.navigations).toHaveLength(1))
    expect(auth.calls).toContain('POST /ward/reauthenticate')
  })

  it('changes a password for an account that has one', async () => {
    seedUser(doc())
    const { auth } = await renderApp('/account', {
      signedInAs: { username: USERNAME, hasPassword: true },
    })

    fireEvent.change(await screen.findByLabelText('Current password'), {
      target: { value: PASSWORD },
    })
    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'another-long-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))

    await waitFor(() =>
      expect(auth.bodies['POST /password']).toEqual({
        currentPassword: PASSWORD,
        newPassword: 'another-long-password',
      }),
    )
  })

  it('offers no Ward controls when the service has no Ward', async () => {
    seedUser(doc())
    await renderApp('/account', {
      signedInAs: { username: USERNAME },
      ward: { enabled: false },
    })

    await screen.findByRole('button', { name: 'Log out' })
    expect(screen.queryByRole('button', { name: 'Link Ward' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Unlink Ward' })).toBeNull()
  })

  it('logs out, and a reload afterwards stays on the sign-in page', async () => {
    seedUser(doc())
    const fake = installAuth({ signedInAs: { username: USERNAME } })
    const { router } = await renderApp('/account', fake)

    fireEvent.click(await screen.findByRole('button', { name: 'Log out' }))

    await waitFor(() => expect(currentUrl(router)).toBe('/login'))
    expect(localStorage.getItem(SESSION_KEY)).toBeNull()
    expect(fake.calls).toContain('POST /logout')

    // The reload: a fresh router over the same browser and the same service, which
    // now says nobody. The guard sends it to /login and /login stays put, so a log
    // out cannot turn into a sign-in.
    cleanup()
    const reloaded = await renderApp('/', fake)
    await waitFor(() => expect(currentUrl(reloaded.router)).toBe('/login'))
    expect(await screen.findByLabelText('Username')).toBeTruthy()
    expect(localStorage.getItem(SESSION_KEY)).toBeNull()
  })

  it('logs out of Ward too, clearing the cached name before the browser leaves', async () => {
    seedUser(doc())
    const { auth } = await renderApp('/account', {
      signedInAs: { username: USERNAME },
      origin: 'ward',
      ward: { enabled: true, linked: true },
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Log out of Ward too' }))

    await waitFor(() => expect(auth.navigations).toEqual(['https://ward.example/oidc/session/end']))
    expect(localStorage.getItem(SESSION_KEY)).toBeNull()
  })

  it('keeps the cached name when the service cannot be reached to log out', async () => {
    seedUser(doc())
    // Signed in when the page loaded, unreachable by the time the button is pressed.
    const { router, auth } = await renderApp('/account', { signedInAs: { username: USERNAME } })
    const button = await screen.findByRole('button', { name: 'Log out' })

    auth.setDown(true)
    fireEvent.click(button)

    expect(await screen.findByText(/Could not reach the service/)).toBeTruthy()
    expect(localStorage.getItem(SESSION_KEY)).toBe(USERNAME)
    expect(currentUrl(router)).toBe('/account')
  })
})
