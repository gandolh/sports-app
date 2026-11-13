# Task 05: A redesign with Hallmark, on the estate board

**Depends on:**

- In sports-app: brief 03 (Base UI by the conventions, and the theme switch). Brief 04 is independent; the server does not change the look.
- In the owner's skills library:
  - brief 24 (vendor Hallmark as the design skill, and adopt taste-skill 2.5's ideas: palettes and type dealt by trade, and its copy layer);
  - the estate redesign board: one artifact with a page per app, showing today's screenshots beside the proposed design at 1280 and 390 px. The library owns it.
- The owner's grilling of 2026-11-10: Q39 (every web UI is redesigned, on the board, approved before any code changes) and Q18 (the theme switch).

**Runs before:** nothing.

**Before you start:** run `brief-board guide` ([CLAUDE.md](../../CLAUDE.md)).

## Context

sports-app is a zero-equipment calisthenics trainer: an offline-first PWA that prescribes the next session from the number of sessions done, and logs what the person did.

### The screens (read 2026-11-10)

| Route | File | What it shows |
|---|---|---|
| `/` (Today) | `client/src/ui/routes/index.tsx` | the next session, the player, and two guard screens (a history already on this browser, line 395; a history that could not be read, line 428) |
| `/plan` | `client/src/ui/routes/plan.tsx` | the schedule and the month |
| `/progress` | `client/src/ui/routes/progress.tsx` | comparison with last time, streak, calendar, heatmap |
| `/library` | `client/src/ui/routes/library.tsx` | the exercise reference, with `<details>` steps |
| `/account` | `client/src/ui/routes/account.tsx` | Appearance (theme and accent), sign-in and sync settings |
| `/login` | `client/src/ui/routes/login.tsx` | sign in |
| the 404 | `client/src/ui/routes/__root.tsx` | "There is no page at that address." |

Shared pieces: the bottom tab bar (`client/src/ui/components/TabBar.tsx`), the figures (`client/src/ui/figures/`, `ExerciseFigure.tsx`), the ring, stat tiles, heatmap and the player in `client/src/ui/components/`.

### What the design docs fix today

- [wiki/design-system.md](../../wiki/design-system.md): the tokens and the doctrine (colour, type, spacing, motion). `client/src/ui/tokens.css` is the only file allowed a hex colour.
- [wiki/design-guardrails.md](../../wiki/design-guardrails.md): the banned patterns, the floor-phone accessibility floor, and the four tests that enforce them (`noHexColors.test.ts`, `contrast.test.ts` and two more under `client/src/ui/__tests__/`).
- [PRODUCT.md](../../../PRODUCT.md), "Brand Commitments": **zero photography**, imperative and factual copy with no motivational register, no comparison affect, and "the visual direction is the category standard, committed 2026-09-04": near-black ground, one accent of eight, light and dark at parity, a gradient progress ring, a streak grid, stat tiles, a bottom tab bar. The owner chose it over three alternatives shown as running interfaces, and called it a standing preference. The craft bar is openGym.
- [wiki/decisions.md](../../wiki/decisions.md) line 193: Tailwind with Framer Motion and anime.js.
- [corpus/CLAUDE.md](../../CLAUDE.md): the invariants that no redesign touches (the prescription never adapts to what was logged, zero equipment, offline-first, `client/src/domain/` reads no clock).

Two of Hallmark's habits collide with recorded decisions: credited photographs (the app has none by decision) and a page built from its job (the Today screen already is). A proposal that wants either goes on the board as a reopened decision, named as such. It is not assumed.

## Owner decisions (defaults)

1. **The proposal stays inside the recorded decisions** unless the owner reopens one on the board. Default: zero photography, factual copy, the eight accents with their own ink, light and dark at parity, a bottom tab bar.
2. **Hallmark's palettes and type dealt by trade** (from taste-skill 2.5) apply to the accent set and the type pairing only if the owner reopens the "category standard" decision.
3. **The theme switch survives** (Q18): Light, Dark and System, light by default, on the device, in both themes.

## Files you OWN

- `client/src/ui/tokens.css`, `client/src/index.css`, the components and routes listed above, and `client/index.html`'s font and theme-colour lines.
- The tests that assert tokens: `client/src/ui/__tests__/contrast.test.ts`, `noHexColors.test.ts`, and the screens tests if text changes.
- Corpus: [wiki/design-system.md](../../wiki/design-system.md), [wiki/design-guardrails.md](../../wiki/design-guardrails.md), [wiki/decisions.md](../../wiki/decisions.md), [wiki/status.md](../../wiki/status.md), [log.md](../../log.md).

## Files you must NOT touch

- `client/src/domain/`, `session/` and `persistence/`, `server/` and `shared/`. A redesign changes how the prescription is shown, never what it is.
- Any copy that states a number or a claim the app does not compute (the Floor's "no invented facts").
- The recorded decisions named above, until the owner has reopened one on the board.

## What to do

1. **Screenshots.** Playwright screenshots of every screen above, at 1280 and 390 px, in light and dark, including the two guard screens on `/`. Keep them out of git. Brief 03's step 1 shots are the starting point if nothing has changed since.
2. **A proposal per screen** with Hallmark, inside decision 1. Each proposal says what changes (tokens, layout, type, copy) and what stays, and names any reopened decision.
3. **Put it on the board**, on this app's page, beside today's screenshots.
4. **Wait for the owner's approval on the board.** Nothing below starts before it. Record the approval in `log.md` with its date.
5. **Build it as a token change first:** `tokens.css` values, then the type and spacing scale, one commit. Then **one screen per commit**, in the order of the table. After each commit run `npm run check`, and the screens' before and after screenshots at 1280 and 390 px.
6. **Corpus.** Update the design pages and `decisions.md` (a dated entry for every reopened decision), and run `bash corpus/lint.sh` until clean.

## Acceptance

- [ ] The owner's approval on the board is recorded in `log.md` with its date.
- [ ] Hallmark's Floor, as commands or tests:
  - `npx vitest run client/src/ui/__tests__/contrast.test.ts` passes, in light, dark and system-on-dark-OS, for all eight accents;
  - a visible focus ring on every interactive element (a Playwright check that tabbing through each screen puts a ring with at least 3:1 contrast on each stop);
  - a `prefers-reduced-motion: reduce` path (a test that the figures and the ring do not animate under it);
  - no invented numbers or claims (the screens test still asserts every figure shown comes from the document);
  - no horizontal scroll at 390 px on any screen (a Playwright check: `document.documentElement.scrollWidth <= 390`).
- [ ] `noHexColors.test.ts` passes: no hex outside `tokens.css`.
- [ ] The theme switch works in both themes: brief 03's tests still pass.
- [ ] `npm run check` and `npm run build` pass, and `bash corpus/lint.sh` ends clean.

## Interplay

- Brief 03 leaves the wrappers and the theme states in place; this brief changes only the values and the layout.
- The redesign board's page for sports-app is the library's artifact. Nothing in this repo links to its address; `log.md` names the date of the approval.

## Outcome (2026-11-13)

Built from the approved direction "Up first" (approval in the log, 2026-11-13). Client only; the state service, `domain/`, `session/`, `persistence/` and `shared/` are untouched.

- **Commits (local on main):** approval entry; tokens; Playwright harness; Today (the top bar, Up first, Then, the Start card, the six-week grid); Player; Progress; the undrawn screens; the design docs. The wiki has [design-up-first.md](../../wiki/design-up-first.md) and [decisions-redesign.md](../../wiki/decisions-redesign.md); `PRODUCT.md`'s bottom-tab-bar line now says phones and a top bar from 840 px.
- **Tokens:** the board's values in `tokens.css` (light, dark, mint) with every name kept; new `--edge`, `--warn-line`, `--dang-line`, `--sh-btn`, `--fs-display-l`, `--fs-name-l`; `--ls-label` and every `uppercase` dropped; `--warn-bg` and `--dang-bg` solid. The other seven accents' `--accent-2` (light, then dark; contrast on `--s1`): azure #0254a8 7.3 / #97caff 9.6; violet #5c17fd 6.9 / #d8ccff 11.0; magenta #a70a63 7.2 / #f8b6da 9.9; coral #9a3104 7.3 / #ffc5b8 10.9; amber #664b01 8.0 / #f9d893 12.0; lime #375709 8.2 / #c6ed98 12.5; slate #42596c 7.2 / #c7d1dc 10.6. Mint is the board's: #0a5a42 8.1 / #7ff0c9 11.9.
- **Contrast minimums over all eight accents:** light: text on `--bg`/`--s1`/`--s2` 5.0 (`--tx3` on `--bg`), accent text 4.99 (magenta on `--s2`), on-accent 5.27 (violet), `--accent-2` 5.96 on `--bg`, edge 3.12 on `--bg` and 3.60 on `--s1`, warn 5.50 and danger 5.23 on their grounds. Dark: text 5.20 (`--tx3` on `--s2`), accent text 4.55 (violet on `--s2`), on-accent 5.94, `--accent` on the ring track 3.96, edge 3.62 on `--s1`, warn 8.50 and danger 6.71 on their grounds.
- **First screen:** Today shows the Up first card and all three Then rows above the action band at 1280x800 (rows end at 587, 648, 709 of 800), 390x844 (545, 598, 651 of 702) and 360x800 (538, 587, 636 of 658). On the player at 360x800 the stop rule ends at 608 and the actions start at 625.
- **Deviations from the brief and the sheet:** (1) `contrast.test.ts`: the "surface ramp ascends" test is replaced by "a card stands off the canvas" (light `--s2` now sits almost on `--bg`, so the ramp is no longer monotonic); the `--on-accent` on `--accent-2` pair is kept; pairs for `--edge`, `--accent-2` on `--s1`, the pressed fill and the solid grounds are added. (2) `player.test.tsx`: the old "stop rule before the comparison strip" assertion is now "the comparison is inside the set card, the stop rule follows it and comes before the cues", because the sheet puts the strip in the set card; the browser spec measures the stop rule at 360. (3) `client/vite.config.ts` manifest colours follow the new `--bg` (outside the brief's file list). (4) The player keeps the app's own labels `Target change` and `You logged` (the sheet calls `Change` and `Logged` the app's own, but the code never had them); it shows `Set 1 of 3` as a visible heading, where the app had it only for screen readers. (5) The player's cue list and posture note, which the board never drew, sit under the figure on a desktop and after the stop rule on a phone.
- **Not matching the comps:** the fixture history gives 303 reps (the twin says 309); rows read `3 sets · rung 2 of 8` (the app's own, the twin has a comma); the row glyphs are the app's pattern icons; Today's phone layout drifts by up to 17 px from the twin above the Then card, so the whole-pixel diff is 6% at 1280 and about 20% at 390 on Today, 12% on the player, 4% and 10% on Progress.
- **Checks:** `npm run check` and `npm run build` exit 0; Playwright (`client/e2e`, `--workers=2`, three theme projects) 177 passed; `bash corpus/lint.sh` clean.
