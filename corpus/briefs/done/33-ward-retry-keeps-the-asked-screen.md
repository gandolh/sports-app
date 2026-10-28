# Task 33 — A retry after a refused Ward sign-in returns to the asked screen

## Context

Promoted 2026-10-28 from the todo
`todos/ward-retry-keeps-the-asked-screen.md` (deleted 2026-10-28 when this brief landed; git has it).

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

## Outcome (2026-10-28)

**Done** (`9f6cd4d`). Both vendored copies are ward-auth 0.7.0, written by
`npm run vendor` in `../wzd_auth` and byte-identical to each other. `../wzd_auth`
was left clean. The upgrade notes, in order:

- **0.4.0:** the rename route stays off. `wardAuth` is registered in
  `server/state-server.mjs`, not in `server/ward.mjs` as this brief says. So
  `ward.mjs` holds the decision and its reason (`ALLOW_RENAME = false`; the stream is
  keyed by the username), and `state-server.mjs` passes it as `allowRename`. That
  one-line change in `state-server.mjs` is outside this brief's file list.
- **0.5.0:** `usernameFor` is not used. Two comments in `ward.mjs` that said the
  library had no such hook and no rename now say what is true.
- **0.6.0:** migration 4 runs on boot through `createSqliteStore`. The session's `user`
  now carries `disabled: false`. No test compared a whole user, so no test changed.
- **0.6.1:** nothing to do.
- **0.7.0:** `/login` reads `next` from `useWardSignIn().returnTo` when the address bar
  has none (`nextFromWardReturn` in `next.ts`). The value counts only when it is
  exactly `<base>login?next=…`, and that `next` must pass `appPath`. The Ward retry
  rebuilds its `returnTo` with `wardReturnTo`, which gives the same string for any
  return this app made. A **password** sign-in after a refusal also goes on to that
  `next`. The brief only asked for the Ward retry, but both are a retry from the same
  page.

**Checks:**

- `signin.test.tsx` has three new tests, eight cases in all:
  - The round trip with the service faked. A signed-out `/plan` posts
    `returnTo: /login?next=%2Fplan`. The refusal lands with that return, and the retry
    posts the same body. A Ward landing on that return then shows `/plan`.
  - A password sign-in after a refusal lands on `/plan`.
  - Six carried returns are not used again: `//evil.example`,
    `https://evil.example`, `/login?next=//evil.example`,
    `/login?next=https://evil.example`, `/login?next=/login`, and `/plan`.
- The positive tests fail with the `login.tsx` change backed out. Three hostile cases
  fail when `nextFromWardReturn` skips `appPath`. Brief 32's 11 tests still pass.
- `auth.test.mjs` pins the rename route at `404` for a signed-in user. That test fails
  with `allowRename: true`.
- `npm run check` passed on the commit: 1223 tests, typecheck clean, lint clean. The client built at
  `/` and with `SPORTS_APP_BASE=/sports-app/`.

**Migration 4, on a copy.** The 0.3.1 server, before re-vendoring, built a database in
the scratchpad: a seeded account, migrations 1 to 3, and one stored document. Then the
0.7.0 server booted on a copy of it. It ran `4 user_disabled_at` (`disabled_at` null).
A password sign-in worked, the stored document read back byte for byte, a wrong
password got `401`, and `POST /api/auth/username` got `404`.

**Live, in headless Chrome**, against the built client under `/sports-app/`
(`vite preview`) and the real server on another copy, with Ward off:

- `/sports-app/plan` went to `/sports-app/login?next=%2Fplan`.
- The landing a refusal comes back to,
  `/sports-app/login?ward_error=access_denied&ward_return_to=%2Fsports-app%2Flogin%3Fnext%3D%252Fplan`,
  showed the refusal message, and the address bar became `/sports-app/login`.
- A password sign-in there landed on `/sports-app/plan`, showing "This month".

**Not checked live:** the real round trip with a refusal at Ward. The local Ward
container was not running and was not started for this. The faked-service tests stand
in for it, as the acceptance allows. It is an owner check: open `/plan` signed out,
start "Sign in with Ward", refuse at Ward, try again, sign in, and `/plan` shows.

**Left as it is:** the address bar after a refusal is a bare `/login`, so a reload of
that page loses the `next`. The library keeps the return in memory only, by design.
