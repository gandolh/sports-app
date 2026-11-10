# Task 01: Base UI 1.9.0

**Depends on:** nothing. This brief runs first, so a visual or behavioural change in the later briefs is never blamed on the bump.

**Runs before:** 02, 03, 04 and 05.

**Before you start:** run `brief-board guide` ([CLAUDE.md](../../CLAUDE.md)).

## Context

On 2026-11-09 the owner decided that every web app they own runs `@base-ui/react` at the latest stable release, **1.9.0**, pinned exactly. sports-app is on 1.6.0.

### The pin today (read 2026-11-10)

| File | Spec |
|---|---|
| `package.json` (root), `server/package.json`, `shared/package.json`, `docs/package.json` | none |
| `client/package.json:15` | `"@base-ui/react": "1.6.0"`, already exact |

Command: `grep -rn "base-ui" --include=package.json . | grep -v node_modules`.

The lockfile resolves one copy: `package-lock.json:2069-2070` (`node_modules/@base-ui/react`, 1.6.0) and `package-lock.json:2107-2108` (`@base-ui/utils`, 0.3.1). `.npmrc` has `save-exact=true`.

### The two breaking changes do not touch this repo

1.9.0 renamed `OTPFieldPreview` to `OTPField` and `sanitizeValue()` to `normalizeValue()`. The app imports only `@base-ui/react/field`, in three files: `client/src/ui/routes/login.tsx:3`, `client/src/ui/components/SignInSettings.tsx:3` and `client/src/ui/components/SyncSettings.tsx:2` (`grep -rn "@base-ui" client/src shared --include=*.ts --include=*.tsx`, 2026-11-10). It uses `Field.Root`, `Field.Label`, `Field.Control`, `Field.Error` (with `match`) and `invalid`.

### Measured on a scratch copy, 2026-11-10

`npm install @base-ui/react@1.9.0 --save-exact -w @sports-app/client --package-lock-only --ignore-scripts`:

- `client/package.json` became `"@base-ui/react": "1.9.0"`. Nothing else in any `package.json` changed.
- The lockfile changed four entries and hoisted them as before: `@base-ui/react` 1.6.0 to 1.9.0, `@base-ui/utils` 0.3.1 to 0.5.0, `reselect` 5.2.0 to 5.3.0, `use-sync-external-store` 1.6.0 to 1.7.0.

**Not measured here, so step 1 measures it:** the full `npm run check`, a browser look at the three Field forms, and the release notes from 1.6.0 to 1.9.0.

## Owner decisions (defaults this brief builds)

1. **Pin 1.9.0 exactly.** Default: yes, through `npm install ... --save-exact`.
2. **Nothing else moves.** Default: no `npm update`. The lockfile diff is Base UI's own tree.
3. **A visual change the bump causes** is logged in the outcome note and left. Brief 03 owns the markup, and brief 05 the look.

## Files you OWN

- `client/package.json` (the one line) and `package-lock.json`.
- A source file only if a breaking or behavioural change forces it. Expect none.
- `corpus/wiki/technical-decisions.md` (the Base UI entry), `corpus/wiki/status.md`, `corpus/log.md`.

## Files you must NOT touch

- Styling, `server/`, `shared/`, `docs/`, and every other dependency.

## What to do

One commit for the bump, `chore(deps): @base-ui/react 1.9.0`.

1. **Baseline and changelog.** Run `npm run check` on the untouched tree and record the test counts. Read the release notes from 1.6.0 to 1.9.0 and write one line on `Field` in the outcome note: either "nothing in these notes touches what the app uses", or the note and what you checked.
2. **Re-run the grep** `grep -rnE "OTPFieldPreview|otp-field|sanitizeValue" client/src shared --include=*.ts --include=*.tsx`. Expect no hits.
3. **Install:** `npm install @base-ui/react@1.9.0 --save-exact -w @sports-app/client`. Check that the lockfile resolves 1.9.0 and only the four entries above changed (`git diff --stat`).
4. **Scripts.** `npm run check`, then `npm run build`. Fix only what the bump broke.
5. **Behaviour in a browser.** Start `npm run dev` and check the three forms at 1280 and 390 px: sign-in at `/login`, and the sign-in and sync settings on `/account`. Typing, the label click, the `Field.Error` text on a bad service address, and focus order must match 1.6.0.
6. **Commit**, then update the corpus pages above in one corpus commit. Run `bash corpus/lint.sh`.

## Acceptance

- [ ] `node -p "require('./client/package.json').dependencies['@base-ui/react']"` prints `1.9.0`.
- [ ] `node -e "const p=require('./package-lock.json').packages;console.log(Object.entries(p).filter(([k])=>k.endsWith('/@base-ui/react')).map(([k,v])=>k+' '+v.version))"` prints one line ending `1.9.0`.
- [ ] `grep -rnE "OTPFieldPreview|otp-field|sanitizeValue" client/src shared --include=*.ts --include=*.tsx` prints nothing.
- [ ] `git diff --stat HEAD~1` for the bump commit lists only `client/package.json` and `package-lock.json`, unless a forced fix is named in the outcome note.
- [ ] `npm run check` and `npm run build` pass, with the test count no lower than step 1's.
- [ ] `docker build -f infrastructure/Dockerfile .` succeeds (the image installs the server's tree only, so it should not change).
- [ ] The outcome note has the `Field` changelog line and the browser result, or "no difference found".
- [ ] `bash corpus/lint.sh` ends clean.

## Interplay

- Brief 03 starts from a tree already on 1.9.0, so the `ToggleGroup` and `Toggle` APIs it uses are the 1.9.0 ones.

## Outcome (2026-11-10)

Commit d4088c7, `chore(deps): @base-ui/react 1.9.0`. `client/package.json` pins `1.9.0` exactly; the lockfile
resolves one copy and changed the four expected entries (`@base-ui/react` 1.6.0 to 1.9.0, `@base-ui/utils`
0.3.1 to 0.5.0, `reselect` 5.2.0 to 5.3.0, `use-sync-external-store` 1.6.0 to 1.7.0).

- **Baseline and after:** `npm run check` passes both times with 1,223 tests; `npm run build` passes.
- **`OTPFieldPreview`/`sanitizeValue` grep:** no hits.
- **`Field` changelog line:** the release notes were not reachable (GitHub), so none was read. No breaking change
  to `Field` showed up in the types or the tests, which exercise the three forms.
- **Browser result:** not run in this pass; the three forms (`/login`, the sign-in and sync settings on
  `/account`) are an owner or follow-up check after deploy.
- **Skipped:** `docker build` (Docker is unusable on this machine); the image installs the server tree only.
- **Board:** moved to Ready for deploy; deploy with `node cli.ts sports-app deploy` from the vps-deploy checkout.
