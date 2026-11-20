# sports-app: two directions

Written 2026-11-12 by the art director. Repo: sports-app, brief 05 (`corpus/briefs/todo/`). Both directions stay inside the recorded decisions (brief 05, "Owner decisions"; `corpus/wiki/decisions.md`, "The visual direction is the category standard", 2026-09-04): Inter throughout, eight accents each with its own ink (mint the default), light and dark at parity, a gradient progress ring, a streak grid, stat tiles, a bottom tab bar on phones, zero photography, imperative and factual copy with no comparison affect. The owner already turned down three metaphor worlds (crag guidebook, physio handout, split-flap board), so both stay plainly conventional. Also kept: the 17 px body floor, 19 px cues, 15 meta, 13 label, all in rem (PRODUCT.md); 44 / 48 / 56 px targets; the reach model (primary bottom-centre); the sticky footer; rows that are not buttons (`ExerciseRow.tsx`); the honest note, which is persistent, warn hue, never red and never dismissible; tabular figures on every number. Use the app's token names: `bg`, `s1`-`s3`, `line`, `line2`, `tx`-`tx3`, `accent`, `accent-2`, `on-accent`, `warn`, `warn-bg`, `dang`, `grid0`.

**Registry.** Inter and mint are today's, so the registry allows both. No app on the board sets Inter. Mint (OKLCH h 166) sits near postern's patina (h 173). Both are today's, so both comps draw mint, the shot's accent, and the judges compare structure, not hue. Sketchers stamp Inter as "found in the project" (Hallmark bans it only as a default). The comp loads it from Google Fonts; the build self-hosts it (offline-first, no font CDN). Checked against ro-housing's directions (Source Code Pro, IBM Plex, burnt ochre, violet ~278): no clash.

## 1. Today's strengths (keep all of them)

1. **The answer arrives made.** `Legs day` at 40 px, the session line under it, then the day's exercises in run order. Nothing asks a question before Start.
2. **Each exercise is its own card.** `s1` with a `line` edge, a figure glyph in an `s2` well, the name and its sets, and the target set bold and right-aligned (`3 × 8` over `reps`). The targets line up in one column you can scan, and screen readers hear them as prose.
3. **The limit is stated where it applies.** The postural note rides under the pull row in the warn hue, with its own icon and label.
4. **The next action never moves.** The sticky footer holds the helper sentence, `Easier` and `Harder` (secondary, 48 px), and a 56 px `Start workout`, bottom-centre for reach. Start is the app's own pick; the other two are optional.
5. **Status sits where you glance.** The date and the streak pill sit in a thin rail at the top. Below that are four labelled places in the tab bar, the current one in accent.
6. **How it is going** (below the fold): the weekly ring, three stat tiles and a 42-day grid in one section.

Faults both fix:
- Tracked capitals (`WHAT THIS SLOT DOES NOT TRAIN`, the ring caption, the tile labels) fail Floor 9. Set them in sentence case at 13/16, weight 600, untracked. This revises design-system.md's "only `--fs-label` is uppercase".
- Middle-dot strings fail Floor 10. Keep the words and split them the same way in both directions: the session line becomes three facts on one wrapping row with a 16 px gap (`Session 17`, `squat rung 2 of 9`, `hinge rung 2 of 8`). Row meta becomes `3 sets, rung 2 of 9`.
- At 390 a title truncates (`Glute bridge, 2-second hol…`), which hides the modifier that defines the rung. Titles wrap; they never truncate.
- The footer covers the note at 1280×800, and `How it is going` sits wholly below the fold with nothing to say it is there.
- Light `s1` on `bg` is 1.08, so the cards read as flat. In dark, `s1` on `bg` is about 1.1.
- `Start workout` is a violet-to-green gradient (violet to navy to green in light), a neighbour of Floor 11. Both directions draw it in solid `accent`. The recorded gradient stays on the ring, between `accent` and an `accent-2` re-tuned to the same hue.
- At 1280 the app is a 480 px phone column in an empty white field.

## 2. The main screen

Today with its shell, route `/` (a Legs day). Shots in `board/shots/sports-app/`: `light-1280-today.png`, `light-390-today.png` (dark: `dark-1280-today.png`, `dark-390-today.png`). They are viewports (1280×800, 390×844), so the content below the fold comes from the code and the capture's seed (§3). State references: `*-player`, `*-progress`, `*-library-open`.

## 3. The content fixture

Above the fold, word for word from the shot:
- **Rail:** `Thursday, 12 November`; the streak pill `1` with a flame glyph, named `1 day in a row.`
- **Title:** `Legs day`. **Session facts:** `Session 17`, `squat rung 2 of 9`, `hinge rung 2 of 8`.
- **Section** `Today`, four rows in this order. Each row gives the name, its meta, the target and the unit, then the spoken target in brackets:
  1. `Bodyweight squat`, `3 sets, rung 2 of 9`, `3 × 8` `reps` (squat glyph; spoken "3 sets of 8 reps").
  2. `Glute bridge, 2-second hold at the top`, `3 sets, rung 2 of 8`, `3 × 8` `reps` (hinge glyph).
  3. `Front plank`, `2 sets, rung 2 of 6`, `2 × 36s` `seconds` (plank glyph).
  4. `Prone T raise`, `2 sets, rung 2 of 6`, `2 × 18s` `seconds` (prone glyph). Under it, the note: label `What this slot does not train`, then in full (the shot clips it): `Postural work, not pulling strength. With no bar or anchor, horizontal pulling cannot be trained at home — this slot builds the upper back and shoulder-blade control that sitting takes away. The gap is real and this app does not pretend otherwise.`
- **Footer:** `Easier and harder shift today's numbers by two reps or five seconds. Neither changes what comes next.` Then `Easier` and `Harder` (named "Start today's session, easier" and "…, harder"), then `Start workout`.
- **Tab bar:** `Today` (current), `Plan`, `Progress`, `You`.

Below the fold. These values are computed from the capture's seed (16 sessions, 7 Oct to 11 Nov, clock 12 Nov 10:00) through the app's own `history.ts` and `milestones.ts`; the shot doesn't show them:
- **Section** `How it is going`. Ring `29%`, caption `Weekly goal`, named `This week: 2 of 7 sessions.`
- **Tiles:** `16` `Sessions`, `1` `Day streak`, `309` `Reps ever`.
- **Grid:** 14 columns × 3 rows, 2 Oct to 12 Nov. Levels in order: `000001010010101001010100101010010101001010`, so 16 days trained. Named `Trained on 16 of the last 42 days.` Key: `Last 42 days`, `Less`, `More`.

**Explaining for a beginner (new, both directions).** Each row gets a closed `<details>` disclosure, `How to do it` (new copy), holding that rung's three cues verbatim from `client/src/domain/ladders.ts`. It explains in place and opens no per-exercise screen, so rows stay non-navigating. Direction B also shows cue 2 open in its first card. Bodyweight squat's cue 2: `Sit down and back until the tops of your thighs are parallel with the floor, then stand all the way up and squeeze your glutes. Chest stays up, heels stay down.` Figures are the app's own drawings (`client/src/ui/figures/`: Squat, Hinge, Plank, Prone), drawn static in their end pose. They are not photographs.

**States for the Direction sheet:**
- the read-only banner (`Read-only`);
- the unreadable-history guard: `The saved training history could not be read.`, with the banner `Nothing was changed`;
- `Session complete.`;
- no loading state: local and synchronous, and skeletons are banned.

## 4. Directions

### A. Straight, at full fidelity (Evolve today)
- **Idea:** today's Today screen made exact: real cards on a tinted ground, sentence-case labels, a solid Start, and every number in one aligned column.
- **Skeleton:** today's, on phone and desktop.
  - **390:** the rail, the title, the facts, `Today` with four row cards (8 px apart, 48 px or taller, titles wrapping), the note inset under row 4, then `How it is going`. The ring and the three tiles share one `s1` card, and the grid sits in a second card. The sticky footer is an `s1` band with a `line` top edge and `sh-2`, holding the helper, then `Easier` | `Harder`, then `Start workout`. The tab bar sits under it, and the content is padded by both bars.
  - **1280:** the same column widened to 640 px and centred on the tinted `bg`, so its cards read against the ground. The footer and the tab bar stay at the foot of the column, as today. Gutters grow past 1280; the column does not.
- **Type:** Inter (today's) at 400 to 800, with the `opsz` axis and `tnum`. Sizes: 40/44 at 800 for the title (−0.02em); 22/28 at 700 for section heads and targets; 17/24 at 600 for names; 15/20 for meta and facts; 13/16 at 600 for units and labels; 40/44 at 800 for the ring numeral; 28/32 at 800 for tiles.
- **Palette** (light / dark):
  - bg `#eef1f4` / `#0a0d11`; s1 (cards) `#ffffff` / `#182029`; s2 (wells) `#e6ebf0` / `#222b35`;
  - line `#c3ccd5` / `#36434e`;
  - tx `#0c1117` / `#edf2f7`; tx2 `#4e5863` / `#a5b1be`; tx3 `#5c6570` / `#919dab`;
  - accent (mint) `#0d7153` / `#2bd9a4`; accent-2, the ring's far end, `#0a5a42` / `#7ff0c9`; on-accent `#ffffff` / `#04231a`;
  - warn `#8a5300` / `#f0b457` on warn-bg `#f7eedf` / `#2a2214`, edged `#d9bf95` / `#5c4724`; dang `#b0362b` / `#f2857a`; grid0 `#dfe5eb` / `#1d252e` (below 3:1 on purpose, as recorded).
  - The other seven accents keep today's values; only their `accent-2` moves to their own hue.
  - Pre-checked: card on bg 1.13 / 1.18, edge on bg 1.43 / 1.92; tx3 on s2 4.93 / 5.20; accent on card 5.99 / 9.05; on-accent on accent 5.99 / 9.17; warn on warn-bg 5.50 / 8.50; dang on card 6.16 / 6.9. Re-run `contrast.mjs` for all eight accents.
- **Signature:** the numbers column. Every target is set at 22 px, 800 weight, tabular and right-aligned on one edge down the list, with its unit beneath. You can read the whole session at arm's length.
- **Reference:** `wise`, for white cards on a tinted canvas carrying heavy plain numerals. Nothing of its lime, its face or its pills.

### B. Up first
- **Idea:** Today leads with the first exercise, drawn and explained, then the rest of the run order. A beginner sees what to do before pressing Start, and on desktop the Start card and the week sit beside the plan, not under it.
- **Skeleton:**
  - **1280:** a 64 px top bar on `s1` with a `line` foot. The four places sit on the left (icon and label, the current one with a 3 px accent underline); the date and the streak pill sit on the right.
    - Under the bar, a 1120 px container. A head band card holds `Legs day` and the three facts.
    - Then two columns (`minmax(0,7fr) minmax(0,5fr)`, 24 px gap):
      - **Left:** the **Up first** card for row 1. It holds a 200 px `s2` well with the Squat figure, the name, `3 × 8 reps` at 28 px, `3 sets, rung 2 of 9` with a 9-tick rung bar (tick 2 in accent), cue 2 at 19/28, and `How to do it` closed. Under it, the **Then** card: rows 2-4 inside one `s1` card with `line` dividers, each row with its glyph well, its target column and its closed disclosure, and the note inset under row 4.
      - **Right, sticky:** the **Start** card (the helper, `Easier` | `Harder`, `Start workout` 56 px). Under it, `How it is going` in one card: the ring beside the three tiles, then the grid.
  - **390:** no top bar. The rail, the title and the facts come first. The Up first card has a 160 px figure well, then the Then card, then `How it is going`. The sticky footer and the bottom tab bar are as in A.
  - `Up first` and `Then` are new headings (new copy): they replace the one `Today` heading.
- **Type:** Inter (today's), as A, but with a wider gap: 48/52 at 800 for the title at 1280 (40/44 at 390); 28/32 at 800 for the Up first target.
- **Palette:** A's roles, with a deeper ground so the two columns stand off it. bg `#e9edf1` / `#080b0e`, line2 `#aeb9c4` / `#465462` for the top bar's foot; everything else as A, mint included. Re-run `contrast.mjs`; check the card on bg is at least 1.15 in light.
- **Signature:** the Up first card. The session's first movement is drawn large, with its target, its place on the ladder and the cue that says how to do it, so the screen teaches before it starts you.
- **Reference:** `nike`, for showing the thing itself large while the chrome stays mechanical and quiet. Nothing of its black-and-white palette, Futura or pills.
- **Reopens:** "bottom tab bar" (decisions.md, 2026-09-04), on desktop only, at 840 px and up. Phones keep it. If the owner says no, the bar stays at the foot of the left column at 1280.

## 5. Owner questions (for the ask sticky, the reopen first)

1. **B's desktop bar.** At 840 px and wider, B moves the four places from the bottom tab bar to a top bar. Phones keep the bottom bar, as recorded. Is that OK, or should the tab bar stay at the bottom on desktop too?
2. **Explaining on Today.** Both directions add a closed `How to do it` to each row, holding the rung's cues, and B shows the first exercise's movement cue open under its figure. Rows still open no screen of their own. Are the words `How to do it`, and B's `Up first` and `Then`, OK?
3. **Approve a direction:** A (today's column, finished) or B (the first exercise explained, Start beside the plan on desktop)?

## 6. Registry lines

| sports-app (A) | Straight, at full fidelity | Inter (today's) | Inter (today's) | mint, one of eight (today's; near postern's patina, both today's) | phone column, 640 px at 1280 on a tinted ground; rail and title; row cards with a right-aligned target column; ring and tiles card, grid card; sticky footer with Start; bottom tab bar at every width |
| sports-app (B) | Up first | Inter (today's) | Inter (today's) | mint, one of eight (today's) | 64 px top bar of four places at 840 and up; head band; a 7/5 split: the Up first card with a figure and cue over a Then card, beside a sticky Start card and the How it is going card; phone: the same stack, sticky footer, bottom tab bar |
