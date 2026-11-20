fix

# sports-app critique (Up first), 2026-11-12

Read from today's shots, the builder's twins and fold renders, my own headless Playwright runs of the twins (light and dark, 1280x800, 390x844, 384x832, 360x800), the manifest, the direction and the judges' RESULT.md. The canvas `.dc.html` files carry the same phone rules as the twins I measured.

## First-screen density (measured)

| Screen | Today (current app) | Build (Up first) |
|---|---|---|
| 1280x800 | 4 of 4 exercises. Start in view in the footer (662-718). The footer covers the honest note after line 3. How it is going is off screen. | Up first plus 3 Then rows, ending at y 702. Start at 313-369 in the right card, and no footer. The note starts at 702 and the fold cuts it, but nothing covers it. Ring, tiles and grid are visible (410-790). |
| 390x844 | 4 of 4, but the second name is cut ("Glute bridge, 2-second hol…"). Start at 706-762. The footer covers the note from line 5. | Up first plus 3 rows, ending at 680, above the footer at 714. Start at 723-779. The footer covers the note (only its label peeks), the Easier/Harder helper and How it is going. |
| 360x800 | No shot exists, and the read-only brief rules out a dev server, so this cell is inferred from the 390 shot: rows are fixed 64 px single lines, so 4 of 4 probably show, with more names cut. | Up first plus Glute bridge (ends at 623, name on 3 lines). Front plank ends at 683, 13 px under the footer at 670, and Prone T raise (743) is hidden. "Bodyweight squat" wraps to 2 lines and the session facts to 2 lines. Start at 679-735. |

**What to do at 360:** see issue 1. The recipe was measured: all three Then rows end at 547/603/659, under the 670 footer, in light and dark. Glute bridge takes 2 lines and the squat name 1. No type floor or target moves, and nothing is cut. At 384x832 the build already just fits (row 3 ends at 701 against a footer at 702). So apply the recipe at `max-width:389px`, not 370.

## Regressions against today

1. **Today, phone: the Easier/Harder explanation left the buttons.** Today's footer held "Easier and harder shift today's numbers… Neither changes what comes next." directly above the two buttons. In the build it sits under the Then card, below the fold at 390 and 360. Both buttons start the session right away (their names are "Start today's session, easier/harder"), so a beginner taps them without knowing they change today only. **This clashes with ruling 1, and ruling 1 wins.** Measured at 390x844 with the sentence back in the footer: the footer top moves to 643 while row 3 ends at 662. See issue 3 for a fix that fits.
2. **Player, 1280: the stop rule left the path from the numeral to Next set.** Today reads name, figure, numeral, stop rule, then log. At 1280 the build puts the stop rule bottom-left under the figure (540-677), and the eye goes from the numeral to Log/Next set on the right without passing it. See issue 6.
3. **Player, phone: the figure lost its stage.** Today draws it in a full-width 358x165 card. The build puts it in a 116x116 well, with the drawing 96 px tall against about 112 today. The drawing itself is only about 15% smaller, so I leave it alone. Don't shrink it further while fixing issue 5.

Nothing else regressed. Today's islands survive: every exercise still sits on a card surface, and the Then list is one card with dividers, which is the conventional grouped list.

## Priority issues (ranked by cost to the user)

1. **Today at 360x800: the session doesn't fit, and ruling 4 is broken.** Glute bridge takes 3 lines (the builder's own sticky says so), against ruling 4's "at most two". Only one Then row clears the footer. Fix at `@media (max-width:389px)`:
   - Up first: `.upgrid` columns 80px / 1fr, `.upwell` 84 px tall with the figure 66 px; `.upc` padding 12px 14px 14px; `.ticks` and `.cue` margin-top 8 px.
   - Then: `.then` padding-top 12 px, `.sh` padding-bottom 4 px. Rows: `.rowtop` columns 32px / 1fr / auto, padding 6px 10px, min-height 52 px (still above 44), `.well` 32 px with a 24 px glyph. `.left` gap 8 px.
   - Measured: page scrollWidth stays 360, and the squat name fits on one line. Re-measure after issue 4, because the hyphens narrow too.
2. **Phone: the words "How to do it" are gone (ruling 3, content cut for density).** Below 840, `.how{display:none}` hides the label. The `<summary class="rowtop">` has no aria-label, so screen readers hear only the row and its numbers. What's left is a 12 px chevron glued to "reps" / "seconds", which reads as a unit picker. A beginner won't find the cues.
   - Put "Tap a row for how to do it" (13/16, weight 600, `tx2`) right-aligned on the `Then` heading line. The 28 px heading line has the room, so it costs no height.
   - Keep `.hw` in the DOM as `.vh` so each summary's accessible name ends in "How to do it".
   - Give the chevron its own 20 px accent column right of the target.
   - The new wording goes on the ask sticky beside "How to do it".
3. **Phone: Easier/Harder without their meaning (regression 1).** Keep the full sentence under the Then card. Add `aria-describedby` from both buttons to it. Show it in the footer only from `min-height:900px`: at 412x915 it fits (rows end 662, footer at 735).
4. **Every screen: hyphens print with gaps ("2 - second", "shoulder - blade", "six - week").** The cause is `.sp{font-feature-settings:"tnum" 1}` on all text: Inter's tabular hyphen is wide. I confirmed it with a 2x zoom with and without the feature. Apply tabular figures only to `.tgt`, `.bigt`, `.big`, `.cmp dd`, the tiles, the stats, the date and the grid labels. Body prose goes back to normal.
5. **Player at 360x800: the last two lines of the safety rule sit under the action sheet.** The stop rule ends at 651 and the actions start at 613. This answers the open sticky: keep the order (rule before log). Fix at `max-width:389px`:
   - `.big` 4.5rem (72 px) with padding-top 4 px, which is still the largest thing on screen;
   - `.cmp div` padding 6px 8px, `.setc` padding 10px 16px, `.figc` padding 10px, `.pl .main` gap 10 px.
   - Measured: the stop rule ends at 611 against the actions at 613 in light and dark, scrollWidth stays 360, and 384 and 390 are unaffected. The figure is untouched.
6. **Player at 1280: move the stop rule into the right column (regression 2).** Order it set card, then stop rule, then actions, with 16 px gaps. The left card keeps the name, ladder and figure. Grow `.figwell` from 300 px until the two columns end level. Measure that Next set's bottom stays at or above 784 at 1280x800 (my estimate is about 757).
7. **Today at 1280: the grid fights Start, which breaks ruling 2's intent.** The 42-day grid stretches across 410 px with 16 solid mint cells of 48x16. It is the biggest mint mass in the right column, and in dark (#2bd9a4) it is brighter than anything but Start. Cap the cells at 28 x 14 with 4 px gaps, so the grid is about 240 px wide and left-aligned under the ring. Keep the M-S axis and the week dates.

Also noted, not ranked:
- The session facts read as one run-on ("Session 17 squat rung 2 of 9"). Put a 1x12 px `line2` divider between facts; that isn't a middle-dot string.
- At 1280 the Progress head band holds a single word. Put the three stat tiles in its right half, as Today does with its facts.
- The push-target labels "5 reps / 12 reps" sit where an x-axis goes, but they are the y range. Pin them at the left end of the two dashed guide lines.
- The `‒` (U+2012) used to dodge gate 19 is a digit dash. The code brief should rewrite those sentences with a comma or a full stop.

## Strengths to keep

- **The Up first card.** The figure, the target, the 9-tick ladder and the cue sentence at 19/28 sit open together. It answers "what first, and how" before Start, which today never did.
- **Real islands on a tinted ground.** Card on page is 1.18 in light and 1.20 in dark, with an edge, `sh-1` and radius 16. Dark is designed: lighter `s1`/`s2` for elevation, the warn and danger washes re-tuned, and the surfaces still separate.
- **Start is the one solid mint block.** It is 56 px, in the sticky card at 1280 and at the bottom right of the one-row sheet on phone, within thumb reach.
- **A labelled player.** "Set 1 of 3" and the "Last time / Change / Logged" strip replace today's unlabelled "7 +1 —". The long name wraps instead of being cut.

## Heuristic scores (0-4)

1. Visibility of status: 3. The player has three look-alike segment bars (exercise, rung, set). Give the set bar its "Set 1 of 3" label and make the rung ticks 4 px tall in `tx3`.
2. Match with the real world: 3. "Up first / Then" is plain, but "rung" and "push target" are never explained (inherited).
3. User control: 3. Stop is always reachable and logging is optional. Easier/Harder start the session with their meaning off screen.
4. Consistency: 3. One card recipe and conventional navigation. The stop rule sits in different places on phone and 1280, and the chevron looks like a unit picker.
5. Error prevention: 3. At 360 the stop rule hides under the sheet until issue 5 is fixed.
6. Recognition over recall: 3. The whole session is visible at 1280 and 390. "How to do it" is hidden on phone.
7. Flexibility: 3. "Log 8" takes one tap, and Next set is always there.
8. Aesthetic and minimalist: 3. Strong islands. The grid mass and the three bars are the noise.
9. Error recovery: 3. The read-only banner and "Nothing was changed" are drawn on the Direction sheet.
10. Help: 3. The cues open in place, but the phone gives no hint they exist.

Total 30/40.

**Detector** (`detect.mjs`, run from a scratch copy with real parsers, not degraded):
- Today: 10 findings. Player: 2. Progress: 3 each theme. Direction sheet: 25.
- I dismissed all of them:
  - `overused-font` Inter: a recorded decision.
  - `cramped-padding`: on `.sp` (the page root); on `li.row` and the tile `li` (their padding is on the inner `.rowtop` or comes from flex centring); on `ol.cues` (measured while closed); on Progress's `section.card.stats` (its cells pad 16/8/12); and on the Direction sheet's specimen rows.
  - `gpt-thin-border-wide-shadow`: trips only on the Direction sheet's `.footdemo` specimen (1 px border plus `sh-2` 16 px). The product footer has only a top edge.
  - `em-dash-overuse` "56": counts `--` in the sheet's `--color-*` token labels. The sheet contains no em dash.

Keep the Up first card, the cue open, and Start as the one solid mint block. Find every pixel for 360 in spacing and wells, and none in the words.
