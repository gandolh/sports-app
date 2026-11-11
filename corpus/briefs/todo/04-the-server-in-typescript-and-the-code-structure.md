# Task 04: The server in TypeScript, and in the house code structure

**Depends on:**

- In sports-app: brief 02, for the gate, `eslint-plugin-n`'s `no-process-env` (a warning until this brief) and `.claude/rules/server.md`.
- In the owner's skills library:
  - brief 03, *A code-structure skill for the Fastify + React apps*: the rules, `migrating-a-server.md`, `check-structure.mjs` and the dependency-cruiser and knip presets;
  - brief 16, *The Fastify servers adopt the code structure*: the method;
  - brief 15, *Enforce the base-ui and code-structure skills in every repo*: `check-structure` runs `--warn-only` until this brief is done.
- The owner's grilling of 2026-11-10:
  - Q1 (answered: every service runs from its repo's `infrastructure/Dockerfile`, which starts a file path, so renaming the entry changes the `CMD` in the same commit);
  - the technical calls: Q23 (`server/src/features/`), Q24 and Q56 (plugin options, explicit registration, no decorators), Q25 and Q53 (a schema on every route, stream and raw-body routes exempt), Q43 (one error handler), Q54 (a big store stays whole in `db/`), Q55 (where schemas live), Q28 (this repo's server gets its own conversion brief).

**Runs before:** 05. It is independent of 03; never run the two at the same time (both edit `package-lock.json` and the tests).

**Before you start:** run `brief-board guide` ([CLAUDE.md](../../CLAUDE.md)).

## Context

The owner asked on 2026-11-09 for one researched code structure, enforced in every repo. sports-app's service is **Fastify 5.12.7** already (`server/package.json`), so no move to Fastify is needed. It is also **plain JavaScript**: four `.mjs` files that no `tsc` run sees, started by `infrastructure/Dockerfile`'s `CMD ["node", "server/state-server.mjs"]` with no build step. The 2026-07-29 move to Fastify kept the files flat on purpose, to keep the 73 tests (now 93) valid ([wiki/architecture.md](../../wiki/architecture.md), the "Fastify since 2026-07-29" paragraph).

This brief does two things, in small steps: convert the service to TypeScript, built with `tsc` as the estate's other services are, then apply the parts of the code structure that fit a service this size.

### How big it is (read 2026-11-10)

| File | Lines | What |
|---|---|---|
| `server/state-server.mjs` | 773 | `createStateServer` (the app, hooks, error handler, three routes), `readConfig`, `main` (the entry) |
| `server/db.mjs` | 423 | `openSnapshotStore`: schema, the username migration, prepared statements |
| `server/ward.mjs` | 273 | the auth config, account store, Ward client, stream linking |
| `server/seed-users.mjs` | 142 | the `npm run seed` CLI |
| `server/__tests__/` | 2,194 + 66 | 3 test files (93 tests: 31, 45 and 17) and `auth-fixture.mjs` |

Source is 1,611 lines. **Own routes: three** (`GET` and `HEAD /api/health`, `GET /api/state`, `PUT /api/state`), plus the vendored `wardAuth` plugin's `/api/auth/*` routes, which are generated code and out of scope. Command: `wc -l server/*.mjs server/__tests__/*`.

That is small. So this brief applies config, the app/server split, plugins, feature folders and tests, and **does not** add a type provider, `@fastify/autoload` or decorators.

### Why the zod type provider does not apply

The skills library's rule 6 assumes zod schemas in `shared/`. sports-app's contract is **TypeBox** (`shared/api.ts`: `HealthResponse`, `StateDocumentEnvelope`, `SnapshotReceipt`, `ErrorResponse`; `@sinclair/typebox` 0.34.52), which Fastify's own AJV reads as JSON Schema. No workspace depends on zod (`grep -n zod package.json */package.json` prints nothing; the lockfile's one copy, 4.5.4 at `package-lock.json:28517`, comes in through the docs site). Rewriting the contract to zod would change `shared/` and the client codec for three routes. Decided 2026-11-10 (technical call, Q55): **keep TypeBox, not zod.** The reason is the repo's existing contract: `shared/api.ts` is TypeBox, the client codec imports it, and Fastify's AJV reads it as it is, so zod would rewrite `shared/` and the client for three routes and add a dependency nothing else here uses. Per Q55 a schema the client imports lives in `shared/`, which is where these already are. Put the rule's intent (schemas declared on the route, nothing hand-parsed) in terms of TypeBox. Report this to the skills library as a repo the zod rule doesn't fit.

### Where the routes stand against "a schema on every route"

| Route | body | response | Note |
|---|---|---|---|
| `GET /api/health`, `HEAD` | | `200`: `HealthResponse` (`state-server.mjs:462`) | already declared |
| `GET /api/state` | | **none, on purpose** | the reply is the stored bytes; a response schema would hand it to `fast-json-stringify` and re-serialise it (the route's own comment). Pass-through exception for `scripts/conventions.json`. |
| `PUT /api/state` | the raw string, checked inside the handler by `checkDocument` (TypeCompiler) | `200`: `SnapshotReceipt` (`state-server.mjs:538`) | The body cannot be a Fastify body schema: the content-type parser returns the raw text so the stored bytes are the sent bytes. Also an exception. |

The convention checker's `.parse(request.` test misses this (`checkDocument(text)` is a helper), as it did in wicket and lantern. The exception is recorded by hand.

### Every reader of the environment (read 2026-11-10)

`main(process.env)` is the only read of `process.env`, at two entries. The rest take an `env` parameter.

| Where | What |
|---|---|
| `server/state-server.mjs:769` | `main(process.env)` |
| `server/seed-users.mjs:138` | `main(process.env)` |
| `server/state-server.mjs:638, 640, 644, 646, 648` | `SPORTS_APP_PORT`, `SPORTS_APP_MAX_BODY_BYTES`, `SPORTS_APP_HOST`, `SPORTS_APP_DB`, `SPORTS_APP_QUIET` |
| `server/ward.mjs:122, 136, 137` | `SPORTS_APP_PUBLIC_ORIGIN`, `SPORTS_APP_API_PREFIX`, `SPORTS_APP_BASE` |
| `server/seed-users.mjs:97, 100, 101` | `SPORTS_APP_DB`, `SPORTS_APP_SEED_USERNAME`, `SPORTS_APP_SEED_PASSWORD` |
| the vendored `wardClientOptionsFromEnv(env)` | the `WARD_OIDC_*` values, read from the object it is handed |

`.env` is read by Node's own `--env-file-if-exists=../.env` flag in `server/package.json`'s `start` and `seed` scripts, and by compose's `env_file` in the container. There is no custom loader, so the "loaders swallow ENOENT" problem seen elsewhere does not exist here. `readAuthConfig` already fails loudly on a missing origin.

### What converting costs (measured 2026-11-10)

A scratch `tsconfig` on the existing files (`allowJs`, `checkJs`, the repo's base flags, `types: ["node"]`) ran `tsc -p server --noEmit`: **119 errors**, 25 in source (`state-server.mjs` 24, `ward.mjs` 1; `db.mjs` and `seed-users.mjs` 0, because their JSDoc is complete) and 94 in the tests (`state-server.test.mjs` 36, `auth.test.mjs` 33, `db.test.mjs` 23, `auth-fixture.mjs` 2). Most are untyped parameters (`TS7006`, 35), `unknown` caught errors (`TS18046`, 17) and possibly-undefined values. This is the "green because nothing ran" gap: 94 type errors have never been seen in the tests.

An emit check, `tsc` with `allowJs`, `rewriteRelativeImportExtensions`, `outDir`, and `rootDir` one level up, wrote only the server's own files. The `@sports-app/shared/*.ts` imports stayed as bare specifiers, which Node resolves at run time to `shared/` source and strips (Node 24.22.1 printed no warning for a `.ts` file). So a build of the server does not need a build of `shared/`, which keeps the repo's "shared ships source" rule. The image already copies `shared/` and installs the workspace link.

### Traps in moving the files

- `server/db.mjs:91-106` computes `PROJECT_ROOT` and the default `db/` directory from its own location (`..`). Moving the file deeper, or running from `dist/`, changes the default database path. `config.ts` computes it once, at the same depth under `src/` and `dist/`.
- `client/src/persistence/__tests__/codec.test.ts:58` imports `checkDocument` from `@sports-app/server/state-server.mjs`, with a `@ts-expect-error` for the untyped file. `server/package.json`'s `exports` names `./db.mjs` and `./state-server.mjs`. The export must move with `checkDocument`, and the `@ts-expect-error` goes.
- Two tests spawn the real process: `server/__tests__/state-server.test.mjs:135` and `auth.test.mjs:551` run `server/state-server.mjs`. They must run the `.ts` source through Node's type stripping, so `npm test` never needs a build (a fresh clone must pass).
- `eslint.config.js` has a Node-globals block for `server/**/*.mjs`. It goes, since `@types/node` supplies the globals, and the typed rules reach `server/` for the first time.
- `server/vitest.config.mjs` says it stays `.mjs` so that no `.ts` file escapes `tsc`. After this brief `server/` is in a tsconfig, so it becomes `.ts`.
- The Dockerfile's `proddeps` stage copies three workspace manifests, and the root `package.json` lists four workspaces (`shared`, `client`, `server`, `docs`). Step 1 records whether `docker build` passes today.

## Owner decisions

Items 1-6 and 9 are decided 2026-11-10 (technical calls, the questions named); 7, 8 and 10 are defaults no question covers.

1. **TypeScript, built with `tsc`** (Q28, a technical call, decided 2026-11-10). The service is converted, built to `server/dist`, and run from there in the container. Dev and tests run the `.ts` source directly through Node's type stripping. Alternative: run `.ts` in the image too with no build stage. It works on Node 24 and has fewer moving parts, but it breaks the estate's convention and keeps the 4 MiB-body service outside any emitted build. If the owner prefers it, drop step 3 and the Dockerfile build stage.
2. **`server/src/features/<name>/`** (Q23, decided): `health` and `state`.
3. **Typed plugin options and explicit registration** (Q24, Q56, decided): `buildApp` takes one deps object (store, accounts, auth, Ward client, config) and registers by name. No decorators (not even as a test seam: tests pass their dependencies as options), no autoload.
4. **Schemas stay TypeBox** (see above; Q25, Q53, Q55). Decided: every route has a schema except the two exceptions, the pass-through `GET /api/state` and the raw-body `PUT /api/state`, each recorded in `scripts/conventions.json`.
5. **The error body** (Q43). Decided: one error handler, keeping the repo's shape, `{ error: string }`, plus `limit` on the 413. The client reads `error` and nothing else. The handler passes Fastify's own 4xx through with their status and message, and never echoes a thrown message to the client: an unexpected error answers a fixed 500 sentence. Step 5 checks both with a test (a route that throws an error with a recognisable message, and a malformed JSON body).
6. **The entry** (Q1, a fact): `server/state-server.mjs` becomes `server/src/server.ts`, built to `server/dist/server.js`, and the Dockerfile `CMD` changes in the same commit as each step that moves it.
7. **Shutdown.** Default (no question covers it): keep the existing `process.once('SIGINT' | 'SIGTERM')` handler, which closes the server and then the database. It works and has tests; `close-with-grace` would add a dependency to do the same thing. Record it in `conventions.json` if the checker wants one.
8. **Timeouts.** Default (no question covers it): `connectionTimeout: 10_000`, `requestTimeout: 60_000` (a phone uploading a 1 MB document over a poor link), `keepAliveTimeout: 125_000` (above Caddy's idle keep-alive to its upstreams; check the deploy's snippet). **`trustProxy` is not set**: logging is off (`logger: false`) and the service never reads `request.ip`, so it would change nothing; Ward's lockout reads the socket itself. Record it.
9. **A big store** (Q54). Decided: `db.mjs` stays whole, as `server/src/db/store.ts` (a big `store.ts` stays whole in `db/`). It is not split into `open.ts` and a feature store.
10. **Fastify.** Default (no question covers it): stays 5.12.7. No bump here.

## The move map (step 6)

Paths are relative to `server/`.

| Today | Target | Note |
|---|---|---|
| `state-server.mjs` (entry half: `main`, shutdown, startup log) | `src/server.ts` | `loadConfig()`, `buildApp`, listen, the signal handlers |
| `state-server.mjs` (`createStateServer`) | `src/app.ts` | `buildApp(deps)`: plugins, then features; never listens |
| `state-server.mjs` (`onSend` headers hook) | `src/plugins/headers.ts` | `fastify-plugin` wrapped |
| `state-server.mjs` (error handler, not-found handler) | `src/plugins/errors.ts` | `fastify-plugin` wrapped; same bodies and statuses |
| `state-server.mjs` (the `GET`/`HEAD /api/health` route) | `src/features/health/routes.ts` | |
| `state-server.mjs` (the child scope, both state routes, `checkDocument`, the compiled validator) | `src/features/state/routes.ts` and `src/features/state/document.ts` | `document.ts` holds `checkDocument`, which the client test imports |
| `state-server.mjs` (`readConfig`, the defaults) | `src/config.ts` | with `readAuthConfig` from `ward.mjs` |
| `db.mjs` | `src/db/store.ts` | whole, decision 9 |
| `ward.mjs` | `src/plugins/auth/` (`index.ts` registers `wardAuth` first; `accounts.ts`, `ward-client.ts`, `streams.ts` for the rest) | `ROUTE_PREFIX`, `ALLOW_RENAME` and the cookie name stay together |
| `seed-users.mjs` | `src/seed.ts` | a CLI; `npm run seed` points at `dist/seed.js` |
| `__tests__/state-server.test.mjs` | `src/app.test.ts`, with the `readConfig` block (line 1014 on) to `src/config.test.ts` | |
| `__tests__/auth.test.mjs`, `auth-fixture.mjs` | `src/plugins/auth/auth.test.ts`, `src/testing/auth-fixture.ts` | |
| `__tests__/db.test.mjs` | `src/db/store.test.ts` | |
| `vitest.config.mjs` | `vitest.config.ts` | |
| `vendor/ward/` | unchanged | generated; imported as `../vendor/…` from `src` and from `dist` alike |

## Files you OWN

- `server/**` except `server/vendor/`.
- `server/package.json` (scripts, `exports`, the new dependencies and dev dependencies pinned: `fastify-plugin`, `@types/node`, `typescript`) and `package-lock.json`.
- `infrastructure/Dockerfile`: the build stage, the copies, the `CMD`, and its header comment (it says "no build step").
- `.dockerignore`, if co-located tests need excluding.
- The root `package.json` (`server` script, `check:conventions`), `tsconfig.json` (to reference `server`), `eslint.config.js` (the `server/**/*.mjs` block, `no-process-env` to an error), `vitest.config.ts` (the project entry).
- `client/src/persistence/__tests__/codec.test.ts:57-58` (the import and its `@ts-expect-error`), and comment-only edits where a file names `state-server.mjs` or `db.mjs`: `client/vite.config.ts:121`, `client/src/persistence/sync.ts:19, 75`, `shared/api.ts:10, 69-71`, `shared/username.ts:8`, `shared/types.ts:8`.
- `scripts/conventions.json`.
- `.dependency-cruiser.cjs` (new, from the skill's preset).
- `server/README.md`, `.claude/rules/server.md`.
- Corpus: [wiki/architecture.md](../../wiki/architecture.md) (the layout block and the "Fastify since 2026-07-29" paragraph), [wiki/technical-decisions.md](../../wiki/technical-decisions.md) (lines 59, 103, 127 name the `.mjs` files and the no-build rule), [wiki/status.md](../../wiki/status.md), [log.md](../../log.md).

## Files you must NOT touch

- `server/vendor/` and `client/vendor/`: generated.
- `shared/` behaviour: schemas, the username rule, the document types. Comment edits only.
- Behaviour: routes, statuses, headers, bodies, error words and logged lines. The 93 tests assert them.
- The deploy beyond this repo's `infrastructure/`. A vps-deploy edit, if one is needed, is handed to the owner as exact lines.

## What to do

One commit per numbered step. After each, `npm run check` and `npm test` pass, and the container's `CMD` works.

1. **Baseline.** Record:
   - `npm test` counts (the server project: 93 tests in 3 files);
   - `docker build -f infrastructure/Dockerfile .` passes or fails today, and why;
   - the scratch `tsc` count from above, re-run;
   - an unauthenticated sweep saved to a file: `GET`, `HEAD` and `POST /api/health`, `GET /api/state` and `GET /api/nothing` (both answer 401 without a session), with status and headers.
2. **`.mjs` to `.ts`, in place, no behaviour change.**
   - `git mv` each file, add `server/tsconfig.json` (extends the base, `types: ["node"]`, includes the tests), add `@types/node` (24.x, pinned), fix the 119 errors (JSDoc typedefs become interfaces, `unknown` errors are narrowed), and rewrite relative imports from `.mjs` to `.ts`.
   - `package.json`: `start` and `seed` run the `.ts` files through `node --env-file-if-exists=../.env`; `exports` names the `.ts` files.
   - The two spawn tests run `state-server.ts`.
   - `codec.test.ts` imports from the new export, and its `@ts-expect-error` goes.
   - `vitest.config.mjs` becomes `.ts`. Remove ESLint's `server/**/*.mjs` globals block.
   - Dockerfile `CMD` becomes `["node", "server/state-server.ts"]`, and the comment that says "plain .mjs" is corrected.
3. **Build with `tsc`.**
   - `server/tsconfig.build.json`: extends the base, `noEmit: false`, `outDir: dist`, `rewriteRelativeImportExtensions: true`, tests excluded. Add `build` to `server/package.json` and the root script.
   - Dockerfile: a `build` stage that installs `-w @sports-app/server` with dev dependencies (so `typescript` and `@types/node` come from the server's manifest and the client tree stays out), copies the sources, and runs the build. The `prod` stage copies `server/dist`, `server/vendor` and `server/package.json`. Copy all four workspace manifests if step 1 showed the lockfile check needs them.
   - `CMD` becomes `["node", "server/dist/state-server.js"]`. `start` runs `dist`; the root `server` script runs the source (`npm run server` still needs no build).
4. **`config.ts`.** `loadConfig(env = process.env)` returns the typed `Config`, with `readConfig`'s checks (a bad port still prints `SPORTS_APP_PORT must be a port number, got …` and exits non-zero) and `readAuthConfig`'s messages unchanged. `seed.ts` uses it too. `resolveDbFile()` computes the default path once. Turn `no-process-env` into an error outside `config.ts` and tests.
5. **Split the app from the server, and add the plugins.** `app.ts`, `server.ts`, `plugins/headers.ts`, `plugins/errors.ts`, `plugins/auth/index.ts` as in the map, with `fastify-plugin` (pinned) on the three cross-cutting plugins and the auth plugin still registered first. Rename the entry to `server.ts`, and change `CMD`, `start`, `seed` and `exports` in the same commit.
6. **Feature folders, the store and the tests**, per the map, with `git mv` so history follows. Add `.dependency-cruiser.cjs`; check that a deliberate import of `features/state/routes.js` from `plugins/` fails it.
7. **Timeouts** (decision 8), passed through `buildApp`'s options. A test reads them from `app.initialConfig`.
8. **After.** Re-run step 1's sweep and diff it. Run the 93 tests unchanged. Turn `check-structure` strict, add dependency-cruiser to `check:conventions`, and record the exceptions (the raw-body route, the pass-through reply, `trustProxy`, shutdown). Update the corpus pages and `.claude/rules/server.md`, then run `bash corpus/lint.sh` until clean.

## Acceptance

- [ ] `npx tsc -p server --noEmit` reports 0 errors, tests included. `ls server/src/**/*.mjs server/*.mjs` finds no file.
- [ ] The 93 server tests pass with no assertion changed (`git diff -w` on the moved tests shows import and fixture-path edits only), and `rm -rf server/dist && npm test` passes on a tree with no build.
- [ ] `grep -rn "process\.env" server/src --include=*.ts | grep -v "\.test\.ts"` prints only `config.ts`, and `no-process-env` is an error.
- [ ] `npm run build -w @sports-app/server` writes `server/dist/server.js`. `docker build -f infrastructure/Dockerfile .` succeeds, and a container started with `SPORTS_APP_PUBLIC_ORIGIN=http://localhost:5173` and port 8794 published answers `GET /api/health` with `{"status":"ok"}`.
- [ ] The before and after sweeps are identical, status and headers, and the diff (or "no difference") is in `log.md`.
- [ ] `check-structure` passes strict, with its exceptions in `scripts/conventions.json` and a reason for each. dependency-cruiser fails on the deliberate cross-folder import and passes clean.
- [ ] `codec.test.ts` has no `@ts-expect-error`.
- [ ] A test throws an error with a recognisable message from a route and expects the reply not to contain it, and a malformed JSON body keeps Fastify's own 4xx status (Q43).
- [ ] The conversion adds no `!` in `server/src` outside tests: the rule is an error in source and a warning in tests (Q47), and the fixes for the 25 source type errors use narrowing.
- [ ] `npm run check` passes, and `bash corpus/lint.sh` ends clean.

## Interplay

- If brief 02's knip run reports `server/package.json`'s `exports` as unused, drop the ones nothing imports. Only the client's `codec.test.ts` uses one today.
- The skills library should hear three things from this brief: its zod rule does not fit a TypeBox contract; a pass-through reply and a raw-body route are exceptions the `.parse(request.` test cannot see; and a repo may keep a "no build" rule that the tsc-built default overrides, which is why decision 1 names the alternative.

(2026-11-11, brief 02: dependency-cruiser landed there instead, as `.dependency-cruiser.cjs` and in `check:conventions`, by the controller's call. This brief keeps the cross-folder import check, drops the lowered `no-circular` there once the `ui/figures` type loop is gone, and drops the `n/no-process-env` warning on `server/seed-users.mjs` and `server/state-server.mjs` and the knip `ignoreDependencies` for `@sinclair/typebox` in `knip.config.js`.)
