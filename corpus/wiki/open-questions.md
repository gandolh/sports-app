---
summary: Only the genuinely unresolved. Answered questions are deleted from here, not archived.
updated: 2026-07-29
---

# Open questions

Delete an entry the moment it is answered — its history belongs in
[`../log.md`](../log.md), not here. This page is only trustworthy if it contains
nothing settled.

**Four questions were deleted on 2026-07-29** when the v2 grill removed adaptation.
Recorded here in one line each so nobody re-derives them: the `easy` fast-track
over-advance (the fast-track no longer exists), rung discriminability (the animated
figure's clock now differs per rung, so the cue text is no longer the only signal),
the engine's missing interior fixed point (nothing adapts, so nothing can fail to
converge), and descending calibration (there is no calibration — everyone gets the
same schedule).

## 1 — Is six weeks per rung the right pace?

**This is the only number in the programme with no evidence behind it.** The caps come
from the isometric literature, the volume from the hypertrophy meta-analyses, the
rotation order from the concurrent-training literature — but "a rung takes six weeks"
was chosen because it reproduces the three step sizes the user specified, and for no
other reason.

Consequences if it is wrong in either direction:
- **Too fast** → the schedule outruns the user, who spends most of each rung on a
  target they cannot hit. With no adaptation there is no brake.
- **Too slow** → nine months of daily training to exhaust the ladders becomes years,
  and the app feels static long before that.

**How we'll answer it:** it is a single constant per ladder (`SESSIONS_PER_RUNG_ROTATING`
= 14, `SESSIONS_PER_RUNG_DAILY` = 42) and re-tuning it does not invalidate stored state,
by design. Watch whether the mid-rung target feels roughly like 0–2 reps in reserve. That
is a felt judgement, not a metric — there is nothing to measure with.

**Two things brief 15's implementer found underneath the number, both sharper than the
number itself:**

- **"Six weeks" silently assumes daily training, and nothing says so.** 14 is
  `2.3 sessions/week × 6`. Train three times a week and a push rung takes ~14 weeks and
  the whole ladder becomes ~2 years. The app has no dates and cannot notice, so a
  realistic user gets a 2.3× slower programme than the law describes. If one thing here
  is wrong in practice it is this coupling, not the 6.
- **42 sessions on the daily block means 42 consecutive days of the identical hold.**
  Forty-two days of front plank, then forty-two of side plank, in the half of the
  programme met every single session — and it is also the *shortest* ladder, exhausted at
  24 weeks. 21 or 28 would fix the sameness but halves the time to the tuck L-sit, which
  collides with question 2. A real trade, deliberately not taken yet.

## 7 — The step between rungs is worth far more than the variant can absorb

**Found by brief 15's implementer, and it changes how the cost in
[progression-engine.md](progression-engine.md#the-cost-recorded-rather-than-argued-away)
should be read.**

The interpolation assumes rung N+1's `min` is about as hard as rung N's `max`. On some
pairs that is badly false. The worst is `push-03-knees` at 12 reps → `push-04-full` at 5:
someone who can just about manage 12 knee push-ups usually cannot do 5 full ones. Same
shape at `hinge-04` → `hinge-05` (bridge → sliding curl) and at squat 5 → 6 (split squat).

The variant buys ±2 reps against inter-rung steps worth much more than that, so **it cannot
absorb this.** The consequence: the difficulty is **front-loaded within each rung** — the
first session of a rung can be its hardest, not its easiest. The wiki describes the cost as
"sometimes too easy, sometimes too hard", which reads as evenly distributed. It isn't.

**How we'll answer it:** the honest fixes are content, not code — an intermediate rung at
the worst transitions (which question 3 already wants for squat 5→6), or a lower `min` on
the rung *after* a big step so it starts gently. Watch the first two sessions after any
rung advance.

## 2 — Does the cue text actually stop anyone from a rung they can't do?

The schedule reaches `core-04-hollow-hold` at ~3 months, `core-05-hollow-rock` at ~4,
`core-06-tuck-l-sit` at ~5.5, `squat-07-assisted-single-leg` at ~7, and
`push-09-archer` at ~8 — **on a clock rather than on readiness, with no mechanism to
step back**. The user chose to rely on each rung's own safety cue rather than cut the
rungs, gate them, or add a manual rung control
([decisions.md](decisions.md#accepted-risk--the-schedule-prescribes-risky-rungs-on-time-not-on-readiness)).

This is a **watched accepted risk**, not an unmade decision. The open part is
empirical: a paragraph is a weaker brake than not being asked, and we do not know
whether it holds.

**The first encounter is now the hollow hold at ~session 84, not the nordic negative** —
the nordic is gone, removed by brief 15's floor-only fix rather than for safety. That
makes the first test of this a lumbar-extension failure rather than a hamstring strain,
which is a materially gentler place to find out.

**How we'll answer it:** if a cue is ignored once, the mitigation to reach for is the
one-time unlock, which was designed and costs one tap roughly twice a year.

## 3 — Will the squat ladder stall at the split-squat jump?

Rungs 1–5 progress by tempo, pause and range. Rung 6 (split squat) is a genuine step
change in both difficulty and coordination, and rung 7 (assisted single-leg) more so.

**This got worse in v2, not better.** v1 had a 3-miss regress rule that would catch a
stall automatically; there is no such rule now. A ladder with one impassable rung is a
content bug the schedule cannot detect, let alone fix — the user simply arrives at a
movement they cannot perform and the app keeps asking for more of it every six weeks.

**How we'll answer it:** the fix is an intermediate rung, not a code change. Worth
pre-empting rather than waiting for — consider inserting one before the split squat
while the content is being edited anyway.

## 4 — ANSWERED 2026-07-29: yes, but not for the reason the question assumed

*Was: can an animation legibly show a two-second pause at ~120px?* Brief 18 built it and
looked at a frame-by-frame capture of `push-05` beside `push-06` at real size. **Legible.
No beat marker needed.**

The question assumed the signal is "the figure stops travelling", which at 120px and ~46px
of displacement would indeed be marginal. The actual signal is **sharpness**: the figure is
a two-frame crossfade, so it is a soft double-exposure the whole time it moves and crisp
only at the endpoints. A paused rung visibly *snaps into focus and freezes* for a third of
its loop. A change in acuity is a much stronger cue at oblique angles and low vision than a
change in position.

Kept as a note rather than deleted because it changed what we know: **the legibility rests
on the crossfade being imperfect.** A true joint-interpolating morph would look better *and
weaken this signal*, since "moving slowly" versus "stopped" is subtler than "blurred"
versus "crisp". Anyone proposing a morph is trading one for the other and should say so.

## 6 — Should the side-plank cap rise, given the clock is split between sides?

The rung splits one clock evenly between sides, so the 45-second cap is ~22s per side.
Published side-bridge norms run 65–97s per side. Either the cap is low by roughly half, or
a home programme legitimately wants less than a fitness-test norm — the isometric ceiling
evidence argues holds should be *short*, and 22s per side sits comfortably inside McGill's
own preference for brief holds.

**It was a documentation bug before it was a question:** [programme.md](programme.md) said
"per side" while the code split the clock, and the mismatch survived a whole design pass
because nobody multiplied by two.

**How we'll answer it:** it is one `range` on one rung. Raise it to 30→90 if ~22s per side
feels trivial in practice; leave it if the last 10 seconds are already where form goes.

## 5 — Does the daily core and posture block survive contact with real use?

Every session now ends with two extra exercises, every day, forever. It is the change
that made posture progress at a sane rate and it is also the most skippable thing in
the app — and because nothing is measured, **the app cannot tell that it is being
skipped**, so the schedule keeps advancing those ladders regardless.

**How we'll answer it:** the honest answer is a felt one. If it gets skipped, the
options are to shorten it (one set), move it to alternate days, or put it *before* the
strength work so it cannot be the thing you drop.
