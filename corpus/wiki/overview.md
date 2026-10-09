---
summary: What sports-app is in one paragraph, who it's for, and the constraints that shaped it.
updated: 2026-10-09
---

# Overview

**sports-app** is a zero-equipment calisthenics trainer, installed as an offline-first
PWA. You open it, it already knows what today's session is, you pick how hard a day
you're having, and you work through the exercises one page at a time tapping Next.
It takes about twelve minutes. It never asks you anything else.

**The prescription never adapts to what you log.** Since 2026-09-04 the app records
what you did (optional logged sets), shows dates, a streak and a calendar, and compares
against last time. None of that reaches the schedule: it grows at roughly one ladder
rung every six weeks, as a pure function of sessions completed, and a logged value may
never feed it. That is the governing invariant and it is what keeps everything else
small; see [decisions.md](decisions.md) and [reversals.md](reversals.md), which holds
the "measures nothing" decision this replaced.

[`../../SPEC.md`](../../SPEC.md) is the v1 design document and is **partly superseded**
— it describes the adaptive engine this app no longer has. Where it disagrees with
this wiki, the wiki wins until SPEC.md is revised.

## Who it's for

A returning beginner, training at home on the floor in one room with no equipment at
all. the app supports more than one person, each signed in through Ward, with one
state document per person on the service — but the product is still shaped by
one person's constraints, not by a market.

## The constraints that shaped everything

- **Zero equipment, no purchases.** A hard constraint, reaffirmed three times. Its
  consequence is stated openly rather than hidden: the app cannot train pulling
  *strength*, only scapular retraction and upper-back endurance.
- **Sweaty hands, phone on the floor.** Mid-workout every tap is expensive. This
  killed the logging-app design and produced the one-exercise-per-page player.
- **Decision fatigue is the real enemy.** Workouts fail because "I don't know what to
  do today," so the app must arrive with the answer already made.
- **A missed day must not feel like failure.** The rotation advances on training, not
  on the calendar, so a skipped day advances nothing. Dates are displayed since
  2026-09-04 but never schedule anything.
- **Logs report; they do not steer.** What you log may be shown and compared. It may
  never change the prescription.

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
server/      the Fastify + SQLite state service
```
