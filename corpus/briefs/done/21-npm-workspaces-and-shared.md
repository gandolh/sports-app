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

---

## Outcome — 2026-07-29

**Done**, and it stayed a move: 610 tests, `npm run check` green from the root, precache
manifest byte-identical in content to the pre-move build, dev proxy verified live, `npm audit`
clean including `--omit=dev`. The rename-paired diff is **net negative** — 397 insertions
against 469 deletions across 83 files — which is the deleted duplication showing up as a
number.

**611 to 610 is one named deletion.** The test comparing the codec's `USERNAME_PATTERN` with
the server's reduced to `x === x` once there was one definition. Deleted rather than left
passing, because a green test that cannot fail tells the next reader the duplication is still
being watched for. The test below it survives and is *not* the same check: it runs the
server's real `checkDocument` against the codec's real `parse` over a table of names, which
proves both ends still *apply* the shared rule — something a shared definition alone does not
guarantee.

**Project references were rejected after a real spike, not by default.** `composite: true`
does work with `noEmit` plus `allowImportingTsExtensions` on TS 6.0.3 — it is not the TS-5.x
blocker it used to be. It was rejected because it buys nothing here (every config is
`noEmit`, Vite builds the bundle, Node strips types at load, so there is no emit to order)
and costs something real: a `references` array is a **second resolution graph that only `tsc`
reads**, so `tsc` and Vitest could disagree while both looked green. Source-level `.ts`
imports through the `exports` map were verified against all four consumers — `tsc`, both
Vitest projects, the Vite build, and Node at runtime — and proven not to be silently `any`
(assigning `'lunge'` to a `Pattern` produced `TS2322`).

**A spike finding that changed the config:** an *inline* project object in `test.projects`
resolves its `root` against the **process** cwd, so `npm test` from the root and from a
workspace collected different files. A *directory* entry resolves against the root config's
own location. Hence `server/vitest.config.mjs` exists rather than an inline block, verified
identical from three working directories.

**The `RungId`-in-shared / `Rung`-in-client split** was resolved on a better question than
type-vs-behaviour (everything there is a type): *does the service have to understand this
value to do its job?* `RungId` sits inside `ExerciseRecord` inside `history`, which the server
validates. A `Rung` is never resolved to the movement it names. Written out next to the type.

**Both ESLint boundary rules were proved by making them fail** — 10 errors for the new
`shared/**` block, 11 for the pre-existing `domain/**` rules at their new paths, with real
output. That matters more than it sounds: a boundary rule that silently stopped matching
after a path change is invisible in a green test run, and is the exact failure this repo uses
ESLint to prevent.

**`shared/api.ts` was deliberately not created.** The wiki listed it, but schema-driven
request/response shapes are brief 22's job, and an empty file now would be a placeholder
pretending to be a contract.

### Follow-ups the controller handled

- A stray control character in `server/__tests__/db.test.mjs` — deliberate test data for a
  username that must be rejected — made git treat the whole 14 KB file as binary and its
  diffs unreviewable. The brief said report-don't-fix, which was right; fixed afterwards as a
  one-character change to the escaped form, testing the same thing while keeping the file
  diffable.
- `architecture.md` was describing the Fastify layout as though it existed. Corrected to say
  which parts are brief 22's target.
