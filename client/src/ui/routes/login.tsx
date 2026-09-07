import { useEffect } from 'react'
import { createRoute } from '@tanstack/react-router'
import { rootRoute } from './__root.tsx'
import { wardLoginUrl } from '../../persistence/sync.ts'
import { Shell, ShellBody, ShellTitle } from '../components/Shell.tsx'

/**
 * `/login` — a hand-off, not a screen.
 *
 * ── What this used to be, and why none of it survives ────────────────────────
 *
 * It was a username field and a password field that was never read, above two
 * plain sentences admitting that anyone who knew a username could read that
 * person's training history. The honesty was the right response to the design;
 * the design has changed. Ward authenticates a person, the service keys each
 * document on that person's subject, and there is no longer a name for a
 * stranger to guess their way in with.
 *
 * So this route takes no input. It cannot: the credential is Ward's cookie, set
 * on Ward's own page, and a password field here would be the exact dishonesty
 * the old copy was written to avoid — a box that looks like a sign-in and
 * cannot be one.
 *
 * ── It redirects rather than rendering a button ──────────────────────────────
 *
 * Arriving here always means "you are not signed in", so waiting for a click
 * would add a step to every single occurrence. The visible content is what
 * renders during the navigation, plus a link for the case where the automatic
 * one does not happen — a blocked assign, a browser that swallowed it. Without
 * it somebody is left looking at a sentence with nothing to click.
 *
 * ── The route stays, rather than being deleted ───────────────────────────────
 *
 * `plan.tsx` and `account.tsx` both `redirect({ to: '/login' })` when there is
 * no username, and those guards are correct as they stand. Keeping the path and
 * changing what it does means one edit here instead of one at every guard, and
 * an old bookmark still lands somewhere useful.
 *
 * ── It no longer works offline, and that is not a regression ─────────────────
 *
 * Signing in needs the network now, because it needs Ward. The **app** still
 * opens offline with an established session, which is the property that
 * mattered: `session.ts` reads a cached username synchronously, and nothing on
 * the session-critical path awaits anything.
 */

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginRoute,
})

function LoginRoute() {
  const href = wardLoginUrl()

  useEffect(() => {
    window.location.assign(href)
  }, [href])

  return (
    <Shell>
      <ShellTitle
        title="Signing in"
        subtitle="This app uses the estate's single sign-in."
      />
      <ShellBody>
        <p className="text-body text-tx2">
          Taking you to sign in. You will come back here afterwards.
        </p>
        <p className="mt-[var(--sp-3)]">
          <a className="text-body font-semibold underline" href={href}>
            Continue
          </a>
        </p>
      </ShellBody>
    </Shell>
  )
}
