---
summary: Locked design and tech choices with the reasoning that settled them — read before proposing an alternative.
updated: 2026-07-29
---

# Decisions

Settled **product and programme** calls. Implementation choices live in
[technical-decisions.md](technical-decisions.md). **Do not relitigate either** without
an explicit revisit plus a [`../log.md`](../log.md) entry. Full reasoning in
[`../../SPEC.md`](../../SPEC.md).

## Product

### The app stays simple — one flow, nothing to navigate
*Stated by the user 2026-07-29, verbatim intent: "open it, do the exercises, finish,
come tomorrow."*

This is the **governing constraint on scope**, and it outranks any individual feature
idea. The whole app should be one path: open → today's session is already decided →
do it → done → leave. No dashboards, no navigation hierarchy, no configuration
surface you must visit before training, no reason to open the app except to train.

Practical tests for any proposed feature:
- Does it sit **on** the open→train→done path, or beside it? Beside-the-path screens
  need an explicit justification, not just a use case.
- Would a first-time user reach their first set without touching it? If not, it is in
  the way.
- Does it give the user a reason to open the app *without training*? That is usually
  a reason not to build it.

An optional **"extra exercises if needed"** section is in scope: it hangs off the end
of a finished session rather than sitting in front of it, so it does not violate the
above.

### No effort input anywhere — one level only
*Decided 2026-07-29, superseding the post-set effort tap and a proposed pre-session
difficulty picker. See [`../log.md`](../log.md).*

The app never asks how hard anything felt, before or after. No easy-ok-hard tap, no
reps-in-reserve question, no difficulty selector. The engine's only input is **did you
complete the prescribed work**, and difficulty grows one step per session.

Consequences, all accepted knowingly:
- The `easy` fast-track is gone, so **calibration is descending** — ladders start
  mid-ladder and the 3-miss regress rule walks you down. A missed set is zero-input
  information; a question is not.
- The 25% hold over-advance is solved by **deleting** the unreliable isometric effort
  signal rather than refining it. Simulation showed the effort signal was the only lever
  that moved that number.
- The engine can no longer tell 3×12 with five reps in reserve from a genuine 3×12,
  which the evidence says matters more at low load
  ([training-science.md](training-science.md)). That autoregulation burden now sits with
  the user, by choice.

### Cardio gets its own day, twice a week
*Decided 2026-07-29 after an evidence review; supersedes "no cardio in v1".*

Cycle becomes **A · B · C · Cardio · A · B · Cardio**. Cardio is
**5 × 60s hard / 90s easy**, ~13 min, one room, floor only, zero equipment — the shape of
the only trial that matches these constraints (+3.05–3.45 mL/kg/min VO2peak, 100%
adherence, no adverse events).

Three non-obvious constraints, each with a reason:
- **60-second intervals, not 20.** Short-interval HIIT beats nothing but loses to
  longer intervals; 4×4min gave 6.5% VO2max vs 3.3% for 8×20s.
- **Lower-body movements only** (high knees, fast bodyweight squats). Two of the three
  strength days are upper-body/trunk, so burpees and mountain climbers collide with both.
- **Twice weekly, not three times.** Three would cut strength to ~4.7 sets/pattern/week
  *and* exceed the impact-volume ceiling the injury literature supports.

**Intensity is the active ingredient, not reps or speed.** A high-rep set on an easy
movement ends when the muscle quits, not when the cardiovascular system is taxed —
that is a pressor response, not aerobic training. Tabata's own author published a note
that copying 20/10 intervals while dropping the intensity requirement yields no VO2max
improvement. Prescribe by breathlessness, never by rep count.

Honest limit to state in the app: this reaches roughly **20–45% of the guideline aerobic
minimum**. Fitness gains are largely achievable; the volume-dependent benefits (blood
pressure, lipids, the dose-response mortality curve) are not.

### Zero equipment means floor and bodyweight only, in one room
*Reaffirmed 2026-07-29 for the third time, against a specific alternative.*

A broom handle across two chairs (a supine row) and a towel round a sofa leg were both
offered as no-purchase ways to close the largest gap in the programme. **Both declined.**
All training happens in one room, on the floor, with no anchor and no object.

Standing consequence, which the app must state rather than hide: **lats, elbow flexors
and grip receive no meaningful stimulus, and no pulling strength is trainable.** Prone
Y-T-W raises are real mid-trapezius work and do essentially nothing for the lats.
Self-resisted and friction-based pull substitutes have **no training literature at all**
and must never be presented as replacing a pull.

### Calisthenics, not tai chi
Tai chi is continuous 3D motion and is not teachable from text and static images —
it requires licensed or self-filmed video, which makes it a content project rather
than a software one. Calisthenics has objective, encodable structure.

### Single user, no auth
No accounts, no onboarding, no privacy policy. The core loop of a workout app is
only discoverable by using it while sweaty and tired, so v1 optimizes for
dogfooding rather than distribution.

### A rung is one movement plus a modifier
Not a different exercise. Difficulty comes from **tempo, pause, range of motion,
leverage, and unilateral work** — the four levers that substitute for added load
when you cannot add load. Every push rung is a push-up; every squat rung is a
squat.

This was a late reframe and it paid off in four places at once: exercises stay
simple and familiar, adaptation stays in the strength range, sessions stay at
12–13 min, and the figure count collapses because rungs share a pose.

### Reps cap at 12
Adding reps is the primary progression lever, but past ~12–15 reps bodyweight work
stops driving strength adaptation and becomes muscular endurance. With no way to
add load, reps-forever means plateauing as "good at high-rep squats." At the cap
the engine switches lever: next modifier, reset to 3×5.

### The cycle advances on training, never on the calendar
There is no concept of a missed day. No streak, no heatmap, no red squares, no
debt. Skip two weeks, open the app, and it resumes at exactly the next session.

**Rationale:** returning after a long gap must feel identical to returning after
one day, because that is precisely when the app most needs to feel easy. Any
feature that reintroduces guilt mechanics contradicts this decision.

### No LLM planning, no adaptive autoregulation
Novel workouts every day are a bug, not a feature: they destroy the ability to
distinguish progress from noise, and no model has a reliable picture of
accumulated fatigue. Autoregulation demos beautifully and ramps you into injury.
The engine is deterministic and every prescription is traceable to logged history.

### Calibration without an onboarding quiz — SUPERSEDED
The original mechanism was an `easy`-rated fast-track. Effort input has since been
removed entirely, so calibration is now **descending** — see *No effort input
anywhere* above and [progression-engine.md](progression-engine.md). The rejection of
an onboarding quiz still stands, and now stands for a second reason: a quiz is a
question, and a missed set is free information.
