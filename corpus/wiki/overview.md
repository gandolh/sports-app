---
summary: What sports-app is in one paragraph, who it's for, and the constraints that shaped it.
updated: 2026-07-29
---

# Overview

**sports-app** is a zero-equipment calisthenics trainer for one user, installed as
an offline-first PWA. You open it, it already knows what today's session is, you
follow ~12 minutes of prescribed work tapping a single large button per set, and a
deterministic progression engine decides what comes next from what you actually
logged. No accounts, no social features, no streaks.

The full grilled design — every decision plus the reasoning that settled it — is
[`../../SPEC.md`](../../SPEC.md). This wiki is the synthesis layer on top of it.

## Who it's for

One person: a returning beginner (the repo owner). That single fact removes an
enormous amount of scope — no auth, no onboarding, no privacy policy, no
multi-tenant anything — and makes it possible to do things a product couldn't,
like using a hand-editable JSON file as the source of truth instead of building an
admin UI.

## The constraints that shaped everything

- **Zero equipment, no purchases.** A hard user constraint. Its consequence is
  stated openly rather than hidden: v1 cannot train pulling *strength*, only
  scapular retraction and upper-back endurance. See
  [decisions.md](decisions.md#zero-equipment-and-the-pull-gap).
- **Sweaty hands, phone on the floor.** Mid-workout, every tap is expensive. This
  killed the logging-app design and produced the guided player.
- **Decision fatigue is the real enemy.** For a returning beginner, workouts fail
  because "I don't know what to do today," so the app must arrive with the answer
  already made.
- **A missed day must not feel like failure.** This is why the cycle advances on
  training rather than on the calendar.

## The cast

| Piece | Job |
|---|---|
| **Progression engine** | Pure functions: history → today's prescription. The intellectual core. See [progression-engine.md](progression-engine.md). |
| **Ladder content** | Typed data. Five movement patterns, each a list of rungs (movement + modifier) with form cues. |
| **Session player** | The guided UI: timestamped rest timer, wake lock, big Done button, effort tap. |
| **State document** | One human-readable JSON blob. Local-first, backed up as snapshot rows in a SQLite database. |
| **Figures** | Ten SVG pose pairs on a rigid grid, with per-rung overlays. |

## Top-level layout

```
SPEC.md      the grilled v1 design — product source of truth
corpus/      this wiki + the brief lifecycle
src/         the app (created by brief 01)
```
