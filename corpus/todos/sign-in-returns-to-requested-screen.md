# Sign-in returns to the screen that was asked for

**Promoted 2026-10-23** into [brief 32](../briefs/todo/32-sign-in-returns-to-the-asked-screen.md).
Delete this todo when 32 lands.

Captured 2026-10-19, while closing brief 29.

A sign-in always lands on `/`. Open `/plan` on a fresh browser and you go to `/login`,
sign in, and end up on today's session instead of the plan. Two places drop the path:

- The five route guards (`index.tsx`, `plan.tsx`, `progress.tsx`, `library.tsx`,
  `account.tsx`) `throw redirect({ to: '/login' })` without saying where the person was
  going.
- `login.tsx` navigates to `/` once the session says signed in.

The vendored hooks already carry the Ward half: `useWardSignIn().signIn({ returnTo })`
takes a same-origin path, and the service's callback lands there instead of
`afterSignInPath` (`isLocalPath` refuses `//` and backslashes, so it is not an open
redirect). A `returnTo` of `/sports-app/login?next=/plan` would keep the one place that
writes the cached username in charge.

Shape: the guards pass `search: { next: location.pathname }`, `/login` validates `next`
as a path inside the app's base and goes there, and the Ward button passes the same
path through `returnTo`. Small, but it touches all five guards and needs tests for a bad
`next`.
