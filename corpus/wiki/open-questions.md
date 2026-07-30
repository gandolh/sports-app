---
summary: Only the genuinely unresolved. Answered questions are deleted from here, not archived.
updated: 2026-07-30
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

**Five more were answered by the user on 2026-07-30** — questions 1, 2, 3, 5 and 6.
What each answer settled is in [decisions.md](decisions.md); the reasoning trail is in
[`../log.md`](../log.md). One is left.

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

**Why the 2026-07-30 answers did not close this, though they came close.** The user
accepted difficulty ("it's ok if it gets difficult") and accepted arriving at rungs on a
clock, which retired questions 2 and 3. Both of those were about *whether the user is
willing to meet a hard rung*. This one is not: it is the claim that the interpolation
**misrepresents where the difficulty sits inside a rung**, so the app displays a smooth
ramp over a step function. Accepting hard sessions does not make a wrong curve right, and
it is the only remaining item that is a defect rather than a preference.

**How we'll answer it:** the honest fixes are content, not code — an intermediate rung at
the worst transitions, or a lower `min` on the rung *after* a big step so it starts gently.
Watch the first two sessions after any rung advance. Note that question 3's answer removed
the other reason to add an intermediate squat rung, so if one is ever added it will be for
*this* reason alone.
