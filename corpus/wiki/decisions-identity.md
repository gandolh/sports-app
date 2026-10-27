---
summary: How this app knows who is asking — local accounts on the state service with "Sign in with Ward" as a linked second way in (2026-10-13), the Ward-session-only design it revised, and the superseded shared-secret nameplate before that; why the stream key is the signed-in username and never a query parameter.
updated: 2026-10-27
---

# Decisions — identity

Split out of [technical-decisions.md](technical-decisions.md) on 2026-09-06, when the
Ward cutover made this more than one section's worth. Everything else about the stack,
the storage and the wire contract is still there.

### Accounts are the app's own, and Ward is a linked second way in
_2026-10-13, brief 25 (Ward's corpus), under [Ward's decision](../../../wzd_auth/corpus/wiki/decisions-oidc.md)._
The state service has **its own accounts**, in `auth_*` tables of the same SQLite file,
run by the vendored `ward-auth` library (`server/vendor/ward/`, version in its README).
Local sign-in never calls Ward, so the app works while Ward is down. "Sign in with Ward"
is an OpenID Connect code flow that the service finishes; a first Ward sign-in creates a
local user, and a person who already has one links Ward from `/account`. Nothing is ever
matched by username. A Ward-originated session is checked against Ward at most every 30
seconds, so a revoke ends it within 30 seconds; a local session is never checked.

**This revises "Identity is Ward's" below** on two points: the credential is the app's
own `sports_app_session` cookie rather than `ward_session`, and the stream key is the
**signed-in account's username** rather than the Ward subject. The rest of that section
stands: no `?user=`, and the `PUT` check that the document names the caller.

**The stream follows the local username, not the Ward one.** A person whose Ward name was
taken here is `alice-2` and their stream is `alice-2`. Snapshots were always a row key on
`username`, so nothing is rewritten. Two kinds of existing stream, two answers:

- **Keyed by a Ward subject** (32 hex), which is every stream written between 2026-09-06
  and accounts: here the app *does* know the subject, because it is the key. At boot the
  service creates a local user whose username and id are that subject, linked to it
  (`linkWardStreams`, idempotent), so the person's next Ward sign-in finds their history
  instead of creating an empty `alice`. The cost is that their displayed name is the hex
  string until it is renamed by hand; the library has no rename, and a stream cannot move
  without rewriting the documents inside it.
- **Keyed by a name** (`local`, or whatever was typed before Ward): only the name is known,
  never a subject. The stream is read again as soon as an account with that exact username
  exists (`npm run seed`), and Ward is linked from settings at the person's first sign-in.
  The service names these streams at startup.

**A username has to fit this app's rule** (`shared/username.ts`: lowercase, at most 32),
which is stricter than the library's, and the library has no hook to reshape a name it
creates on a first Ward sign-in. A session whose username fails the rule is refused with
`reason: "unsupported_username"` (`requireSupportedUsername` in `server/ward.mjs`) and the
sign-in page says so, rather than signing the person in to an app whose every save is a
`400`. The seed refuses such a name before writing anything. The fix, if it ever bites, is a
library hook for the first name, not a rename in this app.

**No register page.** Accounts come from the seed script (username and password from the
environment or a prompt, never a file) or from a first Ward sign-in. The login page offers
the Ward button only when the server reports Ward as configured.

**The two prefixes.** Fastify sees `/api/auth/...` everywhere. The session cookie's `Path`
and Ward's redirect URI are the browser's view of that address, which differs per
environment (nothing in development, `/sports-app-api` in the deploy), so **both come from
configuration and change together** (`SPORTS_APP_API_PREFIX`, `WARD_OIDC_REDIRECT_URI`); the
library refuses to boot if they disagree. The client reads the same prefix at build time
for the sign-in routes, because signing in has to work before any document, and so any
per-browser sync address, exists.

**The sign-in loop (brief 29's bug) is fixed here.** Route guards read the cached username
synchronously; `GET /api/auth/session` is the missing "who is this cookie" call, and the
sign-in page writes its answer to the cache whenever the session is signed in. The cache is
cleared only by an explicit log out, never by a failed or signed-out session call: an
unreachable service is not a sign-out, and the cache is what keeps the app usable offline.

**A sign-in goes on to the screen that was asked for** (brief 32, 2026-10-27). A guard
sends a signed-out visit to `/login?next=<path>`, and `/login` goes there once it has
written the cached username. Ward's return is `<base>login?next=<path>`, **never the
screen itself**: a Ward sign-in that skipped `/login` would skip the write, and the
screen's guard would send it back to `/login`, which is the loop again. `next` must be a
path inside the app (`client/src/ui/routes/next.ts`); the service checks the Ward return
again with the library's `isLocalPath`. A Ward failure still lands on a bare
`/login?ward_error=…`, so a retry after one loses `next`.

**Offline.** Opening the app still needs no network for anybody whose name is cached.
Signing in needs the service (it holds the accounts), so `/login` is no longer offline;
that is the one place the "no session-critical path may require network" rule is read as
"the app", not "every page".

**Rejected: re-keying snapshots by the user id** (always valid, 32 hex). It would have made
every document's `username` an opaque id and orphaned every stream written under a name,
which are exactly the streams a seeded account is meant to reconnect.

### ~~Authentication is a nameplate, not a boundary~~ — SUPERSEDED 2026-09-06
Username identifies a state document; the password is accepted and **discarded in the
request handler** — never stored, never compared. Storing an unchecked password buys
nothing and collects real passwords people reuse elsewhere. `/login` must work offline,
which it trivially does because there is nothing to verify.

Constant-time comparison still applies to the deployment's own shared secret, where one
exists: `timingSafeEqual` over SHA-256 digests, which is constant-time even for
wrong-length input.

> **Superseded by "Identity is Ward's" below.** The reasoning above was honest about
> what it was — and what it was is worth restating, because it is the thing that
> changed: **anyone who knew a username could read that person's training history.**
> The shared secret authenticated the *deployment*, never a person, and `?user=` let a
> caller choose whose stream to touch. That was accepted for a personal deployment on
> loopback and is not acceptable on the shared VPS.

### Identity is Ward's, and the subject is the stream key — REVISED 2026-10-13, see above
_2026-09-06._ The service authenticates a **person** from
[Ward's](../../../wzd_auth/corpus/wiki/overview.md) `ward_session` cookie: the signature
is verified locally against Ward's JWKS with the algorithm **pinned as a literal**, then
introspected for liveness with a 30-second cache. `SPORTS_APP_SYNC_SECRET`,
`POST /api/login` and the `x-sync-secret` header are gone.

**The stream key is the session's subject, and `?user=` is gone with it.** That is the
whole security change and the reason this app's cutover is worth more than any other in
the estate: it previously had no per-user boundary at all, and now a caller reads their
own stream because it is the only one they can name. The document-versus-target check on
`PUT` survives and is *stronger* than before — it used to compare two client-supplied
values, and now one side is the session.

**Authorization is a grant, not an account.** A live Ward session holding no
`sports-app` grant gets a 403. prm's registration is open to the public, so a session
held by a complete stranger is an ordinary thing for this service to receive;
authenticating without the grant check would hand them somebody's training history.

**Three failures, three codes.** 401 no session · 403 no grant (signing in again cannot
fix it) · **503 Ward unreachable**, which must never be reported as 401 — a sync client
that saw "signed out" would drop its session rather than retry.

**Offline still works, and the claim is narrower than it was.** *Signing in* now needs
the network, because it needs Ward. The **app** still opens offline for an established
session: `session.ts` reads a cached username synchronously and nothing on the
session-critical path awaits anything. What that cached name is has also changed — it is
a display cache, not an identity, because the service decides whose document a request
touches and this value cannot influence it.

**One loose end, deliberately left.** `settings.sync.secret` is still in the document
schema. Nothing sends it and the Settings screen says it is inert, but removing the
field is a schema version bump and folding that into an auth change would have put two
irreversible migrations in one release.
