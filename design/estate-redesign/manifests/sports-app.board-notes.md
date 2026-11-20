# The board's notes: Sports app

The estate redesign board is a private canvas. This file copies what its page for this app said beside the screens: the owner's asks, the decisions, the rules the design reopened, the open questions and the Floor. The owner's answers are in [README.md](../README.md#the-owners-decisions).

## Asks to the owner

- 1. Reopened: at 840 px and wider, the four places move from the bottom tab bar to a top bar (decisions.md, 2026-09-04, "bottom tab bar"); phones keep the bottom bar. OK, or should the tab bar stay at the foot of the column on desktop too? 2. New words: "How to do it" on each Then row, "Tap a row for how to do it" on the phone's Then heading, "Up first" and "Then" in place of "Today" as the heading. OK? 3. Approve Up first (the first exercise drawn and explained, the whole session beside Start) as the sports app's direction? (beside `sports-app-direction`)

## Decisions

- The Up first card shows its movement cue open and has no How to do it toggle; the figure is the app's own Squat rig in its bottom pose, with its descent arrow, in an s2 well. Everything else is a plain line glyph in a well (hinge, plank, prone), not a rig [conv: the sketch's choice]. (beside `sports-app-proposed-today-1280`)
- The Then card holds the other three exercises as one row each (glyph, name, target, How to do it) with the honest note inset under the last row, so the whole session is above the fold at 1280x800 and at 390x844. Rows keep their right-aligned target column; the disclosure opens the rung's three cues in place and opens no screen. (beside `sports-app-proposed-today-1280`)
- Start is the strongest thing in the right column: a 56 px solid mint button (no gradient) in a sticky card with the helper sentence and Easier | Harder at 48 px. How it is going sits under it as a quiet card: a smaller ring, thinner tiles, a lighter grid. (beside `sports-app-proposed-today-1280`)
- The streak grid is six weeks, Monday first, with a weekday axis (M to S) and the week's start date on each row; the last row's three future days are drawn as empty outlines. It is named "Trained on 16 of the last 42 days" as before. (beside `sports-app-proposed-today-1280`)
- On a phone the footer is one row (Easier, Harder, Start workout) over the tab bar, so the session fits above it. The helper sentence sits under the Then card and is linked to both buttons for screen readers; on screens 900 px or taller it shows in the footer above them. Tabs, buttons and rows stay at 44 px or more. (beside `sports-app-proposed-today-390`)
- The phone rows keep a way to the cues: "Tap a row for how to do it" on the Then heading line, a chevron in its own column, and the label "How to do it" kept for screen readers. At 390 and 360 the long name wraps to two lines and is never cut; the 360 recipe (below 390) tightens wells, padding and the target size, not type floors. (beside `sports-app-proposed-today-390`)
- Player at 1280: a slim session bar over a 7/5 split. The left card holds the name, the rung ladder and a large figure stage; the right column reads set card (numeral, Last time | Change | Logged), then the stop rule, then Log and Next set, so the eye passes the safety rule on its way to the buttons. On a phone the order is figure row, set card, stop rule, actions pinned at the foot. (beside `sports-app-proposed-player-1280`)
- The stop rule keeps its danger hue, now a solid wash with a labelled edge; its sentence stays at 19 px. (beside `sports-app-proposed-player-1280`)
- Progress at 1280: the three totals in one card, the push-target chart wide on the left, the honest note and the milestone on the right. The chart is the app's fixed six-week sawtooth drawn in one accent line, with today as a dot; the note says it plots the schedule, not capability. (beside `sports-app-proposed-progress-1280`)

## Reopened rules

- Recorded (decisions.md, "The visual direction is the category standard", 2026-09-04): "bottom tab bar". Proposed: on desktop a 64 px top bar with the four places on the left and the date and streak on the right; phones keep the bottom bar. If the answer is no, the bar sits at the foot of the left column at 1280. (beside `sports-app-proposed-today-1280`)
- Recorded (design-system.md): "Only `--fs-label` is uppercase." Proposed: no tracked capitals anywhere; labels, units and the ring caption are sentence case at 13/16, weight 600 (Hallmark gates on tracked caps). The note labels read "What this slot does not train" and "Stop the set when". (beside `sports-app-direction`)

## The Floor

- Contrast is scripted over 32 pairs in both themes: text min 4.93 light and 5.20 dark, UI parts and focus 3.06 and 3.15; each card against the page is 1.18 and 1.20 with a 1.38 and 1.94 edge. Headless at 1280, 1100, 1024, 768, 390 and 360 in both themes: no page overflow and no control spilling its box (exit 0 over 36 runs); phone targets 44 to 56 px. First screen: at 1280x800 the Up first card and all three Then rows end at y 702; at 390x844 they end at y 635 above the 714 footer; at 360x800 they end at y 651 above the 670 footer. Glute bridge takes two lines at 1280, 390 and 360. At the end of the scroll at 360 and 390 the last card sits 26 px above the footer, which is padded 132 + 24 px. Player at 360x800: the whole stop rule ends at y 588, above the actions at 596. Player at 1280x800: Next set ends at y 731, both columns end level at 756. Sloplint --scope app --render: 0 FAIL on all six twins; 26b, 39b (the 56 px primary) and 72 (cue list) are waived with reasons; the one WARN is accent-ink against the new ground. The direction sheet draws the states for all three screens. (beside `sports-app-direction`)

## Other notes

- Answered: the stop rule stays before the log row. At 360x800 the compact recipe (smaller numeral, tighter padding) puts the whole rule above the pinned actions.
- Drawings: Squat is the app's own rig (client/src/ui/figures/Squat.tsx, bottom pose). Hinge, plank and prone are simple line icons for the row wells; the player draws only the squat. Both are static here.
- Round 2 changes: tabular figures now apply to numbers only, so hyphens print without gaps; the streak grid is capped at 28 x 14 cells; the session facts get a divider at 1280; the push-target labels sit at the ends of the two guide lines. Not done: moving the Progress totals into the head band (the totals card stays). Copy: the app's em dashes are drawn as the figure dash U+2012 because Hallmark gate 19 rejects the em dash; the code brief may keep the app's em dash or rewrite those sentences with a comma or a colon. The grid label stays "Last 42 days"; the app has no error text under the Reps field, so none is drawn.
- Research checklist deviations: item 2 (a rail or sidebar on desktop) is a top bar here, the reopened decision above; item 6 (six type sizes): the app's recorded scale has ten (17 px body and 19 px cue floors) and is kept; item 8 (one hairline): the app has line and line2 plus the new edge; item 10 (48 px on phone): Stop is 44 px, the app's tap-min, and rows and tabs are 56. There is no menu, toast or dialog in the app, so none is drawn.
- Handoff: manifests/sports-app.tokens.css and sports-app.tokens-map.md carry the tokens in the app's own names; the other seven accents' accent-2 values are left to the code brief.

## Contrast, as measured

| Pair | Light | Dark | Needs |
|---|---|---|---|
| tx on bg | 16.11 | 17.51 | 4.5 |
| tx on s1 (names, targets, cue) | 18.61 | 14.6 | 4.5 |
| tx on s2 (figure, log strip) | 15.8 | 12.73 | 4.5 |
| tx on warn-bg (note body) | 16.47 | 13.94 | 4.5 |
| tx on dang-bg (stop rule body) | 16.09 | 14.87 | 4.5 |
| tx2 on bg (date, facts) | 6.15 | 9.05 | 4.5 |
| tx2 on s1 (meta, units, helper) | 7.11 | 7.54 | 4.5 |
| tx2 on s2 (tile labels, ring caption) | 6.04 | 6.58 | 4.5 |
| tx3 on s1 (chart axis words) | 5.81 | 5.96 | 4.5 |
| tx3 on s2 | 4.93 | 5.2 | 4.5 |
| accent on s1 (How to do it, current place, links) | 5.88 | 9.05 | 4.5 |
| accent on bg | 5.09 | 10.86 | 4.5 |
| accent on s2 (figure glyphs) | 5 | 7.89 | 4.5 |
| on-accent on accent (Start, Next set) | 5.57 | 9.17 | 4.5 |
| warn on warn-bg (note label, streak count) | 5.5 | 8.5 | 4.5 |
| dang on dang-bg (stop-rule label) | 5.23 | 6.71 | 4.5 |
| dang on s1 | 6.05 | 6.58 | 4.5 |
| edge on s1 (Easier, Harder, Log border) | 3.6 | 3.62 | 3 |
| edge on s2 (field edge, figure ground line) | 3.06 | 3.15 | 3 |
| accent on s1 (ring, rung tick 2, trained day) as a UI part | 5.88 | 9.05 | 3 |
| accent-2 on s1 (ring far end) | 8.07 | 11.91 | 3 |
| line2 on s1 (inactive rung ticks) | 1.96 | 2.12 | 1.5 |
| accent on bg (focus ring on the ground) | 5.09 | 10.86 | 3 |
| accent on s1 (focus ring on a card) | 5.88 | 9.05 | 3 |
| warn-line on warn-bg (note edge; needs 1.3) | 1.54 | 1.78 | 1.3 |
| dang-line on dang-bg (banner edge; needs 1.3) | 1.65 | 1.83 | 1.3 |
| SURFACE s1 on bg (card against the page; needs 1.09 or an edge) | 1.16 | 1.2 | 1.15 |
| EDGE line on bg (the card's 1px edge; needs 1.3) | 1.38 | 1.94 | 1.3 |
| EDGE line on s1 (row dividers, empty-cell edge) | 1.6 | 1.62 | 1.3 |
| s2 on s1 (wells; needs 1.09) | 1.18 | 1.15 | 1.09 |
| grid0 on s1 (untrained day; decorative, the label carries the count) | 1.25 | 1.32 | 1.09 |
| line2 on bg (top bar foot) | 1.69 | 2.54 | 1.5 |

## The runner-up

**Runner-up: A, Straight, at full fidelity (sketch only, not built)**

Note: how this direction was picked. Two directions were sketched (A evolve today, B up first) and two judges compared every pair against today, in both orders, at 1280 light and 390 dark. All 12 verdicts agreed: B won 4, A 2, today 0. Today lost on its off-palette gradient Start, its dim Easier and Harder labels, a cut exercise name and no way to learn a movement. A lost to B because at 1280 it stays a phone column centred on the page, and on the phone the first move's how-to sits behind a tap. Say so here if you'd rather keep today's one-column list (A).

## The artboards on the board

- Direction · Up first
- Today · 1280 · light · today
- Today · 390 · light · today
- Player · 1280 · light · today
- Player · 390 · light · today
- Progress · 1280 · light · today
- Progress · 390 · light · today
- Today · 1280 · light · proposed
- Today · 390 · dark · proposed
- Player · 1280 · light · proposed
- Player · 390 · dark · proposed
- Progress · 1280 · light · proposed
- Progress · 390 · dark · proposed
- Today · 390 · dark · first screen · proposed (fixed 390 x 844 frame, not a fluid page: all four exercises above the footer)
- Runner-up A, Straight, at full fidelity · light 1280 (sketch)
- Runner-up A, Straight, at full fidelity · dark 390 (sketch)
