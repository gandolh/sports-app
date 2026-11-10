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
