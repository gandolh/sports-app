---
summary: How this app knows who is asking — the superseded shared-secret-and-nameplate design, and the Ward session that replaced it, including why the stream key is now the session's subject rather than a query parameter.
updated: 2026-09-06
---

# Decisions — identity

Split out of [technical-decisions.md](technical-decisions.md) on 2026-09-06, when the
Ward cutover made this more than one section's worth. Everything else about the stack,
the storage and the wire contract is still there.

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

### Identity is Ward's, and the subject is the stream key
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
