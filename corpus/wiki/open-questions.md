---
summary: Only the genuinely unresolved. Answered questions are deleted from here, not archived.
updated: 2026-09-04
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

## 8 — The three honest warnings have nowhere to live in the category standard

*Raised 2026-09-04 by the losing directions in the v3 direction round.*

`POSTURAL_NOTICE`, the cardio dose limit and the safety-critical first cue are the app's
most product-specific content and the thing that most distinguishes it from every
competitor — this is the app that says out loud what floor-only training cannot do.

**The chosen direction has no vocabulary for them.** The category standard's register is
encouragement; its only warning affordances are a red error toast and a destructive
confirm, and neither is right for "the gap is real and this app does not pretend
otherwise". Of the four worlds shown, only the guidebook had a native slot — the access
note, a credible warning that is not an alarm.

**Why this is a defect and not a preference:** presenting postural work as pulling
strength is a safety misrepresentation with a physical consequence
([programme.md](programme.md#the-pull-slot-is-postural-and-the-app-says-so)), so the
notice is not droppable. The category's habit under pressure is to drop it, and the
guardrail that used to prevent that went with `design-guardrails.md`'s authority.

**How we'll answer it:** design the warning affordance explicitly, before the screens
that need it, rather than discovering at layout time that there is nowhere to put it.

## 9 — Every rung's fourth cue is a stop rule, and no design has ever surfaced it

*Found 2026-09-04 while building the physio-handout mockup against real ladder content.*

Look at the ladders: "Stop the set when your hips sag, your head pokes forward…", "Stop
the clock when your shoulders creep toward your ears…", "Stop the set as soon as the
descent stops being smooth." **Every rung's last cue is a stop rule**, and it has been
since brief 03.

The app renders it as cue four of four — the last line of a list, below the fold on the
player. It is the one piece of content that tells the user when to end a set, in an app
whose governing premise is that the user autoregulates. That is the single most important
line on the page rendered as the least important.

A physio sheet has a conventional boxed slot for exactly this. The chosen direction does
not, which makes this adjacent to question 8 but separate: 8 is about warnings the app
must not drop, 9 is about a structure the content already has and no layout has used.

**How we'll answer it:** promote it in the type, or add `stopRule` to `Rung` as its own
field rather than leaving it as an untyped convention in position four of `cues`.
