# Task 02: The house style and the quality harness

**Depends on:**

- In sports-app: nothing beyond brief 01 being merged, which keeps the lockfile diffs apart.
- In the owner's skills library:
  - brief 27, *A house style, and a quality harness that enforces it*: the `house-style` source (vendored into each repo, Q6), the `house-style` skill and the plugin's `Stop` and `PostToolUse` hooks;
  - brief 15, *Enforce the base-ui and code-structure skills in every repo*: how the convention checkers are wired and when they run `--warn-only`.
- The owner's grilling of 2026-11-10: the owner's answers and the technical calls on Q5-Q14 and Q47-Q51. The decisions below say which each one settles.

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

- **Moving to double quotes and semicolons is the cost, not the width.** It changes about 38% of all lines in 117 of 126 files, at any width. The owner accepted that on 2026-11-10 (Q9) as one reformat commit; the second column says what keeping sports-app's own style would cost instead: about 10%.
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

## Owner decisions

Decided 2026-11-10 (technical calls, each with the question's number; the owner may overrule):

1. **Where the configs come from** (Q5-Q6). `house-style` is **vendored**, not a git, `github:` or tarball dependency: a copy of its configs with a version header at the repo root, refreshed by a `house-style:sync` script that finds the `house-style` checkout by name. sports-app's configs extend the copy. The Docker image installs with `npm ci --omit=dev` scoped to the server, so nothing here reaches it; step 4 still checks it with `docker build`.
2. **Width** (Q8, Q51). **120**, the estate's one width. At 120 the reformat changes 13,134 lines (38.0%) in 117 files.
3. **The reformat moves sports-app to the house quotes and semicolons** (Q9). Decided: yes, in the one reformat commit, about 38% of lines at width 120 (the table above). The two repo-specific rules that tests or tooling hold about formatting need checking first: `client/src/ui/__tests__/noHexColors.test.ts` reads `tokens.css`, and `contrast.test.ts` parses it. Prettier lowercases hex colours and may reflow CSS, so run both after the reformat.
4. **Markdown stays out of Prettier** (Q45). `.prettierignore` lists `*.md`.
5. **tsconfig** (Q11, Q50). The base already has `verbatimModuleSyntax`, `erasableSyntaxOnly`, `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`. Add nothing. The `bundler` module setting and the `.ts` import suffixes stay (see above), recorded as the repo's exception in its decisions and in `scripts/conventions.json`.
6. **Typed lint** (Q12), through `projectService`. `no-floating-promises` names `node:test`'s `describe`/`it`/`test` in `allowForKnownSafeCalls`, which this repo, on vitest, doesn't need. The 14 `no-unnecessary-type-assertion` findings are fixed in step 5.
7. **The house shapes as errors** (Q13, Q14, Q47). Errors in source, and `no-non-null-assertion` a **warning in tests**, so the 59 `!` (all in tests) stay and are listed. `!` never appears in source today, so none is fixed. `no-console` is an error outside CLIs and scripts, with `client/src/persistence/sync.ts`'s two calls given an `eslint-disable-next-line` with a reason (the sync warning is the user-visible log of a failed background save), or routed through one logger. A default export is allowed where a framework needs one (configs, `Diagram.tsx`). Comments are prose, checked by the review gate.
8. **`check:fast`** (Q10). A typecheck plus ESLint on the changed files, built incrementally; target 15 s, and up to about 30 s is accepted where the typed lint is slower. The typed lint on 94 files took 51 s cold, so record the warm single-file time.
9. **The Claude Code layer** (Q7). The plugin's hooks: `Stop` runs `check:fast`, `PostToolUse` formats the saved file.
10. **A root `CLAUDE.md`** (Q46). A short root `CLAUDE.md` with the commands. Create it, and move the repo-wide hard rules and the brief-board section out of [corpus/CLAUDE.md](../../CLAUDE.md) into it.

## Files you OWN

- `eslint.config.js`.
- New: the vendored `house-style` copy and the `house-style:sync` script, the Prettier config, `.prettierignore`, `.git-blame-ignore-revs`, `scripts/check-fast.mjs` if the package ships none.
- The root `package.json` (scripts, devDependencies) and `package-lock.json`.
- The reformat: whitespace and quote changes to every file Prettier covers.
- The fixes the new rules ask for: the 14 redundant assertions, the `TODO` wording at `client/src/ui/ExerciseFigure.tsx:119`, and anything else a typed rule finds, fixed or listed.
- New: `.claude/rules/client.md`, `.claude/rules/server.md`, `CLAUDE.md`.
- [corpus/CLAUDE.md](../../CLAUDE.md): its hard rules and brief-board section move out.
- `scripts/conventions.json` (new): the module-setting exception and the checker roots.
- Corpus: [wiki/technical-decisions.md](../../wiki/technical-decisions.md) (a new entry), [wiki/status.md](../../wiki/status.md), [log.md](../../log.md).

## Files you must NOT touch

- Behaviour. Apart from the fixes above, every change is formatting or configuration. In particular `prescribe()` and everything under `client/src/domain/`.
- `client/vendor/` and `server/vendor/`: generated copies of the Ward library, ignored by ESLint and Prettier.
- `server/*.mjs` structure and `server/package.json`: brief 04. The reformat does change their text.
- The skills library and the `house-style` repo.

## What to do

One commit per step, each with `npm run check` and `npm run build` green.

1. **Vendor `house-style`.** Copy its configs in with a version header and add the `house-style:sync` script (decision 1). Commit alone.
2. **Measure first.** Record in the `log.md` entry: the typed rules' counts (above, re-run), lint time with `projectService` against `project`, knip's findings, `@vitest/eslint-plugin` recommended's count, and warm `check:fast` time. A rule that finds more than about 20 real problems, or mostly false ones, goes back to the owner before it is turned on.
3. **Prettier, and the reformat.**
   1. Add `prettier` (pinned) and the config (`printWidth` 120 (decision 2), double quotes, semicolons, `trailingComma: "all"`).
   2. Add `.prettierignore`: `*.md`, `**/vendor/`, `package-lock.json`, `**/dist/`, `**/dev-dist/`, `coverage/`, `docs/.docusaurus/`, `docs/docs/wiki/`, `docs/static/`, `server/data/`, `client/public/`.
   3. Add `format` and `format:check` scripts, and commit that alone.
   4. Run `npm run format` and commit only that, as `style: format with Prettier`. Run `noHexColors.test.ts` and `contrast.test.ts` after.
   5. Add that commit's hash to `.git-blame-ignore-revs`, in its own commit. Hand the owner `git config blame.ignoreRevsFile .git-blame-ignore-revs`.
4. **ESLint.** Extend the house config (decision 1), passing the roots (`client/src`, `shared`, the CLIs: `server/seed-users.mjs`, `scripts/`, `docs/scripts/`). The diff against today's config:

   | Rule | Today | After | Findings today |
   |---|---|---|---|
   | the six typed rules | off | error, `projectService` | 14 (`no-unnecessary-type-assertion`) |
   | `no-non-null-assertion` | off | error in source, warn in tests | 0 in source, 59 in tests |
   | `no-restricted-syntax` on `TSEnumDeclaration` | off | error, **added to the `shared/` and `domain/` lists too** | 0 |
   | `no-warning-comments` (`todo`, `fixme`), pointing at `corpus/todos/` | off | error | 1 (reword) |
   | `no-console` outside CLIs and scripts | off | error | 2 (`sync.ts`) |
   | `no-default-export` outside `*.config.*` | off | error | 0 (`Diagram.tsx` needs an exception: Docusaurus) |
   | `no-process-env` outside `config.ts` | off | warn on `server/`; brief 04 makes it an error | 2 (`main(process.env)` at `server/state-server.mjs:769` and `server/seed-users.mjs:138`) |
   | `@vitest/eslint-plugin` recommended on tests | off | error | step 2 |
   | `no-explicit-any`, `ban-ts-comment` | error | unchanged | 0 |
   | `react-hooks` recommended | on | unchanged | 0 |
   | `better-tailwindcss` | absent | brief 03 adds it | |

   The existing `shared/` and `client/src/domain/` boundary blocks stay exactly as they are, apart from the enum selector.
5. **Fix the findings:** the 14 redundant assertions, the one comment.
6. **The gate.** `check` runs `typecheck`, `lint`, `format:check`, `check:conventions` (knip, plus the two convention checkers, `--warn-only` until briefs 03 and 04) and `test`. `check:fast` runs `typecheck`, then ESLint on the files changed against `HEAD` plus untracked ones. No shell-only syntax. `lint` stays `eslint .`. Time both.
7. **`.claude/rules/`**, each under about 40 lines, with `paths:` frontmatter.
   - **`client.md`** (`client/src/**`): `prescribe()` is a pure function of `sessionsDone` and nothing logged reaches it; `client/src/domain/` reads no clock and no browser API (dates come in through `persistence/`); the dependency direction `ui` to `session` to `domain` to `shared`; no hex colours outside `ui/tokens.css`; Base UI through wrappers; zero equipment.
   - **`server.md`** (`server/**`, `shared/**`): `shared/` imports nothing from `node:` or the runtimes; the state document is one hand-editable JSON per user; `server/vendor/` is generated; tests drive the real routes.
8. **`CLAUDE.md`** at the root, under about 60 lines: what the app is; read [corpus/index.md](../../index.md) first; the commands (`npm run dev`, `npm run server`, `npm run check` before every hand-back, `npm run check:fast`, one test with `npx vitest run <file>`, `npm run seed`); the places that mislead (the server has no tsconfig until brief 04, `SPORTS_APP_PUBLIC_ORIGIN` must be set or the service refuses to start, `.env` is read from the repo root); the moved hard rules.
9. **Corpus.** A `technical-decisions.md` entry, "The house style, formatted and checked" (width, config source, the module-setting exception, what was rejected). Update [wiki/status.md](../../wiki/status.md) and [log.md](../../log.md). Run `bash corpus/lint.sh` until clean.

## Acceptance

- [ ] `npm run check` passes. Its time and `check:fast`'s (warm, one changed file) are in the outcome note.
- [ ] The vendored `house-style` copy carries a version header, `house-style:sync` refreshes it, and no `house-style` entry is in a `package.json` or the lockfile.
- [ ] `npx prettier --check .` passes at width 120, and `git diff -w --ignore-blank-lines <hash>^ <hash> -- '*.ts' '*.tsx'` shows only quote, semicolon and wrapping changes (spot-check, with the count of changed lines in the outcome note). The hash is in `.git-blame-ignore-revs`.
- [ ] `npx vitest run client/src/ui/__tests__/noHexColors.test.ts client/src/ui/__tests__/contrast.test.ts` passes after the reformat.
- [ ] ESLint reports zero errors with every rule in step 4's table (the 59 test `!` are warnings, Q47). Counts before and after are in the outcome note, with each finding left and its reason.
- [ ] A deliberate `enum` in `shared/types.ts`, a `!` in `client/src/ui/App.tsx`, a `console.log` in `client/src/ui/App.tsx`, a `// TODO` and an `export default` each fail `npm run lint`. Revert them after.
- [ ] `.claude/rules/client.md` and `server.md` exist with `paths:` frontmatter. The root `CLAUDE.md` is under about 60 lines and lists `npm run check`.
- [ ] `docker build -f infrastructure/Dockerfile .` succeeds.
- [ ] `bash corpus/lint.sh` ends clean.

## Interplay

- Brief 03 adds `better-tailwindcss` and drops `check-base-ui`'s `--warn-only`. Brief 04 puts `server/` under a tsconfig, so the typed rules reach it, drops `check-structure`'s `--warn-only` and turns `no-process-env` into an error.
- The reformat changes `client/src/ui/tokens.css` (559 lines, tested by two tests) and `client/index.html`'s blocking theme script. Brief 03's theme step edits both after this brief.

## Outcome

Built on 2026-11-11 on `main`, committed and not pushed.

- **Commits, in order:** vendor house-style 1.1.0 and pin its tools; Prettier at width 120; `style: format with Prettier`; the blame ignore file; the fixes the rules found; the house ESLint config; a follow-up that keeps one fixture's literal type; the gate; the root `CLAUDE.md` and `.claude/rules/`; the corpus.
- **Checks:** `npm run check` exits 0 (35 s warm); `check:fast` with one changed file 10 s warm; `npm run house-style:sync -- --check` exits 0; `npx prettier --check .` exits 0; 1,223 tests pass; `npm run build` passes; `noHexColors` and `contrast` tests pass after the reformat. A deliberate `enum` in `shared/types.ts`, a `!` and a `console.log` in `App.tsx`, a `// TODO` and an `export default` each failed `npm run lint` and were reverted.
- **Reformat:** 121 files, 13,081 lines added and 14,617 removed. The bundle compare (esbuild-minified TS, JS and CSS, parsed JSON, 130 files) differs in two places, both JSX text split by `{" "}` (`SyncSettings.tsx`, `Diagram.tsx`), and in `client/index.html`, which is compared raw: its inline theme script changed quotes and semicolons and one `<link>` went onto one line.
- **Rule counts, old config to house config:** 0 errors before. After, before fixing: `no-unnecessary-type-assertion` 14 (fixed; `--fix` is safe here, `noUncheckedIndexedAccess` is on), `vitest/expect-expect` 38 (false positives, helpers that assert; fixed by naming `expectRejected`, `expectAccepted`, `expectLive`, `assertBoneLengths`, `assertFinite` in `assertFunctionNames`), `vitest/valid-title` 2 and `valid-expect` 1 (fixed), `no-console` 2 (`sync.ts`, kept with a reason), `n/no-process-env` 2 (warnings), `no-non-null-assertion` 59 (warnings, tests). The `TODO` in `ExerciseFigure.tsx` is not a finding under `location: "start"`; its wording was changed anyway.
- **Checkers:** `check-base-ui --warn-only`: 9 (rule-3 3, rule-5 2, rule-6 4). `check-structure --warn-only`: 16 (rule-1 2, rule-2 1, rule-3 2, rule-6 1, rule-11 10). dependency-cruiser: 2 `no-circular` warnings (one type-only loop in `ui/figures`). knip: no errors; 42 unused exports and 21 unused types as warnings.
- **Deviations:** the `docs` workspace is outside knip (`ignoreWorkspaces`), as the skill says of Docusaurus workspaces; `@testing-library/jest-dom` (unused) and `@sinclair/typebox` (imported, undeclared) are in knip's `ignoreDependencies`, dated; the old Node-globals blocks for `server/` and `scripts/` are gone because the house config supplies them. One autofix (removing `as RungId` in `sync.test.ts`) broke the typecheck and was corrected in a follow-up commit. Live check of the Stop and formatter hooks waits for the plugin update.
- **Load-sensitive test:** `screens.test.tsx` "loads the reference lazily" failed once inside a full `check` run under load, and passed alone and on the next full run.
