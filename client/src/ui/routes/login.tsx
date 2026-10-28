import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Field } from '@base-ui/react/field'
import { createRoute, useNavigate } from '@tanstack/react-router'
import { rootRoute } from './__root.tsx'
import { nextFromWardReturn, validateLoginSearch, wardReturnTo } from './next.ts'
import { useLogin, useSession, useWardSignIn } from '../../../vendor/ward/ward-auth-react.js'
import { setCurrentUsername } from '../../persistence/session.ts'
import { AlertBanner } from '../components/AlertBanner.tsx'
import { PrimaryButton, SecondaryButton } from '../components/Buttons.tsx'
import { describeAuthIssue } from '../components/authMessages.ts'
import { FIELD_INPUT, FIELD_LABEL } from '../components/fields.ts'
import { Shell, ShellBody, ShellFooter, ShellRail, ShellTitle } from '../components/Shell.tsx'

/**
 * `/login` — this app's own sign-in, and the one place a session is noticed.
 *
 * ── What it is ───────────────────────────────────────────────────────────────
 *
 * A username and a password for an account on this service, and a second way in:
 * "Sign in with Ward", shown only when the server says it is configured. There is
 * no register page. An account comes from the seed script (`npm run seed`) or from
 * a first Ward sign-in, and a person who already has one links Ward from their own
 * settings, never by matching a name.
 *
 * ── It is also what ends the sign-in loop ────────────────────────────────────
 *
 * Every other route guards on `currentUsername()`, a synchronous read of one
 * `localStorage` key. Nothing used to write that key after Ward's sign-in, so a
 * browser holding a perfectly good session cookie was sent back here forever. The
 * service answers the question the client was missing — `GET /api/auth/session` —
 * and this page is where the answer is written down: whenever the session is
 * signed in, the username it names becomes the cached one and the browser goes on
 * to the app. That covers a local sign-in, the redirect back from Ward (the service
 * lands it here, `afterSignInPath`), and a visit with a cookie that is still live.
 *
 * ── It goes on to the screen that was asked for ─────────────────────────────
 *
 * A guard that sends somebody here says where they were going, as `?next=/plan`,
 * and once the username is written the browser goes there instead of to `/`
 * (`next.ts` keeps `next` only when it is a path inside the app). The Ward button
 * asks Ward to come back to this page with the same `next`, not to the screen
 * itself: a Ward sign-in that skipped this page would skip the write, and the guard
 * on that screen would send it straight back here, which is the loop again.
 *
 * A Ward sign-in that is refused comes back here without `next`, carrying the
 * return it was started with instead (`useWardSignIn().returnTo`, ward-auth
 * 0.7.0). The page reads `next` back out of it, so trying again, with Ward or with
 * a password, still goes on to the screen that was asked for (brief 33).
 *
 * It does **not** clear the cache when the session call fails or says signed out.
 * The cache is what lets the app open offline, and an unreachable service is not a
 * sign-out. The cache is cleared only on an explicit log out (`/account`).
 *
 * ── It needs the service, and nothing else does ─────────────────────────────
 *
 * Signing in is a request to the service, so it cannot work offline. That is not a
 * regression of the offline-first rule: the **app** opens offline for anybody whose
 * username is cached, which is every route but this one.
 */

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: validateLoginSearch,
  component: LoginRoute,
})

function LoginRoute() {
  const session = useSession()
  const { login, pending, error: loginError, reset: resetLogin } = useLogin()
  const ward = useWardSignIn()
  const navigate = useNavigate()
  // The address bar's `next`, or the one a refused Ward sign-in hands back.
  const next = loginRoute.useSearch().next ?? nextFromWardReturn(ward.returnTo)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberError, setRememberError] = useState<string | null>(null)

  const signedInAs = session.status === 'signed_in' ? session.user.username : null

  useEffect(() => {
    if (signedInAs === null) return
    // The write the sign-in loop was missing.
    const remembered = setCurrentUsername(signedInAs)
    if (remembered.ok) {
      // Replace, so Back from the screen it lands on does not return to this page.
      void navigate({ to: next ?? '/', replace: true })
      return
    }
    // Browser storage is unavailable. Going on would send the person straight back
    // here, so say why instead of looping. Set from a callback rather than in the
    // effect body, which would render twice for one fact.
    const timer = setTimeout(() => setRememberError(remembered.error), 0)
    return () => clearTimeout(timer)
  }, [signedInAs, next, navigate])

  function submit(event: FormEvent): void {
    event.preventDefault()
    ward.reset()
    void login(username.trim(), password)
  }

  const wardEnabled =
    (session.status === 'signed_in' || session.status === 'signed_out') && session.ward.enabled

  // One banner at a time, the most specific first: a Ward round trip that came
  // back with a code, then why the last session ended, then a failed password.
  const notice =
    ward.error !== null
      ? describeAuthIssue(ward.error)
      : loginError !== null
        ? describeAuthIssue(loginError)
        : session.status === 'signed_out' && session.reason !== undefined
          ? describeAuthIssue({ code: session.reason })
          : null

  return (
    <Shell>
      <ShellRail>Calisthenics</ShellRail>
      <ShellTitle
        title="Sign in"
        subtitle="Your account on this service. Training itself works offline once you are in."
      />
      <ShellBody>
        {rememberError === null ? null : <AlertBanner label="Not remembered" text={rememberError} />}
        {notice === null ? null : <AlertBanner label="Not signed in" text={notice} />}

        <form id="login-form" onSubmit={submit} noValidate className="mt-[var(--sp-3)]">
          <div className="flex flex-col gap-[var(--sp-3)]">
            <Field.Root>
              <Field.Label className={FIELD_LABEL}>Username</Field.Label>
              <Field.Control
                className={FIELD_INPUT}
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value)
                  resetLogin()
                }}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </Field.Root>
            <Field.Root>
              <Field.Label className={FIELD_LABEL}>Password</Field.Label>
              <Field.Control
                className={FIELD_INPUT}
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value)
                  resetLogin()
                }}
                autoComplete="current-password"
              />
            </Field.Root>
          </div>
        </form>
      </ShellBody>
      <ShellFooter
        above={
          wardEnabled ? (
            <SecondaryButton
              type="button"
              onClick={() => void ward.signIn(next === undefined ? {} : { returnTo: wardReturnTo(next) })}
            >
              Sign in with Ward
            </SecondaryButton>
          ) : undefined
        }
      >
        <PrimaryButton type="submit" form="login-form" disabled={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
        </PrimaryButton>
      </ShellFooter>
    </Shell>
  )
}
