---
paths:
  - "server/**"
  - "shared/**"
---

# The state service and the wire contract (`server/`, `shared/`)

- `shared/` imports nothing from `node:` and nothing from `client/` or `server/`, and reads no
  `window`, `document` or `process`. It is a dependency of a browser bundle and of a Node service at
  once. It has no clock and no `Math.random` either.
- The state document is one human-readable, hand-editable JSON document per user. It holds nothing
  derived.
- `server/vendor/` is the generated Ward library: never edit it.
- The service is TypeScript in `server/src/`, built with `tsc` to `server/dist` for the image; dev and the
  tests run the `.ts` through Node's type stripping, so `npm test` needs no build. Relative imports end
  in `.ts`.
- Structure (the `code-structure` skill): `server.ts` listens, `app.ts` builds (`buildApp(deps, options)`),
  `config.ts` is the only reader of `process.env` (`n/no-process-env` is an error), cross-cutting code is a
  `fastify-plugin` plugin in `plugins/`, a feature is `features/<name>/` used through its `index.ts`, and a
  plugin never imports a feature (dependency-cruiser). No decorators, no autoload.
- Schemas are TypeBox from `shared/api.ts`, not zod: Fastify's own validator reads them. Every route
  declares one except `GET /api/state` (a pass-through: the stored bytes are the reply) and the raw-body
  `PUT /api/state` (`checkDocument` checks the string); the first is a `conventions.json` exception.
- One error handler (`plugins/errors.ts`): the body is `{ error }`, plus `limit` on a 413; Fastify's own 4xx
  keep their status; anything else is a fixed 500 and never echoes the thrown message.
- Tests sit beside the code (`*.test.ts`) and drive the real routes, signing in through
  `src/testing/auth-fixture.ts`.
- `SPORTS_APP_PUBLIC_ORIGIN` must be set, or the service refuses to start.
