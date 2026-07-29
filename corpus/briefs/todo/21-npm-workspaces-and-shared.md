# Task 21 — Three npm workspaces, and a `shared` package that ends a duplication

## Context

The repo is one package with `src/` and `server/` side by side. It becomes **three npm
workspaces: `client`, `server`, `shared`** (user's call, 2026-07-29). Read
[wiki/architecture.md](../../wiki/architecture.md#layout--three-npm-workspaces) — it has
the target layout — and
[wiki/technical-decisions.md](../../wiki/technical-decisions.md#three-npm-workspaces-client--server--shared).

**This brief is a move, not a rewrite.** The server stays on `node:http` for now; brief 22
swaps it to Fastify afterwards. Keeping those separate is deliberate: this brief must end
with **every one of the 611 tests still passing**, which is only a meaningful signal if
nothing else changed at the same time.

**`shared/` has a specific job and it is not "a place for common code".** It exists to kill
a duplication the build was already papering over: the username rule lives in *both*
`server/db.mjs` and `src/persistence/codec.ts`, kept honest by a test that asserts the two
regexes match. One definition imported twice is strictly better than two definitions plus a
test that they agree.

## Files you OWN

Effectively the whole tree, since this is a move. Specifically:

```
package.json                 workspaces root — scripts that fan out
shared/                      NEW workspace
client/                      everything currently under src/, public/, index.html
server/                      moved, still node:http
tsconfig*.json               per-workspace configs
eslint.config.js             paths updated for the new layout
vite.config.ts               moves into client/
.npmrc  .gitignore           as needed
```

## Files you must NOT touch

**Do not change any behaviour.** No refactors of opportunity, no "while I'm here" fixes, no
test rewrites beyond import paths. If you find a bug, report it; do not fix it in this
brief. A behavioural change hidden inside a 100-file move is close to unreviewable.

## What goes in `shared/`

**Data shapes and validation. Never behaviour.**

- `Pattern`, `Variant`, `TargetUnit`, `IsoTimestamp`, `RungId`, `Range`
- `ExerciseRecord`, `SessionResult`, `Settings`, `SyncSettings`, `StateDoc`
- `CURRENT_SCHEMA_VERSION`
- The username rule: `USERNAME_PATTERN`, `USERNAME_MAX_LENGTH`, `USERNAME_RULE`,
  `isValidUsername`, `LEGACY_USERNAME` — **one copy**, deleted from both current homes
- `isPattern`, `isVariant` (pure guards over the above)

**Stays in the client**, because the server has no business knowing it: `LADDERS`, `CARDIO`,
`ROTATION`, `DAILY_BLOCK`, `slotAt`, `Rung`, `Ladder`, `Modifier`, `POSTURAL_NOTICE`, and
everything in `schedule.ts`, `milestones.ts`, `ladders.ts`. Putting training content in
`shared/` would make the service depend on ladders it never reads.

**Judgement call for you:** `Rung`/`Ladder`/`Modifier` are types, not behaviour, so they
*could* go in `shared/`. They should not — the server never sees a rung. But `RungId`
appears inside `ExerciseRecord`, which the server does validate, so `RungId` goes in shared
while `Rung` stays in the client. State that split in a comment; it looks arbitrary and is
not.

### The hard constraint on `shared/`

**No `node:` imports. No DOM. No behaviour.** It is a dependency of a browser bundle and of
a Node service simultaneously. Enforce it the way this repo enforces its other boundary —
**an ESLint rule, not a comment.** `eslint.config.js` already restricts imports and globals
for `src/domain/**`; add an equivalent block for `shared/**`. A comment saying "don't import
node here" is exactly the thing that stops being true.

## What to get right

1. **The workspace root must not become a fourth package.** Root `package.json` holds
   `workspaces`, the shared devDependencies (TypeScript, ESLint, Vitest), and scripts that
   fan out. `npm run check` must still run typecheck + lint + tests across everything, and
   still be one command.
2. **All dependencies stay exactly pinned** — `.npmrc` sets `save-exact=true`. Keep the
   `overrides` entry for `brace-expansion` at the root; it clears 8 advisories via
   `workbox-build`. Re-run `npm audit` at the end.
3. **TypeScript stays at 6.0.3.** `typescript-eslint` peer-requires `<6.1.0`, and the
   import-boundary rule is the entire reason ESLint is in this project. Do not upgrade it.
   Decide whether to use project references or plain per-workspace configs and say why —
   references are the "correct" answer and also the one that most often breaks a Vitest run,
   so make the call deliberately.
4. **`vite.config.ts` must keep importing `defineConfig` from `vitest/config`**, not `vite`,
   or the `test` block fails typecheck (TS2769). It moves into `client/`.
5. **The PWA still works.** `vite-plugin-pwa` paths, `public/fonts/`, and the precache
   manifest all move. `npm run build` must still emit a service worker with the font in the
   precache, and the app must still be installable.
6. **`db/` stays gitignored** and the server still resolves it outside any bundle output.
7. **The dev proxy still works** — the client dev server proxies `/api` to the service.

## Acceptance

- `npm run check` green from the repo root: typecheck, lint, and **all 611 tests**. The
  count may only change if you deleted a now-redundant test, and if you do, name it and say
  why.
- **The username-rule duplication is gone**: exactly one definition, imported by client and
  server. The test that asserted the two regexes matched should now be deleted as
  meaningless — say so explicitly rather than leaving it passing trivially.
- `npm run build` emits a working service worker; `npm audit` clean.
- An ESLint rule fails the build if anything in `shared/**` imports `node:*`, touches a DOM
  global, or imports from `client/` or `server/`. **Prove it by temporarily adding a
  violation and showing the failure**, then remove it.
- The existing `client/src/domain/**` purity rules still fire after the move — same proof.
- `git status` shows the moves as renames where possible (`git mv`), so the diff is
  reviewable.
- **Report the workspace dependency graph** and confirm `shared/` depends on nothing.
