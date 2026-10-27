# A retry after a refused Ward sign-in returns to the asked screen

Captured 2026-10-27, from brief 32's outcome.

Brief 32 made a sign-in return to the screen that was asked for:
`/plan` → `/login?next=%2Fplan` → `/plan`, and the Ward return is
`<base>login?next=<path>`. But when a Ward sign-in is refused, the library sends
the browser to `/login?ward_error=…` without the `next`, so trying again lands
on `/`.

The fix is in the library, not here. On 2026-10-27 the owner chose a Ward brief
that carries the return path through an error redirect, then adoption here. It
shipped the same day as ward-auth 0.7.0 (`../wzd_auth` brief 42): a refused
sign-in now lands on `<loginPath>?ward_error=<code>&ward_return_to=<returnTo>`,
the path checked with `isLocalPath` on both sides, and the client hands it to
the app as `useWardSignIn().returnTo`. `signIn()` does not reuse it by itself.

To adopt it:

- re-vendor `client/vendor/ward/` (and the server's copy) at 0.7.0, which also
  brings 0.5.0's `usernameFor`;
- on `/login`, after a `ward_error`, read `next` back out of
  `useWardSignIn().returnTo` (it is `<base>login?next=<path>`) and pass the same
  `returnTo` to the retry, with brief 32's `next` checks
  (`client/src/ui/routes/next.ts`);
- a test for the refused-then-retried path.

Ready to promote to a brief.
