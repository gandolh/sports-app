# Task 32 — Sign-in returns to the screen that was asked for

## Context

Promoted 2026-10-23 from the todo
`todos/sign-in-returns-to-requested-screen.md` (deleted 2026-10-27 when this brief landed; git has it).

A sign-in always lands on `/`. Open `/plan` on a fresh browser and you go to `/login`,
sign in, and end up on today's session instead of the plan. Two places drop the path
(checked 2026-10-23):

- The five route guards throw `redirect({ to: '/login' })` without saying where the
  person was going:
  [`index.tsx:103`](../../../client/src/ui/routes/index.tsx),
  [`plan.tsx:230`](../../../client/src/ui/routes/plan.tsx),
  [`progress.tsx:200`](../../../client/src/ui/routes/progress.tsx),
  [`library.tsx:46`](../../../client/src/ui/routes/library.tsx),
  [`account.tsx:63`](../../../client/src/ui/routes/account.tsx).
- [`login.tsx`](../../../client/src/ui/routes/login.tsx) navigates to `/` in its
  effect once the session says signed in, after `setCurrentUsername` succeeds.

The Ward half already exists in the vendored hooks.
`useWardSignIn().signIn({ returnTo })`
([`ward-auth-react.d.ts:146-150`](../../../client/vendor/ward/ward-auth-react.d.ts))
takes a same-origin path, and the service's callback lands there instead of
`afterSignInPath`. The library's `isLocalPath` refuses `//` and backslashes, so it is not
an open redirect. Both `loginPath` and `afterSignInPath` are `${base}login`
([`server/ward.mjs:132-134`](../../../server/ward.mjs)). So the Ward return should be
`<base>login?next=<path>`, not the target screen itself: `/login` stays the one place
that writes the cached username, which is what ends the sign-in loop (see the comment at
the top of `login.tsx`).

The router runs under a base path (`SPORTS_APP_BASE=/sports-app/`, read as `basepath` in
[`App.tsx:60`](../../../client/src/ui/App.tsx)). `next` is a path inside the router (no
base); the `returnTo` handed to Ward is a path on the origin (with the base). Check what
`location.pathname` and `location.href` hold inside `beforeLoad` under a basepath before
building either one.

`/` carries search params (`v`, `i`, `d`, `done`; `validatePlayerSearch` in `index.tsx`).
Keeping them through a sign-in is not needed; the path alone is enough.

## Files you OWN

- `client/src/ui/routes/index.tsx`, `plan.tsx`, `progress.tsx`, `library.tsx`,
  `account.tsx` (the `beforeLoad` guard line only)
- `client/src/ui/routes/login.tsx`
- A small shared helper for building and checking `next`, if it keeps the five guards to
  one line each (for example `client/src/ui/routes/next.ts`)
- `client/src/ui/__tests__/signin.test.tsx` (add cases; use the existing `harness.tsx`)

## Files you must NOT touch

- `client/vendor/ward/` and `server/vendor/ward/`: vendored, regenerated from wzd_auth.
- `server/ward.mjs`: `afterSignInPath` stays `${base}login`.
- `client/src/persistence/session.ts`: the cached-username contract is unchanged.

## What to do

1. Have each guard redirect with `search: { next: <the router path that was asked for> }`.
   Leave `next` off when the path is `/`, so a plain visit still shows a clean `/login`.
2. Give the login route a `validateSearch` that keeps `next` only when it is a path
   inside the app: it starts with a single `/`, has no `//`, no backslash, no scheme,
   and is not `/login` itself. Anything else is dropped, not an error.
3. In the login effect, navigate to `next` (falling back to `/`) with `replace: true`.
4. Pass `returnTo: <base>login?next=<encoded next>` to `ward.signIn()` when `next` is set,
   so the Ward round trip comes back through `/login` and then goes on.
5. Tests: a guarded visit to `/plan` ends on `/plan` after a local sign-in; a `next` of
   `//evil.example`, `https://evil.example`, `/\evil` and `/login` each land on `/`; the
   Ward button passes the right `returnTo` (assert the argument on a stubbed `signIn`).

## Acceptance

- Open `/plan` signed out, sign in with a password: the plan shows, and Back does not
  return to `/login`.
- The same through "Sign in with Ward" lands on `/plan` (checked against the local Ward
  container, or by the stubbed `returnTo` assertion if Ward is not running).
- A visit to `/login?next=//evil.example` signs in to `/`.
- `npm test`, `npm run typecheck` and `npm run lint` pass; the client builds at `/` and
  under `SPORTS_APP_BASE=/sports-app/`.

## Out of scope

- Keeping the today screen's search params (`v`, `i`, `d`, `done`) through a sign-in.
- Any change to how the session or the cached username works.

## Outcome (2026-10-27)

**Done** (`d3f7af8`). The five guards throw `toLogin(location)`, which redirects to
`/login?next=<path>`, or to a bare `/login` from `/`. `/login` validates `next`, goes
there with `replace: true` once the username is written, and gives the Ward button
`returnTo: <base>login?next=<path>`. All of it is in `client/src/ui/routes/next.ts`.
`next` must start with a single `/` and carry no `//`, backslash, control character,
query or fragment, and it must not be `/login`.

Found: TanStack Router spreads a route's validated search **over** the raw search, so
a `validateSearch` that returns `{}` for a bad value leaves the raw `next` for
`useSearch()` to read. The first test run showed it: `//evil.example` went on to
`/evil.example`, and `https://evil.example` to `/login/https:/evil.example`. The router
never left the origin, but it did not land on `/`. `validateLoginSearch` now always sets
the key, to `undefined` when the value is unsafe.

Checked under the base path: in `beforeLoad`, `location.pathname` has no base (the
router's basepath rewrite takes it off first), so `next` is `/plan` and the router puts
the base back on when it navigates.

**Checks:** 11 new tests in `signin.test.tsx`: `/plan` signs in to `/plan` with one
history entry, the other three guarded screens give their `next`, `/` gives a clean
`/login`, the four bad values each sign in to `/`, the Ward button posts
`returnTo: /login?next=%2Fplan` (asserted on the faked `/ward/start` body, which is what
`signIn()` forwards), and a Ward landing on `/login?next=%2Fplan` is remembered and goes
on to `/plan`. `npm test` passed 1214 tests, and typecheck and lint were clean. The
client built at `/` and with `SPORTS_APP_BASE=/sports-app/`. One `npm run check` after
the commit failed one test of 1214, and its output was not kept, so which test is
unknown. The next 19 full runs passed, six of them with two suites at once.

Live, in headless Chrome against the dev server under `/sports-app/`, with a throwaway
database and account (since deleted) and Ward off: `/sports-app/plan` went to
`/sports-app/login?next=%2Fplan`, a password sign-in showed the plan ("This month"), and
Back went to the blank page the tab opened on, not `/login`. `/login?next=//evil.example`
was rewritten to `/sports-app/login` and the sign-in landed on `/sports-app/`. In that
page, `wardReturnTo('/plan')` gave `/sports-app/login?next=%2Fplan`.

**Not checked live:** the real Ward round trip. The local Ward at `localhost:8792`
refused connections, and its registered redirect URI is on port 5173, which another
session's dev server was using. The stubbed `returnTo` assertion stands in for it, as
the acceptance allows. Also open: a Ward failure lands on `/login?ward_error=…` (the
library's error page), so a retry after a refusal loses `next` and lands on `/`.
