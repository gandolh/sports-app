---
summary: How the state service is built since 2026-11-11 (brief 04) — TypeScript built with tsc, the code-structure layout, TypeBox rather than zod, the error body, shutdown, timeouts and trustProxy; read before adding a route or a plugin.
updated: 2026-11-11
---

# The service's structure

*Decided 2026-11-10 (the technical calls Q1, Q23-25, Q28, Q43, Q53-56), built 2026-11-11 in brief 04.*
*Decided 2026-11-10 (the technical calls Q1, Q23-25, Q28, Q43, Q53-56), built 2026-11-11 in brief 04.*

- **TypeScript, built to `server/dist`, run from there in the container** (`CMD node server/dist/server.js`).
  Dev and the tests run `src/` through Node's type stripping, so `npm test` needs no build. The alternative,
  running `.ts` in the image with no build stage, was left because the estate's other services build.
  This overrides the 2026-07-29 "no build step" rule.
- **TypeBox, not zod.** `shared/api.ts` is TypeBox and Fastify's own validator reads it, so no type
  provider and no new dependency. Every route has a schema except two, on purpose: `GET /api/state` is a
  pass-through (a response schema would hand the stored bytes to `fast-json-stringify` and re-serialise them;
  a `scripts/conventions.json` exception) and `PUT /api/state` takes its body as the raw string (so the stored
  bytes are the sent bytes), checked by `checkDocument`.
- **Layout:** `server.ts` listens, `app.ts` builds, `config.ts` is the only reader of the environment,
  `plugins/` holds the error handler, the headers hook and the auth wiring (all `fastify-plugin`), and
  `features/health` and `features/state` are used through their `index.ts`. `db/store.ts` stays whole (Q54).
  Dependencies are plugin options and explicit registration: no decorators, no autoload.
- **Error body:** `{ error }`, plus `limit` on a 413. Fastify's own 4xx keep their status; anything else is a
  fixed `internal error` 500 that never echoes the thrown message.
- **Shutdown:** the `SIGINT`/`SIGTERM` handler closes the server, then the database. No `close-with-grace`:
  the service has no long-lived response (no stream, no long poll), so `close()` returns at once, and it
  would add a dependency to do the same thing.
- **Timeouts:** `connectionTimeout` 10 s, `requestTimeout` 60 s (a phone uploading a document over a poor
  link), `keepAliveTimeout` 125 s (above the proxy's idle upstream keep-alive). **`trustProxy` is not set:**
  logging is off and nothing reads `request.ip`; the guard's lockout reads the socket itself.
- **A start that cannot configure itself exits 1** (it used to print the reason and exit 0).
