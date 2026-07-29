---
summary: Locked product and programme calls with the reasoning that settled them — read before proposing an alternative.
updated: 2026-07-29
---

# Decisions

Settled **product and programme** calls. Implementation choices live in
[technical-decisions.md](technical-decisions.md). **Do not relitigate either** without
an explicit revisit plus a [`../log.md`](../log.md) entry.

> **v2, decided 2026-07-29 in a second grill.** The app no longer adapts. SUPERSEDED
> sections are kept only where the old reasoning explains the new choice.
> [`../../SPEC.md`](../../SPEC.md) describes v1; this page wins where they disagree.

## The governing decision — the app measures nothing

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

## Progression is a fixed schedule — a rung takes ~6 weeks

One law generates every number in the programme:

```
step = span ÷ (sessions of that pattern in ~6 weeks)
```

| Ladder | Sessions/week | Span | Step |
|---|---|---|---|
| Push · squat · hinge | 2.3 | 5→12 reps | +1 rep per 2 sessions |
| Core (daily) | 7 | 20→60s | +1s per session |
| Posture (daily) | 7 | 10→30s | +1s per 2 sessions |

The user specified all three of those steps independently before the law was derived;
the law reproduces them exactly, which is why it is stated as one rule rather than
three constants. At the top of a rung the next rung starts at its own bottom target.

**Reps cap at 12** — past ~12–15 bodyweight reps the adaptation drifts from strength
to endurance and there is no load to add.

**At the top of a ladder you stay there and the target cycles** bottom→top→bottom
indefinitely. That is the honest ceiling of floor-only training, not a failure state,
and the account page says so. Ladders run out at roughly 9 months of daily training.

## Easy / medium / hard, picked per session, reps only

*Chosen 2026-07-29, reversing "no effort input anywhere" (below) — but only as a
**load dial**, never as a signal.*

The home page offers today's training in three variants. The pick changes the target
by **−2 / 0 / +2 reps** (floored at 3; **hard is a no-op at 12**) or the equivalent
seconds tier for holds, and nothing else. Sets, movements and rungs are identical.

**The pick has no effect on the schedule.** An easy day banks no debt and costs no
progress; tomorrow's prescription is what it was always going to be. This is the
whole point — a bad day must be free.

The pick *is* recorded in history, because it is the only genuinely variable input in
the app and the account page has nothing else to work with.

### SUPERSEDED — "no effort input anywhere"

v1 removed both the post-set effort tap and a pre-session difficulty picker, on the
grounds that the engine read them and read them badly. **The engine no longer reads
anything**, so the objection has no force: a picker that feeds nothing cannot corrupt
anything. The rejection of the *post-set* tap stands permanently — asking after the
work is asking at the worst possible moment.

## The week — Push · Legs · Cardio, plus a daily core and posture block

*Rotation chosen 2026-07-29 from the evidence, at the user's request. Full shape and
volume arithmetic in [programme.md](programme.md).*

Three positions, rotating, one per training session, never a date. Two calls inside it
are locked and easy to break by accident:

- **Cardio always follows legs and never precedes it.** With daily training, adjacency
  is unavoidable unless legs days go back-to-back — which breaks 48-hour recovery — so
  the achievable optimum is the *order*. The concurrent-training literature cares
  about strength-before-conditioning; `Legs → Cardio → Push` satisfies it.
- **The core and posture block is daily.** Low-fatigue work that responds to
  frequency, targeting the half of the goal set a desk job damages. It also equalises
  pacing: at one session per rotation, core rungs took twice as long as push rungs.

## Hold durations are capped by evidence, not by symmetry

*Researched 2026-07-29 at the user's request. The table is in
[programme.md](programme.md#hold-caps-per-rung).*

Each timed rung carries its own range — a front plank runs 20→60s, a tuck L-sit
10→30s — rather than one range per ladder. McGill, whose research the anti-extension
approach comes from, programs **10-second holds in a reverse pyramid**, not long holds;
transfer drops sharply past 60s, and the L-sit is limited by the wrists rather than the
abdominals.

## Four screens, and only one of them is the training flow

The v1 "one flow, nothing to navigate" constraint stands *for the training path*.
Two pages sit beside it, each with a stated justification:

| Route | Job |
|---|---|
| `/` | Today's training, the three variants, then the exercises one at a time, then done. |
| `/week` | The next 7 sessions laid out calendar-style. **No dates.** |
| `/account` | Milestones reached, total work ever. |
| `/login` | Username and a password that is accepted and discarded. |

`/week` earns its place because a fixed schedule is knowable in advance and seeing it
is reassuring; `/account` because milestones are the only thing a fixed schedule can
honestly celebrate. Neither is on the path to a first set.

**Dropped:** the extras pool, the guided warmup, and progress charts. A chart of a
fixed schedule against session number is a straight line containing no information —
that is not a rendering problem, it is the design being honest.

## Multi-user, with passwords that are never checked

*Chosen 2026-07-29, reversing "single user, no auth".*

A username keys its own state document, so two people can train on one deployment.
A password field exists, and the value is **accepted and immediately discarded** —
never stored, never compared. Storing an unchecked password buys nothing and collects
real passwords people reuse elsewhere.

**Anyone who knows a username can read that person's training history.** That is
accepted for training data on a personal deployment. No later feature may treat the
login screen as a security boundary.

## No dates anywhere in the app

There is no concept of a missed day: no streak, no heatmap, no red squares, no debt.
Skip two weeks, open the app, resume at exactly the next session. Returning after a
long gap must feel identical to returning after one day, because that is when the app
most needs to feel easy.

This survived the v2 redesign intact. `/week` shows the next 7 *sessions*, not days;
milestones key off session number; total-work-ever needs no clock. History does store
`completedAt` timestamps — nothing in the UI may read them.

## Accepted risk — the schedule prescribes risky rungs on time, not on readiness

*Decided by the user 2026-07-29 against the recommendation. Recorded, not relitigated.*

With no adaptation, the schedule reaches the hollow hold at ~3 months, the hollow rock
at ~4, the tuck L-sit at ~5.5, the assisted single-leg squat at ~7, and the archer
push-up and pistol progression at ~8 — regardless of whether the user can perform them,
and with no mechanism to step back.

**The nordic negative is no longer on that list** — it was the sharpest item when the
decision was taken, and brief 15 removes it because the couch anchor violates the
floor-only constraint. The hinge ladder now has no injurious rung at all.

Four mitigations were offered (cut the rungs, a one-time unlock, a manual rung control,
or nothing) and the user chose to rely on the rungs' own cue text, which already opens
with an explicit safety check and a stop signal. The one consequence that follows:
**on flagged rungs the safety cue renders first and visually separated**, not as item
one of four. See [open-questions.md](open-questions.md).

## Standing decisions from v1, unchanged

### Zero equipment means floor and bodyweight only, in one room
*Reaffirmed three times, most recently against a specific alternative.* A broom handle
across two chairs and a towel round a sofa leg were both offered as no-purchase ways
to close the largest gap in the programme. Both declined.

Standing consequence the app must state rather than hide: **lats, elbow flexors and
grip receive no meaningful stimulus, and no pulling strength is trainable.**
Self-resisted pull substitutes have no training literature and must never be presented
as replacing a pull — see [programme.md](programme.md#the-pull-slot-is-postural-and-the-app-says-so).

### A rung is one movement plus a modifier
Not a different exercise. Difficulty comes from tempo, pause, range, leverage and
unilateral work — the levers that substitute for load when you cannot add load. Every
push rung is a push-up.

### Calisthenics, not tai chi
Tai chi is continuous 3D motion, not teachable from text and figures — a video content
project, not a software one.

### Cardio is intensity, not rep count
5 rounds hard/easy, lower-body, floor only. **Intensity is the active ingredient** — a
high-rep set on an easy movement ends when the muscle quits, not when the
cardiovascular system is taxed. Protocol and the honest limit it reaches are in
[programme.md](programme.md#the-cardio-day).
