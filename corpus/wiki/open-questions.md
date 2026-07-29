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

**How we'll answer it:** it is a single constant per ladder (`SESSIONS_PER_RUNG`) and
re-tuning it does not invalidate stored state, by design. Watch whether the mid-rung
target feels roughly like 0–2 reps in reserve. That is a felt judgement, not a metric —
there is nothing to measure with.

## 2 — Does the cue text actually stop anyone from a rung they can't do?

The schedule reaches the hollow hold at ~3 months, the couch-anchored nordic negative
at ~4, and the tuck L-sit at ~5.5, **on a clock rather than on readiness, with no
mechanism to step back**. The user chose to rely on each rung's own safety cue rather
than cut the rungs, gate them, or add a manual rung control
([decisions.md](decisions.md#accepted-risk--the-schedule-prescribes-risky-rungs-on-time-not-on-readiness)).

This is a **watched accepted risk**, not an unmade decision. The open part is
empirical: a paragraph is a weaker brake than not being asked, and we do not know
whether it holds.

**How we'll answer it:** the first real encounter with `hinge-05-nordic-negative`
at roughly session 90. If the cue is ignored once, the mitigation to reach for is the
one-time unlock, which was designed and costs one tap twice a year.

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

## 4 — Can an animation legibly show a two-second pause at phone size?

The figure system is five poses whose animation clock is driven by each rung's
modifier data, which is what closed the rung-discriminability question. But a 3-second
lowering and a 3-second lowering *plus a 2-second bottom hold* differ only in whether
the figure stops moving — at ~120px, on a floor, mid-set, that may read as a dropped
frame rather than as a hold.

**How we'll answer it:** build it, then look at rung 5 and rung 6 side by side on an
actual phone. If it fails, the fallback is a visible beat marker (a pulsing dot at the
pause point) rather than more text.

## 5 — Does the daily core and posture block survive contact with real use?

Every session now ends with two extra exercises, every day, forever. It is the change
that made posture progress at a sane rate and it is also the most skippable thing in
the app — and because nothing is measured, **the app cannot tell that it is being
skipped**, so the schedule keeps advancing those ladders regardless.

**How we'll answer it:** the honest answer is a felt one. If it gets skipped, the
options are to shorten it (one set), move it to alternate days, or put it *before* the
strength work so it cannot be the thing you drop.
