---
summary: The three v3 reversals, the original reasoning each one overturned, and the cost each purchase carries — read before re-deriving a rule that was deliberately dropped.
updated: 2026-09-04
---

# Reversals

Split out of [decisions.md](decisions.md) on 2026-09-04, when the v3 direction round
reversed three locked decisions and that page passed the 200-line cap for the third
time. [decisions.md](decisions.md) states **what is true now**; this page holds the
arguments that were overturned, **verbatim and unedited**.

They are kept for one reason. Each of these rules was load-bearing — other decisions were
justified by them, and those decisions did not move. Deleting the argument would leave
the consequences standing with nothing under them, and the next reader would either
rebuild the rule from scratch or quietly assume it still holds. Both are worse than a
page of superseded prose.

**How to read a section here:** it is history, not policy. Nothing on this page
constrains new work. What it does is name the cost of the reversal, so that cost gets
designed for instead of discovered.

## The three reversals, and what each one cost

| Reversed | Was | Cost now owed a design answer |
|---|---|---|
| The app measures nothing | No counter, no completion signal, no adaptation | Autoregulation was the user's *because the engine could not see effort*. With a log, the temptation to adapt off it returns — and the fixed schedule dies the moment it is taken. |
| No dates anywhere | No streak, no heatmap, no "3 days ago", no debt | **Returning after two weeks no longer looks identical to returning after one day** — the app's worst moment, previously answered by construction. |
| No comparison affect | `Last time: 3×7` never coloured; regressions stated in words | The argument was that comparison affect is "guilt with extra steps". Nothing has refuted it; it was outranked. |

The first row is the one to watch. The other two are visible on screen and will be
noticed if they go wrong. That one is invisible: an engine quietly adapting off captured
data looks like a feature and turns every number in
[progression-engine.md](progression-engine.md) into a lie.

## SUPERSEDED — the governing decision — the app measures nothing

*Stated by the user 2026-07-29: "trust the user. Don't adapt. The user can take its
time to do the reps if it's too hard for him. Only next button."*

There is **no counter, no timer that records, no completion signal, and no
adaptation**. The app tells you what to do; pressing Next means only that you are
ready for the next thing. It never infers whether you did the work, and never
changes its plan because of what it thinks happened.

This outranks every other product decision, and it deletes a whole category of
feature: anything that needs to know what you actually did cannot exist. That
includes the adaptive engine, progress charts against capability, deloads, streaks,
and any notion of a missed set.

**What it costs, stated plainly:** the prescription is sometimes too easy and
sometimes too hard, and the app cannot tell which. The user absorbs that, by choice.

### Why this is defensible rather than merely simple

Proximity to failure matters most for low-load hypertrophy, and it matters *more* the
lighter the load ([training-science.md](training-science.md)). The adaptive engine never
had access to it — it saw reps completed, a poor proxy. **Autoregulation moved from the
engine to the user**, who is the only party that can actually assess it.

## SUPERSEDED — no dates anywhere in the app

There is no concept of a missed day: no streak, no heatmap, no red squares, no debt.
Skip two weeks, open the app, resume at exactly the next session. Returning after a
long gap must feel identical to returning after one day, because that is when the app
most needs to feel easy.

This survived the v2 redesign intact. `/week` shows the next 7 *sessions*, not days;
milestones key off session number; total-work-ever needs no clock. History does store
`completedAt` timestamps — nothing in the UI may read them.
