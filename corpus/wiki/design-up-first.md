---
summary: What the Up first redesign (brief 05, approved 2026-11-13) changed in the design system: the grounds and lines, the new tokens, the ring's hue, the layout from 840 px, the solid primary and sentence-case labels.
updated: 2026-11-13
---

# The Up first redesign (2026-11-13)

What shipped from the approved direction (brief 05). The tokens are `client/src/ui/tokens.css`, still the only file
with a hex value, with every existing name kept.

- **Grounds.** `--bg` is deeper (`#e9edf1` light, `#080b0e` dark) so a card stands off it; `--s1` is the card
  (`#fcfdfe`, `#182029`). `--line` and `--line2` are solid colours. `--warn-bg` and `--dang-bg` are solid grounds, so
  the contrast table can name their pairs.
- **New tokens.** `--edge` (the border of Easier, Harder, Log and the Reps field, 3:1 on `--s1`), `--warn-line` (the
  honest note and the streak pill), `--dang-line` (the stop rule and the banners, replacing a `color-mix`), `--sh-btn`
  (the solid primary), `--fs-display-l` (3rem, the head band's title from 840 px) and `--fs-name-l` (1.5rem, the Up
  first name from 840 px). `--sh-1` and `--sh-2` are stronger and per theme.
- **The ring and the other accents.** `--accent-2` is the far end of the accent's hue: darker on light, lighter on
  dark, mint's from the board and the other seven derived by moving lightness (-0.05 light, +0.18 dark) with hue and
  saturation kept. Each is at 3:1 or better on `--s1` and on `--bg`; the lowest is 6.9:1 (light violet) and 9.6:1
  (dark azure). The ring runs `--accent` to `--accent-2`.
- **Layout.** Phones: a one-row footer (Easier 76 px, Harder 76 px, Start the rest) over the 56 px tab bar. From
  840 px: a 64 px top bar and a 1168 px column with a 7/5 split, the right column sticky, the Start card on top and
  How it is going under it. Below 390 px the wells, padding and targets shrink and the type floors do not.
- **The primary is solid** `--accent` with `--sh-btn`; the gradient is gone from every button.
- **Tabular figures on numbers only**, so a hyphen prints without a gap.
- **Fonts.** Inter stays, from the self-hosted file the page preloads.
