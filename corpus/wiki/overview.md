---
summary: What sports-app is in one paragraph, who it's for, and the constraints that shaped it.
updated: 2026-07-29
---

# Overview

**sports-app** is a zero-equipment calisthenics trainer, installed as an offline-first
PWA. You open it, it already knows what today's session is, you pick how hard a day
you're having, and you work through the exercises one page at a time tapping Next.
It takes about twelve minutes. It never asks you anything else.

**The app measures nothing.** There is no counter, no completion signal, and no
adaptation — the prescription grows on a fixed schedule at roughly one ladder rung
every six weeks, and pressing Next means only that you're ready for the next thing.
That is the governing design decision and it is what makes everything else small; see
[decisions.md](decisions.md).

[`../../SPEC.md`](../../SPEC.md) is the v1 design document and is **partly superseded**
— it describes the adaptive engine this app no longer has. Where it disagrees with
this wiki, the wiki wins until SPEC.md is revised.

## Who it's for

A returning beginner, training at home on the floor in one room with no equipment at
all. v2 added weak multi-user support (a username, a password nobody checks) so a
second person can train on the same deployment — but the product is still shaped by
one person's constraints, not by a market.

## The constraints that shaped everything

- **Zero equipment, no purchases.** A hard constraint, reaffirmed three times. Its
  consequence is stated openly rather than hidden: the app cannot train pulling
  *strength*, only scapular retraction and upper-back endurance.
- **Sweaty hands, phone on the floor.** Mid-workout every tap is expensive. This
  killed the logging-app design and produced the one-exercise-per-page player.
- **Decision fatigue is the real enemy.** Workouts fail because "I don't know what to
  do today," so the app must arrive with the answer already made.
- **A missed day must not feel like failure.** This is why there is no date anywhere
  in the app and the rotation advances on training, not on the calendar.
- **Trust over measurement.** Any feature that needs to know what you actually did
  cannot exist here. That is a constraint, and it removed about half the codebase.

## The cast

| Piece | Job |
|---|---|
| **The schedule** | Pure functions: sessions completed → today's prescription. One interpolation, no branches. See [progression-engine.md](progression-engine.md). |
| **Ladder content** | Typed data. Five movement patterns, each a list of rungs (movement + modifier) with form cues and its own evidence-based cap. |
| **The player** | One exercise per page: animated figure, the number, three dots, a Next button. |
| **State document** | One human-readable JSON blob per user. Local-first, backed up as snapshot rows in SQLite. |
| **Figures** | Five SVG poses, animated on a clock driven by each rung's modifier data. |

## Top-level layout

```
SPEC.md      the v1 design — partly superseded by the v2 grill
corpus/      this wiki + the brief lifecycle
src/         the app
server/      the zero-dependency SQLite state service
```
