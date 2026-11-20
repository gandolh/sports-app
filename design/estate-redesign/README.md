# The redesign: "Up first"

This folder is the design record of Sports app's redesign. The estate redesign board, where it was drawn and approved, is a private canvas; this is a copy of the app's page on it plus the build behind that page. The owner approved it on 2026-11-13, and [brief 05](../../corpus/briefs/done/05-a-redesign-with-hallmark-on-the-estate-board.md) built it. The code is now the source of truth: where the app and these files differ, the app wins, and later work may have moved a screen on. Read this folder to see what was decided and why before reshaping a screen.

## The owner's decisions

The owner approved the whole board on 2026-11-13, with every question standing at what the board proposed unless they reopened it. The questions this app's page asked:

- **Ask:** 1. Reopened: at 840 px and wider, the four places move from the bottom tab bar to a top bar (decisions.md, 2026-09-04, "bottom tab bar"); phones keep the bottom bar. OK, or should the tab bar stay at the foot of the column on desktop too? 2. New words: "How to do it" on each Then row, "Tap a row for how to do it" on the phone's Then heading, "Up first" and "Then" in place of "Today" as the heading. OK? 3. Approve Up first (the first exercise drawn and explained, the whole session beside Start) as the sports app's direction?
- **Reopened:** Recorded (decisions.md, "The visual direction is the category standard", 2026-09-04): "bottom tab bar". Proposed: on desktop a 64 px top bar with the four places on the left and the date and streak on the right; phones keep the bottom bar. If the answer is no, the bar sits at the foot of the left column at 1280.
- **Reopened:** Recorded (design-system.md): "Only `--fs-label` is uppercase." Proposed: no tracked capitals anywhere; labels, units and the ring caption are sentence case at 13/16, weight 600 (Hallmark gates on tracked caps). The note labels read "What this slot does not train" and "Stop the set when".

Where the files below disagree, the later layer wins: the owner's decisions, then the controller's rulings, then the judges' rulings, then the directions file.

## What is here

| Path | What it holds |
|---|---|
| `directions/sports-app.md` | The director's brief: both directions (the winner is the one built), the shared fixture and the screens to draw. |
| `judge/sports-app/RESULT.md` | The blind judging against today and the rulings that came with the win. |
| `critiques/sports-app-controller.md`, `critiques/sports-app.md` | The design critic's review against today, and the controller's rulings over it. |
| `manifests/sports-app.tokens.css`, `manifests/sports-app.tokens-map.md` | The token hand-off in the app's own names, and the renamed, new and unused tokens. |
| `manifests/sports-app.board-notes.md` | What the board said beside the screens: the asks, decisions, reopened rules, open questions, the contrast table and the runner-up. |
| `work/sports-app/twins/*.html` | Each drawn screen as static HTML, light and dark: open one in a browser. |
| `work/sports-app/shots/` | The twins rendered at 1280 and 390, light and dark, WebP. `direction.webp` is the board's direction sheet. |
| `shots/sports-app/` | Today's screens as the board showed them before the redesign. |

People's names and data in the pictures come from seeded demo accounts or are invented.

## Not here

The sketches and the judges' images, the runner-up's build (its notes are in the board's notes), the build's scripts, and the screenshots taken while it was built. They stay in the estate build folder.
