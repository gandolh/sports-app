# Task 03: Base UI by the conventions, and the theme switch

**Depends on:**

- In sports-app: brief 01 (Base UI 1.9.0) and brief 02 (the gate, the formatter and `.claude/rules/client.md`).
- In the owner's skills library:
  - brief 02, *A base-ui skill, styled with Tailwind*: rules 1-13, the references and `check-base-ui.mjs`;
  - brief 15, *Enforce the base-ui and code-structure skills in every repo*: the checker runs `--warn-only` until this brief is done.
- The owner's grilling of 2026-11-10: the owner's answers (Q18 dark mode, Q19 visual parity) and the technical calls (Q15 Base UI only under `ui/`, Q16 native controls, Q41 and Q57 choice controls, Q44, Q59-Q62), all decided below.

**Runs before:** 05, the redesign. It changes structure and behaviour; the redesign then changes only the look.

**Before you start:** run `brief-board guide` ([CLAUDE.md](../../CLAUDE.md)).

## Context

The owner's call of 2026-11-09 is Base UI everywhere at 1.9.0, with the skill's conventions enforced in each repo, and the whole app on Tailwind. **sports-app is already on Tailwind**: it moved on 2026-09-04 ([wiki/decisions.md](../../wiki/decisions.md), "Stack: Tailwind + Framer Motion + anime.js", line 193), so there is no migration brief. This brief checks the leftovers, audits Base UI against the rules, and adds the theme choice the owner asked for (Q18).

### Leftover styling (read 2026-11-10)

- **Plain CSS:** two files, `client/src/index.css` (184 lines, all inside `@layer base`) and `client/src/ui/tokens.css` (559 lines: the palette in three theme states, eight accents, and `@theme inline` mapping the tokens to utilities). No other `.css`, no `*.module.css` (`find client/src -name "*.css"`).
- **Inline `style`:** three sites, all computed geometry, which rule 5 allows: `client/src/ui/ExerciseFigure.tsx:147` (width and height from a prop), `client/src/ui/components/CountdownRing.tsx:86`, `client/src/ui/routes/progress.tsx:179` (a position from data).
- **Arbitrary values:** 0 colours (`-[#`, `-[rgb`, `-[hsl`), and 200 `-[var(--…)]` uses, almost all spacing and tap sizes (`[var(--sp-4)]`, `[var(--tap-row)]`). Spacing is deliberately not mapped to Tailwind's scale ([tokens.css](../../../client/src/ui/tokens.css), the note under `@theme inline`), so rule 6 (no arbitrary colours) holds and the spacing stays.
- **Rule 5 says one stylesheet.** sports-app has two, on purpose: `noHexColors.test.ts` and `contrast.test.ts` each read `tokens.css` as the one file that holds colour. Default: keep both, and record the exception in `scripts/conventions.json`.

### The pin

Brief 01 leaves `client/package.json` at `1.9.0`, exact. Rules 1 and 2 hold: all three imports are the subpath `@base-ui/react/field`.

### The audit against rules 1-13 (2026-11-10)

| Rule | Violations | Where |
|---|---|---|
| 1. Exact pin | 0 after brief 01 | |
| 2. Subpath imports | 0 | `client/src/ui/routes/login.tsx:3`, `client/src/ui/components/SignInSettings.tsx:3`, `client/src/ui/components/SyncSettings.tsx:2` |
| 3. Base UI only under a `ui/` folder | **3** | The same three files use `Field` directly. The checker would pass them, because the whole tree is under `client/src/ui/`. The rule means a wrapper folder, so the wrapper home here is `client/src/ui/components/ui/` and the checker is told to look for that path (decision 1). |
| 4. Tailwind on the parts | 0 | `Field` parts take `className` from `client/src/ui/components/fields.ts` (`FIELD_LABEL`, `FIELD_INPUT`, `FIELD_DESCRIPTION`, `FIELD_ERROR`). No selector aims at a part. |
| 5. One stylesheet | exception | see above |
| 6. Semantic tokens only | 0 | `noHexColors.test.ts` already fails the build on a hex outside `tokens.css` |
| 7. Motion through state attributes | n/a | No animated Base UI part. Motion is `motion` and anime.js on the app's own elements, which the decisions keep. |
| 8. Floating parts portalled | n/a | No popup of any kind |
| 9. Triggers use `render` | 0 | No trigger |
| 10. `Select` with `items` | 0 | No `Select`, and no native `<select>` |
| 11. No native dialogs | 0 | No `confirm`, `alert` or `prompt` (`grep -rnE "window\.(confirm\|alert\|prompt)" client/src`) |
| 12. Dialogs | 0 | No dialog. Confirms in this app are none. |
| 13. Base UI over hand-built widgets | **2** | See below. |

**Rule 13's two:**

1. **The theme choice**, `client/src/ui/routes/account.tsx:236-253`: three `<button role="radio">` in a `role="radiogroup"`, with no arrow keys and three Tab stops. It becomes a guarded `ToggleGroup` (Q57, decision 2): it saves on each choice, so arrow keys move focus without saving, a press chooses, and one item always stays pressed.
2. **The accent choice**, `client/src/ui/routes/account.tsx:276-293`: the same pattern, eight options in a four-column grid. Same fix: choosing an accent also saves (the `sports-app.accent` key), so it is the same kind of picker.

**Considered and left:**

- `client/src/ui/components/LogControls.tsx:77` (an `aria-pressed` button that logs the target, and removes it on a second press) and `:91` (an `aria-expanded` disclosure). Rule 13's list has no toggle button or disclosure, and native `aria-pressed` is correct. Left native (decision 3).
- `<details>` in `client/src/ui/routes/library.tsx:182`: native, and the route's own comment says why.
- `client/src/ui/components/TabBar.tsx`: four router `Link`s, navigation and not tabs. It is the phone navigation, a bottom bar with no panel, so Q40's `Drawer` rule does not apply.
- Q58's form-dialog rule and the confirm pattern: the app has no dialog.

### The theme today, and what Q18 changes

The app already has a Light / Dark / System choice (`client/src/ui/routes/account.tsx:225-231`), kept on the device in two `localStorage` keys (`sports-app.theme`, `sports-app.accent`) and deliberately not in `StateDoc.settings`, which is the synced training record (`client/src/ui/components/theme.ts`, header). Dark is done with CSS variables under `:root[data-theme='dark']` and a `prefers-color-scheme` block. There are 0 `dark:` classes (`grep -rn "dark:" client/src --include=*.tsx`).

The difference from the owner's answer is the **first visit**. Today a missing key means "follow the OS", so a dark phone sees dark. Q18 says a first visit shows **light**, and System is an explicit choice. The owner's rule also says the choice is kept where the app keeps its other settings: here the app keeps its settings on the device (the training document is the only synced thing, and theme was kept out of it on purpose), so the choice stays on the device. No change there.

What has to change for "light by default, System explicit":

- `client/src/ui/components/theme.ts`: `ThemeChoice` becomes `'light' | 'dark' | 'system'`, `readTheme()` returns `'light'` when nothing is stored, and `setTheme('system')` stores and stamps `system`.
- `client/index.html`'s blocking script (lines 64-73): stamp `data-theme` for all three values, and `light` when the key is missing.
- `client/src/ui/tokens.css:320`: the media block's selector `:root:not([data-theme='light'])` (and the eight accent variants, lines 357-392) becomes `:root[data-theme='system']`.
- `client/src/ui/__tests__/contrast.test.ts:164-215`: the selector decoder knows `:not([data-theme='light'])`. It must learn `[data-theme='system']`, keeping its three states (light, dark OS under system, stamped dark) and the assertion that the media-query dark and the stamped dark resolve to one palette (line 450).
- `client/index.html:22-23`: the two `theme-color` metas are keyed to the OS, so a light page on a dark OS shows a dark browser bar. Replace them with one meta that `theme.ts` and the blocking script set from the resolved theme.
- Tailwind's `dark:` variant, per the owner's rule, keys off `data-theme` through `@custom-variant`. No class uses it today; add it so the next one works:

  ```css
  @custom-variant dark {
    &:where(:root[data-theme='dark'], :root[data-theme='dark'] *) { @slot; }
    @media (prefers-color-scheme: dark) {
      &:where(:root[data-theme='system'], :root[data-theme='system'] *) { @slot; }
    }
  }
  ```

  Check the exact form against Tailwind 4.3.3's docs, and test it with one throwaway `dark:` class.
- Existing devices: a person who chose System has no key stored (System was "no key"), so they see light once and pick System again. There is no way to tell them from a first visit. Record it in the outcome note.

## Owner decisions

Decided 2026-11-10; 4 is the owner's answer, the rest are technical calls the owner may overrule:

1. **The wrapper home** (Q15, Q59). `client/src/ui/components/ui/<Name>.tsx`, the skill's `components/ui/` placed inside this app's `client/src/ui/components/`. Base UI is imported only there, and wrappers stay in `components/ui/` as in other feature-folder repos. `check-base-ui` rule 3 must test for `components/ui/`, not for any `ui/` segment, or it passes vacuously on this tree: the checkers read their roots from `scripts/conventions.json`, so record the mapping there.
2. **The choice widgets** (Q41, Q57). The theme and accent pickers **save** on each choice, so they use a guarded `ToggleGroup`: arrow keys move focus without saving, a press chooses, and one item always stays pressed. (A filter that only switches what a list shows would use `RadioGroup`; there is none here.)
3. **The two considered-and-left widgets** (the log toggle, the disclosure; Q16). Left native.
4. **Dark mode** (Q18, owner). A switch, light by default, System as an explicit choice, kept on the device, keyed to `data-theme`.
5. **Two stylesheets** (rule 5). Kept, as a recorded exception.
6. **The type scale and tests** (Q62, Q60, Q44). The type scale is already named: `--fs-*` tokens mapped to `--text-*` in `@theme inline` (`tokens.css:198-210`, `:532`), so nothing moves. No `phone` variant. `client/src/index.css:53` already forbids a pixel font size on the root, so Q44 needs no change. The 19 `data-testid` attributes (`grep -rn "data-testid" client/src`) are audited in step 3: tests select by role, and an id stays only where no role fits. Component tests stay in jsdom, per file, only where a wrapper holds logic (Q60); the choice-group's guard is one.

## The wrapper set: `client/src/ui/components/ui/`

| File | What it is | From |
|---|---|---|
| `Field.tsx` | Base UI `Field` (`Root`, `Label`, `Control`, `Description`, `Error`) with the `FIELD_*` classes inside | `fields.ts`'s constants, and the three direct users |
| `ToggleGroup.tsx` | Base UI `ToggleGroup` + `Toggle`, guarded (one item always pressed, arrow keys move focus without saving); takes `options`, `value`, `onValueChange`, a label, and a class per state | new; the theme and accent choices |

`fields.ts`'s `FIELD_*` names stay exported if another file still uses them (check with `grep -rn "FIELD_" client/src`).

## Files you OWN

- `client/src/ui/components/ui/**` (new), `client/src/ui/components/fields.ts`, and the three `Field` users.
- `client/src/ui/routes/account.tsx`: the two choices.
- `client/src/ui/components/theme.ts`, `client/index.html`, `client/src/ui/tokens.css` (the selectors and the `@custom-variant` only), `client/src/ui/__tests__/contrast.test.ts`, `client/src/ui/__tests__/screens.test.tsx` (the theme and accent tests, lines 455-495).
- `scripts/conventions.json`.
- Corpus: [wiki/design-system.md](../../wiki/design-system.md) (the theme states), [wiki/technical-decisions.md](../../wiki/technical-decisions.md), [wiki/status.md](../../wiki/status.md), [log.md](../../log.md). The comments in `tokens.css`, `theme.ts` and `account.tsx` that say "System is the absence of a choice" must change with the code.

## Files you must NOT touch

- `server/`, and `shared/`.
- Palette values, accents and contrast ratios. This brief moves selectors, not colours.
- `client/src/domain/`, `session/` and `persistence/` (the theme keys are `localStorage`, not the document).

## What to do

One commit per numbered step. After each, `npm run check` passes, with `check-base-ui` `--warn-only`.

1. **Before.** Run `check-base-ui` and record the counts by rule. Take Playwright screenshots at 1280 and 390 px, light and dark, of `/login`, `/account` (both choices) and the two settings panels. Keep them out of git.
2. **`Field.tsx`**, and the three users on it. Rule 3 drops to 0.
3. **`ToggleGroup.tsx`**, and the two choices on it. Keep the labels, the `Theme` and `Accent colour` group names, the tap height, and the stamp on each choice. Update the screens test to assert that arrow keys move focus without changing the choice, and that a press chooses. Audit the 19 `data-testid` attributes (decision 6).
4. **The theme switch** as listed under "What Q18 changes", in this order: `theme.ts` and its tests, `index.html`, `tokens.css`, the contrast test, the `@custom-variant`. A first visit (no key, dark OS) shows light.
5. **The exception file.** `scripts/conventions.json` with the two-stylesheet entry and the wrapper-home mapping, each with its reason.
6. **After.** Take the screenshots again. Per the owner's call (Q19, "close enough"), there must be no visible change to layout or colour at 1280 and 390 px, and drift of a few pixels needs no listing. Run `check-base-ui` strict: rules 1, 2, 3 and 9-11 report 0. Update the corpus pages and run `bash corpus/lint.sh` until clean.

## Acceptance

- [ ] `grep -rn "@base-ui/react" client/src --include=*.ts --include=*.tsx | grep -v "components/ui/"` prints nothing.
- [ ] `check-base-ui` strict reports 0 for rules 1, 2, 3, 9, 10 and 11, and the two exceptions are in `scripts/conventions.json`.
- [ ] A test: with no stored theme, `document.documentElement.getAttribute('data-theme')` is `light` after the blocking script's logic runs, even when `matchMedia('(prefers-color-scheme: dark)')` matches.
- [ ] A test: choosing System stores `system` and stamps `data-theme="system"`, and `contrast.test.ts` still resolves the dark-OS state and the stamped dark to one palette.
- [ ] The theme and accent groups have one Tab stop, arrow keys move focus without saving, a press chooses, and one item always stays pressed. That is a test.
- [ ] `npm run check` and `npm run build` pass, and `bash corpus/lint.sh` ends clean.
- [ ] The before and after screenshots show no visible change at 1280 and 390 px in either theme.

## Interplay

- Brief 05 changes the tokens and the layout. The theme switch must survive it in both themes, so brief 05's checks reuse the tests added here.
- The skills library's `check-base-ui` rule 3 needs the `components/ui/` path test described in decision 1, and its rule 5 needs an exception list for a token file that tests depend on. Both are reports to that library, not local patches.
