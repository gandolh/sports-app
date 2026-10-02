# The state service's header comment still describes the shared secret

Captured 2026-10-02, while clearing the lint errors the Ward cutover (`d2d73db`)
left behind.

`server/state-server.mjs` opens with a long design comment that predates Ward,
and several parts of it are now false:

- **The route list** names `POST /api/login` and `GET`/`PUT /api/state?user=…`.
  The login route is gone, and the stream key is the session's subject, not a
  query parameter. The code itself says both further down, around the
  `POST /api/login` is gone note and the GET/PUT handlers.
- **Guarantee 2**, "the secret is checked before any validation", describes the
  shared-secret `onRequest` hook. The Ward `onRequest` hook has the same
  position and is worth restating in its own terms.
- **Guarantee 3**, "a `?user=` / document-`username` mismatch is a 400", is now
  a mismatch between the session subject and the document.
- **"This is not a security boundary"** says anyone who knows a username can
  read that person's history. The Ward cutover made it one: per-person, with a
  grant check.
- **The Auth section** describes `SPORTS_APP_SYNC_SECRET` compared with
  `crypto.timingSafeEqual`. Neither exists now. The unused `node:crypto` import
  was removed on 2026-10-02 to clear lint; the prose was left for this.

Rewrite the header from the code, not from memory. `server/README.md` and the
docs site may carry the same drift.
