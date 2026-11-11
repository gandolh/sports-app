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
- Tests drive the real routes (`server/__tests__/`), through the fixture in `auth-fixture.mjs`.
- `server/` is plain `.mjs` for now and is linted without types. `state-server.mjs` and
  `seed-users.mjs` still read `process.env` themselves (an ESLint warning until the server takes its
  settings from one config module); add no other reader.
- `SPORTS_APP_PUBLIC_ORIGIN` must be set, or the service refuses to start.
