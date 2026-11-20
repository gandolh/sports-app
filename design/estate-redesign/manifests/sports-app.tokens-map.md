# Sports app tokens map (direction B "Up first")

The board's role names already are the app's names (`bg`, `s1` to `s3`, `line`, `tx` to `tx3`, `accent`, `accent-2`, `on-accent`, `warn`, `dang`, `grid0`; `ui/tokens.css`), so the board css reads `--color-bg` where the app says `--bg` and `@theme inline` maps the two.

## Renamed or remapped (same name, new value or meaning)

- `bg`, `s1`, `s2`, `s3`, `tx2`, `tx3`: new light and dark values. `bg` is deeper (`#e9edf1` / `#080b0e`) so cards stand off it; `s1` is `#fcfdfe` / `#182029`.
- `line`, `line2`: solid colours, not translucent washes. `line2` is now also the top bar's foot, the tab bar's head and the inactive rung ticks.
- `accent`, `accent-2`, `on-accent` (mint only): `accent-2` is the ring's far end in the same hue (`#0a5a42` / `#7ff0c9`), no longer violet. `on-accent` `#eef9f6` (light) and `#04231a` (dark) are today's. The Start and Next set buttons are solid `accent`, not a gradient.
- `warn-bg`, `dang-bg`: solid grounds (`#f7eedf` / `#2a2214`, `#f9e9e6` / `#2b1917`) instead of washes, so the contrast table can name the pair.
- `sh-1` (cards) and `sh-2` (the footer) are stronger and per theme; `sh-3` is unchanged (nothing in the three screens uses it).
- Labels, units and the ring caption are sentence case at 13/16, weight 600. `--ls-label` and the uppercase rule in design-system.md ("Only `--fs-label` is uppercase") are no longer used.

## New tokens (and what needs them)

- `edge` (`#7a8795` / `#66788a`, 3:1 on `s1`): the Easier, Harder and Log buttons, the Reps field, the figure's ground line. Component: `SecondaryButton`, `LogControls`.
- `warn-line` (`#d9bf95` / `#5c4724`): the edge of `HonestNote` and the streak pill (`StreakPill`).
- `dang-line` (`#dcb0aa` / `#6a3b36`): the edge of `StopRule` and `AlertBanner`, replacing the `color-mix` in `AlertBanner.tsx`.
- `sh-btn` (`0 1px 2px` at 0.18 / 0.5): the solid primary button (`PrimaryButton`).
- `--fs-display-l` 3rem / 1.08 and `--fs-name-l` 1.5rem / 1.25: the head band's title and the Up first name at 840 px and up. Phones keep `--fs-display` (2.5rem) and `--fs-h`.
- Layout, not tokens, for the code brief: the 840 px top bar (64 px, 4 places and the date and streak on the right), the 7/5 split with a sticky right column (`top: 80px`), the phone footer as one row (Easier 76 px, Harder 76 px, Start the rest) over the 56 px tab bar, the content padded by 132 px plus 24 px at 360 and 390.

## App tokens the design no longer uses (keep or drop is the code brief's call)

- `--ls-label` (0.1em tracking) and the uppercase rule for `--fs-label`.
- `--accent-2` as a violet gradient partner: the seven other accents keep today's `accent-2` until the code brief re-tunes each to its own hue (3:1 on `s1`; `contrast.test` pairs `on-accent` with `accent-2`).
- `--lh-hero`, `--fs-hero` stay for the player numeral (clamp 5.5rem to 8.25rem); `--fs-mono` is used by the Session complete count only.
- `--s3` is only a pressed fill now (Easier and Harder under the finger); `--dang-bg` and `--warn-bg` lose their translucent form.
