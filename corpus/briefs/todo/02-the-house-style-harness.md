# Task 02: The house style and the quality harness

**Depends on:**

- In sports-app: nothing beyond brief 01 being merged, which keeps the lockfile diffs apart.
- In the owner's skills library:
  - brief 27, *A house style, and a quality harness that enforces it*: the `house-style` package, the `house-style` skill and the plugin's `Stop` and `PostToolUse` hooks;
  - brief 15, *Enforce the base-ui and code-structure skills in every repo*: how the convention checkers are wired and when they run `--warn-only`.
- The owner's grilling of 2026-11-10 (Q5-Q14 of the skills library's open questions, and Q47-Q51 on the Round 8 page).

**Runs before:** 03, 04 and 05. The reformat touches most of the 112 source files, and those briefs rewrite or move many of them.

**Before you start:** run `brief-board guide` ([CLAUDE.md](../../CLAUDE.md)).

## Context

On 2026-11-09 the owner made three calls for every web app they own: Base UI 1.9.0 everywhere, the whole app on Tailwind v4, and the researched conventions enforced in each repo. The skills library's brief 27 measured the house style and answered with a two-layer harness: the repo's gate (`npm run check`, `npm run check:fast`) and the Claude Code layer (the plugin's `Stop` and `PostToolUse` hooks, `.claude/rules/`, a short root `CLAUDE.md`). This brief adopts both layers in sports-app.

sports-app is one of the four **style outliers**: single quotes, no semicolons, and no formatter.

### What the repo has today (read 2026-11-10)

- **`tsconfig.base.json`** already has `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `isolatedModules`, `noUnusedLocals`, `noUnusedParameters`, and the extra three the house adds to its two strictest repos: `exactOptionalPropertyTypes`, `verbatimModuleSyntax` and `erasableSyntaxOnly`. It differs from the lineage in `module` and `moduleResolution`: `ESNext` and `bundler`, with `allowImportingTsExtensions`. Relative imports end in `.ts` (286 sites) rather than `.js`, because Node strips types and runs `shared/` source directly. **That is deliberate** (the file's own comment, lines 1-35), so this brief keeps it. **No tsconfig covers `server/`**: it is plain `.mjs` that no `tsc` run sees. Brief 04 fixes that.
- **`eslint.config.js`** (ESLint 10.8.0): `@eslint/js` recommended, `typescript-eslint` 8.65.0 recommended (untyped), `react-hooks` 7.1.1 recommended and `consistent-type-imports` on `client/src` and `shared/`, two boundary blocks (`shared/**` and `client/src/domain/**`) that use `no-restricted-imports`, `no-restricted-globals` and `no-restricted-syntax`, and a Node-globals block for `server/**/*.mjs`.
- **Scripts** (root `package.json`): `typecheck` is `npm run typecheck --workspaces --if-present && tsc --noEmit`, `lint` is `eslint .`, `test` is `vitest run`, and `check` is `typecheck && lint && test`. There is no `check:fast`, no `format`.
- **`.claude/`** holds only `settings.local.json`. **No root `CLAUDE.md`.** `corpus/CLAUDE.md` loads only once an agent reads under `corpus/`, so an agent that never opens the corpus sees neither the commands nor the invariants (no logged value reaches `prescribe()`, zero equipment, no clock in `client/src/domain/`).
- **`.npmrc`** has `save-exact=true`.
- **Tests:** vitest 4.1.12, projects `client` and `server` (`vitest.config.ts`). The server project ran 93 tests in 3 files in 6 s on 2026-11-10.

### Measured on 2026-11-10

On a scratch copy, with Prettier 3.9.10, ESLint 10.8.0, typescript-eslint 8.65.0 and TypeScript 6.0.3.

**Prettier churn.** 126 tracked files (`ts`, `tsx`, `js`, `mjs`, `cjs`, `css`, `json`, `html`; `vendor/`, the generated `docs/docs/wiki/` and `docs/static/`, lockfiles and manifests left out), 34,569 lines. Lines changed:

| `printWidth` | House format (double quotes, semicolons, `trailingComma: "all"`) | The repo's own format (`singleQuote`, `semi: false`, `trailingComma: "all"`) |
|---|---|---|
| 100 | 13,405 (38.8%), 117 files | 3,514 (10.2%), 49 files |
| 120 | 13,134 (38.0%), 117 files | 3,452 (10.0%), 72 files |
| 130 | 13,139 (38.0%), 117 files | 3,517 (10.2%), 77 files |
| 150 | 13,102 (37.9%), 117 files | 3,594 (10.4%), 85 files |

Two facts follow:

- **Moving to double quotes and semicolons is the cost, not the width.** It changes about 38% of all lines in 117 of 126 files, at any width. The owner's default (Q9) accepts that in one reformat commit; the second column says what keeping sports-app's own style would cost instead: about 10%.
- The code was written to about 100 columns (95th percentile 87, 99th 156, across 32,147 lines), so a width of 120 or 130 changes about the same lines as 100.

**The house shapes**, counted with the TypeScript parser over every tracked `ts`, `tsx`, `js`, `mjs` and `cjs` file outside `vendor/` and the generated docs (112 files):

| Shape | Count | Where |
|---|---|---|
| `enum` | 0 | |
| `any` (the keyword) | 0 | |
| non-null `!` | 59 | all in tests, 10 files: `client/src/domain/__tests__/schedule.test.ts` 15, `rig.test.ts` 11, `ladders.test.ts` 9, `motion.test.ts` 6, `codec.test.ts` 5, `contrast.test.ts` 5, `useSession.test.ts` 3, `ExerciseFigure.test.tsx` 2, `Prone.test.ts` 2, `screens.test.tsx` 1 |
| `@ts-ignore` / `@ts-expect-error` | 0 / 1 | `client/src/persistence/__tests__/codec.test.ts:57`, with a description: it imports the untyped server `.mjs`. Brief 04 removes the cause. |
| `TODO` / `FIXME` | 1 | `client/src/ui/ExerciseFigure.tsx:119`, the word in quotes inside a prose comment, not a task. Reword it. |
| `console` | 18 calls | 2 in `client/src/persistence/sync.ts:633-634` (the `warn` helper); 16 in CLIs and scripts (`docs/scripts/`, `scripts/import-library.mjs`, `server/seed-users.mjs`, `server/state-server.mjs`'s entry) |
| default exports | 7 | all configs: `client/vite.config.ts:54`, `docs/docusaurus.config.ts:82`, `docs/sidebars.ts:75`, `docs/src/components/Diagram.tsx:33`, `eslint.config.js:27`, `server/vitest.config.mjs:18`, `vitest.config.ts:12`. `Diagram.tsx` is a Docusaurus component, which its framework requires. |
| namespaces | 0 | `client/src/ui/App.tsx:75` is a `declare module` augmentation, which is erasable |
| parameter properties | 0 | |

**The six typed rules**, through `projectService`, on `client/src/**` and `shared/` (the only code a tsconfig covers; 94 files): `no-floating-promises` 0, `no-misused-promises` 0, `await-thenable` 0, `switch-exhaustiveness-check` (with `considerDefaultExhaustiveForUnions: true`) 0, `consistent-type-imports` 0, `no-unnecessary-type-assertion` **14** (12 in tests; two in source: `client/src/persistence/store.ts:602` and `client/src/ui/figures/motion.ts:345`). One unused `eslint-disable` directive was also reported. Lint time cold on this machine: 51.5 s for that run. `project` instead of `projectService` was not timed; step 1 does it.

**Not measured here:** `@vitest/eslint-plugin`, `eslint-plugin-n` and knip counts, and the typed rules on `server/` (it is outside every tsconfig until brief 04).

### A trap in the existing config

`eslint.config.js` sets `no-restricted-syntax` in the `shared/**` block and again in the `client/src/domain/**` block, each with its own selector list (the clock and `Math.random` bans). In a flat config the later matching block **replaces** a rule's options, it does not merge. A general "no `enum`" selector added to a base block would never apply in those two directories. Add the enum selector to all three lists.

## Owner decisions (defaults this brief builds)

1. **Where the configs come from** (Q6, brief 27 decision 1). Default: the `house-style` package, extended from sports-app's configs. The Docker image installs with `npm ci --omit=dev` scoped to the server, which skips dev dependencies, so a root dev dependency from a tarball URL should not reach the image. Check it with `docker build` in step 3. If Q6 goes the other way (configs copied in), the same rules land as local files with a version header.
2. **Width** (Q8, Q51). Default: the estate's one width. If it isn't settled when this runs, use 120.
3. **The reformat moves sports-app to the house quotes and semicolons** (Q9). Default: yes, in the one reformat commit: 13,134 lines at width 120. The two repo-specific rules that tests or tooling hold about formatting need checking first: `client/src/ui/__tests__/noHexColors.test.ts` reads `tokens.css`, and `contrast.test.ts` parses it. Prettier lowercases hex colours and may reflow CSS, so run both after the reformat.
4. **Markdown stays out of Prettier** (the same default as the other repos). `.prettierignore` lists `*.md`.
5. **tsconfig** (Q11). Default: the base already has `verbatimModuleSyntax`, `erasableSyntaxOnly` and `exactOptionalPropertyTypes`. Add nothing. The `bundler` module setting and the `.ts` import suffixes stay (see above), recorded as the repo's exception in its decisions and in `scripts/conventions.json`.
6. **Typed lint** (Q12), through `projectService`. The 14 `no-unnecessary-type-assertion` findings are fixed in step 4.
7. **The house shapes as errors** (Q13, Q47). Default: errors in source, and `no-non-null-assertion` a **warning in tests**, so the 59 `!` in tests stay and are listed. `no-console` is an error outside CLIs and scripts, with `client/src/persistence/sync.ts`'s two calls given an `eslint-disable-next-line` with a reason (the sync warning is the user-visible log of a failed background save), or routed through one logger.
8. **`check:fast`** (Q10). Default: a typecheck plus ESLint on the changed files, under about 15 s warm with one changed file. The typed lint on 94 files took 51 s cold, so measure the warm single-file time before accepting the default.
9. **The Claude Code layer** (Q7). Default: the plugin's hooks.
10. **A root `CLAUDE.md`.** Default: create one, and move the repo-wide hard rules and the brief-board section out of [corpus/CLAUDE.md](../../CLAUDE.md) into it.

## Files you OWN

- `eslint.config.js`.
- New: the Prettier config, `.prettierignore`, `.git-blame-ignore-revs`, `scripts/check-fast.mjs` if the package ships none.
- The root `package.json` (scripts, devDependencies) and `package-lock.json`.
- The reformat: whitespace and quote changes to every file Prettier covers.
- The fixes the new rules ask for: the 14 redundant assertions, the `TODO` wording at `client/src/ui/ExerciseFigure.tsx:119`, and anything else a typed rule finds, fixed or listed.
- New: `.claude/rules/client.md`, `.claude/rules/server.md`, `CLAUDE.md`.
- [corpus/CLAUDE.md](../../CLAUDE.md): its hard rules and brief-board section move out.
- `scripts/conventions.json` (new), for the module-setting exception.
- Corpus: [wiki/technical-decisions.md](../../wiki/technical-decisions.md) (a new entry), [wiki/status.md](../../wiki/status.md), [log.md](../../log.md).

## Files you must NOT touch

- Behaviour. Apart from the fixes above, every change is formatting or configuration. In particular `prescribe()` and everything under `client/src/domain/`.
- `client/vendor/` and `server/vendor/`: generated copies of the Ward library, ignored by ESLint and Prettier.
- `server/*.mjs` structure and `server/package.json`: brief 04. The reformat does change their text.
- The skills library and the `house-style` repo.

## What to do

One commit per step, each with `npm run check` and `npm run build` green.

1. **Measure first.** Record in the `log.md` entry: the typed rules' counts (above, re-run), lint time with `projectService` against `project`, knip's findings, `@vitest/eslint-plugin` recommended's count, and warm `check:fast` time. A rule that finds more than about 20 real problems, or mostly false ones, goes back to the owner before it is turned on.
2. **Prettier, and the reformat.**
   1. Add `prettier` (pinned) and the config (`printWidth` per decision 2, double quotes, semicolons, `trailingComma: "all"`).
   2. Add `.prettierignore`: `*.md`, `**/vendor/`, `package-lock.json`, `**/dist/`, `**/dev-dist/`, `coverage/`, `docs/.docusaurus/`, `docs/docs/wiki/`, `docs/static/`, `server/data/`, `client/public/`.
   3. Add `format` and `format:check` scripts, and commit that alone.
   4. Run `npm run format` and commit only that, as `style: format with Prettier`. Run `noHexColors.test.ts` and `contrast.test.ts` after.
   5. Add that commit's hash to `.git-blame-ignore-revs`, in its own commit. Hand the owner `git config blame.ignoreRevsFile .git-blame-ignore-revs`.
3. **ESLint.** Extend the house config (decision 1), passing the roots (`client/src`, `shared`, the CLIs: `server/seed-users.mjs`, `scripts/`, `docs/scripts/`). The diff against today's config:

   | Rule | Today | After | Findings today |
   |---|---|---|---|
   | the six typed rules | off | error, `projectService` | 14 (`no-unnecessary-type-assertion`) |
   | `no-non-null-assertion` | off | error in source, warn in tests | 0 in source, 59 in tests |
   | `no-restricted-syntax` on `TSEnumDeclaration` | off | error, **added to the `shared/` and `domain/` lists too** | 0 |
   | `no-warning-comments` (`todo`, `fixme`), pointing at `corpus/todos/` | off | error | 1 (reword) |
   | `no-console` outside CLIs and scripts | off | error | 2 (`sync.ts`) |
   | `no-default-export` outside `*.config.*` | off | error | 0 (`Diagram.tsx` needs an exception: Docusaurus) |
   | `no-process-env` outside `config.ts` | off | warn on `server/`; brief 04 makes it an error | 2 (`main(process.env)` at `server/state-server.mjs:769` and `server/seed-users.mjs:138`) |
   | `@vitest/eslint-plugin` recommended on tests | off | error | step 1 |
   | `no-explicit-any`, `ban-ts-comment` | error | unchanged | 0 |
   | `react-hooks` recommended | on | unchanged | 0 |
   | `better-tailwindcss` | absent | brief 03 adds it | |

   The existing `shared/` and `client/src/domain/` boundary blocks stay exactly as they are, apart from the enum selector.
4. **Fix the findings:** the 14 redundant assertions, the one comment.
5. **The gate.** `check` runs `typecheck`, `lint`, `format:check`, `check:conventions` (knip, plus the two convention checkers, `--warn-only` until briefs 03 and 04) and `test`. `check:fast` runs `typecheck`, then ESLint on the files changed against `HEAD` plus untracked ones. No shell-only syntax. `lint` stays `eslint .`. Time both.
6. **`.claude/rules/`**, each under about 40 lines, with `paths:` frontmatter.
   - **`client.md`** (`client/src/**`): `prescribe()` is a pure function of `sessionsDone` and nothing logged reaches it; `client/src/domain/` reads no clock and no browser API (dates come in through `persistence/`); the dependency direction `ui` to `session` to `domain` to `shared`; no hex colours outside `ui/tokens.css`; Base UI through wrappers; zero equipment.
   - **`server.md`** (`server/**`, `shared/**`): `shared/` imports nothing from `node:` or the runtimes; the state document is one hand-editable JSON per user; `server/vendor/` is generated; tests drive the real routes.
7. **`CLAUDE.md`** at the root, under about 60 lines: what the app is; read [corpus/index.md](../../index.md) first; the commands (`npm run dev`, `npm run server`, `npm run check` before every hand-back, `npm run check:fast`, one test with `npx vitest run <file>`, `npm run seed`); the places that mislead (the server has no tsconfig until brief 04, `SPORTS_APP_PUBLIC_ORIGIN` must be set or the service refuses to start, `.env` is read from the repo root); the moved hard rules.
8. **Corpus.** A `technical-decisions.md` entry, "The house style, formatted and checked" (width, config source, the module-setting exception, what was rejected). Update [wiki/status.md](../../wiki/status.md) and [log.md](../../log.md). Run `bash corpus/lint.sh` until clean.

## Acceptance

- [ ] `npm run check` passes. Its time and `check:fast`'s (warm, one changed file) are in the outcome note.
- [ ] `npx prettier --check .` passes, and `git diff -w --ignore-blank-lines <hash>^ <hash> -- '*.ts' '*.tsx'` shows only quote, semicolon and wrapping changes (spot-check, with the count of changed lines in the outcome note). The hash is in `.git-blame-ignore-revs`.
- [ ] `npx vitest run client/src/ui/__tests__/noHexColors.test.ts client/src/ui/__tests__/contrast.test.ts` passes after the reformat.
- [ ] ESLint reports zero errors with every rule in step 3's table. Counts before and after are in the outcome note, with each finding left and its reason.
- [ ] A deliberate `enum` in `shared/types.ts`, a `!` in `client/src/ui/App.tsx`, a `console.log` in `client/src/ui/App.tsx`, a `// TODO` and an `export default` each fail `npm run lint`. Revert them after.
- [ ] `.claude/rules/client.md` and `server.md` exist with `paths:` frontmatter. The root `CLAUDE.md` is under about 60 lines and lists `npm run check`.
- [ ] `docker build -f infrastructure/Dockerfile .` succeeds.
- [ ] `bash corpus/lint.sh` ends clean.

## Interplay

- Brief 03 adds `better-tailwindcss` and drops `check-base-ui`'s `--warn-only`. Brief 04 puts `server/` under a tsconfig, so the typed rules reach it, drops `check-structure`'s `--warn-only` and turns `no-process-env` into an error.
- The reformat changes `client/src/ui/tokens.css` (559 lines, tested by two tests) and `client/index.html`'s blocking theme script. Brief 03's theme step edits both after this brief.
