# A retry after a refused Ward sign-in returns to the asked screen

Captured 2026-10-27, from brief 32's outcome.

Brief 32 made a sign-in return to the screen that was asked for:
`/plan` → `/login?next=%2Fplan` → `/plan`, and the Ward return is
`<base>login?next=<path>`. But when a Ward sign-in is refused, the library sends
the browser to `/login?ward_error=…` without the `next`, so trying again lands
on `/`.

The fix is in the library, not here. On 2026-10-27 the owner chose a Ward brief
that carries the return path through an error redirect (in `../wzd_auth`), then
adoption here. Once a ward-auth release has it:

- re-vendor `client/vendor/ward/` at that version (the vendoring steps are in
  this repo's docs);
- check that `/login?ward_error=…&next=%2Fplan` keeps `next` through the error
  notice and a retry, with the same `next` checks as brief 32's
  `client/src/ui/routes/next.ts`;
- a test for the refused-then-retried path.

Blocked on the Ward release; promote it to a brief when that lands.
