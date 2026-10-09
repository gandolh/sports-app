# Task 29 — Sign-in loops on a fresh browser

## Context

Found by reading code on 2026-10-09; **not reproduced in a browser yet**. Step one
of this brief is to reproduce it.

Every route guard sends a visitor to `/login` when `localStorage` has no
`sports-app.session.v3`. `/login` hands off to Ward. Ward signs the person in and
returns them to the app. Nothing on the client writes the key after that, so the guard
fires again and the loop restarts. The deployed bundle reads and removes the key but
never writes it, so the live site behaves the same way. It was first recorded in
`corpus/log.md` under the 2026-10-09 Ward-cutover entry ("Found, not fixed: in a
browser, sign-in loops") and in `docs/getting-started.md` ("Signing in loops").

## Evidence (re-checked 2026-10-09)

- `client/src/persistence/session.ts:41` defines `SESSION_KEY = 'sports-app.session.v3'`.
  `setCurrentUsername` is at line 80. Outside `client/src/persistence/__tests__/session.test.ts`
  and the done brief 19, nothing calls it.
- `client/src/ui/routes/__root.tsx:23` sets route context from `currentUsername()`, a
  synchronous `localStorage` read.
- Guards that `throw redirect({ to: '/login' })` when that is `null`:
  `client/src/ui/routes/index.tsx:103`, `plan.tsx:230`, `progress.tsx:200`,
  `library.tsx:46`, `account.tsx:59`.
- `client/src/ui/routes/login.tsx:53-58`: `LoginRoute` calls
  `window.location.assign(wardLoginUrl())` in an effect. It never checks whether Ward
  already has a session.
- `client/src/persistence/sync.ts:85` (`WARD_LOGIN_PATH = '/ward/login'`) and `:384`
  (`wardLoginUrl`, `next` is the current path).
- `server/state-server.mjs` has three `app.route` calls: health (line 472), `GET
  /api/state` (493) and `PUT /api/state` (539). There is no endpoint that says who is
  signed in. The Ward subject is known to the server only (`server/ward.mjs`).
- `client/src/ui/routes/account.tsx:70-73`: `logOut` clears the local key and goes to
  `/login`, which sends the person straight back to Ward. It never ends the Ward
  session, so signing out may sign you straight back in. Check this while here.

## Reproduce first

1. Start the local Ward (`localhost:8792`, see `docs/getting-started.md`) and
   `npm run dev`.
2. Use a fresh browser profile, so `localStorage` is empty and there is no old
   `ward_session` cookie.
3. Open `http://localhost:5173/sports-app/`. Expect a redirect to `/login`, then Ward.
4. Sign in with a Ward account that has the `sports-app` grant.
5. Record where you land and whether the address bar keeps cycling between
   `/sports-app/login` and `/ward/login`. Check `localStorage` for the key.

If step 5 shows something else (for example Ward's callback does write the key), stop
and correct this brief before changing anything.

## Expected behaviour

After one Ward sign-in the person lands on the screen they asked for and stays there.
A reload keeps them signed in. Opening the app offline with an established session
still works, and nothing on the session-critical path awaits the network. That is a
project invariant (`corpus/CLAUDE.md`).

## Direction (owner to confirm before building)

The 2026-10-09 log entry proposes the shape: a way for the client to learn the signed-in
person, plus a `/login` that checks it before handing off. Concretely, an `/api/me` on
the state service (the estate's prm service has one) that returns the Ward subject, or
the username, for a valid session. `/login` would call it first. If it answers, call
`setCurrentUsername` and go on to `next`. If it answers 401, hand off to Ward.
Open decisions:

- Is the document key the Ward subject or a username? `isValidUsername` in
  `shared/username.ts` limits the cached value to a username-shaped string. Check what
  Ward's subject looks like and whether `/api/me` must return a derived name.
- Whether sign-out should also end the Ward session (`/ward/logout` or similar).
- Whether the service should answer `503` and not `401` when Ward is unreachable, as
  `/api/state` does, so `/login` does not loop on an outage.

## Files you OWN

- `client/src/ui/routes/login.tsx`, `client/src/persistence/session.ts`,
  `client/src/persistence/sync.ts` and their tests
- `client/src/ui/routes/account.tsx` (the sign-out handler only)
- `server/state-server.mjs`, `server/README.md` and the server tests (a new `/api/me`)
- `shared/` if the route needs a response schema
- `docs/src/content/docs/api.mdx`, `docs/getting-started.md` (drop the workaround and
  the "loops" section once fixed), `docs/diagrams/architecture.json`
  ("three routes" becomes "four") and its rebuilt HTML

## Files you must NOT touch

- `client/src/domain/**` (no change to the schedule or the clock rule)
- Ward itself, and `vps-deploy`. Any Caddy or Ward-side change is handed to the owner.
- The route guards' shape in `index.tsx`, `plan.tsx`, `progress.tsx`, `library.tsx`,
  unless the chosen design needs it.

## Acceptance checks

- On a fresh browser profile against the local Ward, one sign-in ends on the requested
  screen, with `sports-app.session.v3` set. No second trip to Ward.
- A reload keeps the session. With the network off and a prior session, `/` opens.
- A visitor with a Ward session but no `sports-app` grant gets a readable message, not
  a loop.
- Sign-out leaves the person signed out after a reload.
- `npm run check` and `npm test` pass. New tests cover `/api/me` for 200, 401, 403 and
  503, and the `/login` hand-off for both outcomes.
- The deployed bundle is not rebuilt or deployed by this brief. Deploys go to the owner.

## Out of scope

Making sync work in the dev browser, multi-account switching, and any change to what
the state service stores.
