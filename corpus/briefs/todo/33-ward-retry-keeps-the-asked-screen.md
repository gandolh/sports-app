# Task 33 — A retry after a refused Ward sign-in returns to the asked screen

## Context

Promoted 2026-10-28 from the todo
[ward-retry-keeps-the-asked-screen](../../todos/ward-retry-keeps-the-asked-screen.md).

[Brief 32](../done/32-sign-in-returns-to-the-asked-screen.md) made a sign-in
return to the screen that was asked for: `/plan` → `/login?next=%2Fplan` →
`/plan`, and the Ward button asks for a return to `<base>login?next=<path>`.
When a Ward sign-in is refused, the library on 0.3.1 sends the browser to
`/login?ward_error=…` without the `next`, so trying again lands on `/`.

The owner chose on 2026-10-27 to fix it in the library, then adopt it here. It
shipped as ward-auth **0.7.0** (`../wzd_auth` brief 42): a refused sign-in lands
on `<loginPath>?ward_error=<code>&ward_return_to=<returnTo>`, the path checked
with `isLocalPath` on both sides, and the client hands it to the app as
`useWardSignIn().returnTo`. `signIn()` does not reuse it by itself.

Both vendored copies are at **0.3.1** (`client/vendor/ward/`,
`server/vendor/ward/`). Going to 0.7.0 crosses the upgrade notes of 0.4.0 to
0.7.0 in `../wzd_auth/shared-library/CHANGELOG.md`; read each one. Two that
matter here:

- **0.4.0 turns a rename route on** as soon as you upgrade. This brief adds no
  rename screen, so pass `allowRename: false` to `wardAuth` in
  `server/ward.mjs` and keep behaviour unchanged. Offering rename is a separate
  choice for the owner.
- **0.6.0 adds migration 4** (`auth_users.disabled_at`), which runs on the next
  boot. sports-app uses `createSqliteStore`, so no store code is needed.

## Files you OWN

- `client/vendor/ward/` and `server/vendor/ward/`, regenerated with
  `npm run vendor -- <path>/vendor/ward` from `../wzd_auth` (never edited by
  hand)
- `server/ward.mjs` (`allowRename: false`, and anything else an upgrade note
  requires)
- `client/src/ui/routes/login.tsx`, `client/src/ui/routes/next.ts`
- `client/src/ui/__tests__/signin.test.tsx`, server auth tests if a note
  requires
- corpus: this brief's outcome, `corpus/wiki/status.md`,
  `corpus/wiki/decisions-identity.md` (the version), `corpus/log.md`, the todo

## Files you must NOT touch

- `../wzd_auth`: read it and run its `vendor` script, change nothing there.
- `client/src/persistence/session.ts`: the cached-username contract is unchanged.

## What to do

1. Re-vendor both copies at 0.7.0 and follow every upgrade note from 0.3.1 on.
2. On `/login`, after a `ward_error`, read `next` back out of
   `useWardSignIn().returnTo` (it is `<base>login?next=<path>`), check it with
   brief 32's rules in `next.ts`, and pass the same `returnTo` to the retry.
3. A test for the refused-then-retried path: a `ward_error` with a
   `ward_return_to` of `<base>login?next=%2Fplan` makes the Ward button pass
   that `returnTo` again (a stubbed `signIn`), and a hostile one
   (`//evil.example`) does not.

## Acceptance

- Open `/plan` signed out, start "Sign in with Ward", refuse it at Ward, then
  try again and sign in: `/plan` shows. Checked against the local Ward
  container if it runs, else by the stubbed assertion.
- Brief 32's cases still pass.
- The server boots on a copy of a 0.3.1 database and runs migration 4; local
  sign-in works.
- `npm test`, `npm run typecheck` and `npm run lint` pass; the client builds at
  `/` and under `SPORTS_APP_BASE=/sports-app/`.

## Out of scope

- A rename screen, or a disable switch for users (0.4.0 and 0.6.0 make both
  possible).
- `usernameFor` (0.5.0).
