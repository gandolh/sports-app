# Task 18 — Animate the figures on a clock driven by each rung's modifier

## Context

The figure system already exists (brief 10): five poses — push · squat · hinge · prone ·
plank — each a React component taking `{ phase: 'start' | 'end' }` and drawing into a
fixed `200×200` viewBox, plus per-rung overlays composed from `Rung.modifier`.
`ExerciseFigure.tsx` currently crossfades the two frames.

The user asked for **animated** figures, and chose the variant where **five drawings
produce 35 distinct results because each rung's modifier data drives the animation
clock**. That is not a rendering nicety — it is what closed the open question about
whether adjacent rungs are distinguishable. Rung 5 (3-second lowering) and rung 6
(3-second lowering + 2-second bottom hold) share a pose and a figure, and until now only
the cue text could tell them apart. Now the animation can: one visibly stops moving at
the bottom and the other does not.

Read [wiki/technical-decisions.md](../../wiki/technical-decisions.md#figures-five-poses-animated-on-a-data-driven-clock),
[wiki/design-system.md](../../wiki/design-system.md) (Motion, and the Anti-patterns list),
and the contract comment at the top of `src/ui/figures/index.ts` — **it is the design
system for this directory and every rule in it is load-bearing.**

## Files you OWN

```
src/ui/ExerciseFigure.tsx                     the animation driver
src/ui/figures/motion.ts                      NEW — modifier → keyframe timeline
src/ui/figures/Push.tsx  Squat.tsx  Hinge.tsx  Prone.tsx  Plank.tsx
src/ui/figures/primitives.tsx  overlays.tsx  constants.ts
src/ui/figures/__tests__/*
```

## Files you must NOT touch

`src/domain/**` (brief 15 owns `Rung` and `Modifier`; if the modifier data is
insufficient, report BLOCKED and say exactly what field you need),
`src/persistence/**`, `src/ui/routes/**` (brief 19).

Your component's public props may change, but **say so loudly in your report** — brief
19 renders it.

## What to build

### The timeline is derived, not authored

`motion.ts` turns a `Modifier` into a timeline: a sequence of `{ phase, durationMs }`
segments over the interpolation between the `start` and `end` poses. The mapping is the
whole brief, so get it explicitly right:

| Modifier field | Effect on the timeline |
|---|---|
| none | symmetric: ~1s toward `end`, ~1s back to `start` |
| `eccentricSeconds: 3` | the *lowering* segment takes 3s; the return stays ~1s |
| `pauseSeconds: 2, pauseAt: 'bottom'` | a 2s segment with **no movement at all** at the `end` pose |
| `pauseAt: 'top'` | the still segment sits at the `start` pose instead |
| `unilateral: true` | overlay concern, not a timing one — do not alter the clock |
| `elevation` | overlay concern, not a timing one |

Two decisions you must make and justify in a comment rather than guess at:

1. **Which pose is "lowered"** differs by pattern — a push-up's `end` is the bottom, a
   glute bridge's `end` is the *top*. Getting this backwards makes a 3-second eccentric
   animate as a 3-second lift, which is worse than not animating at all. Read the actual
   figure components and the rung cues before deciding; do not infer it from the phase
   names.
2. **Real-time or compressed.** A rung with a 3s lowering plus a 2s hold plus a 1s lift
   is a 6-second loop. That may be too slow to read as a loop on a page the user glances
   at. If you compress, compress *proportionally* so the ratios that distinguish rungs
   survive, and say what factor you chose.

### Hard requirements

- **`prefers-reduced-motion: reduce` falls back to the static end pose**, no animation,
  no crossfade. This is in the design system's accessibility section and there is
  already a test file adjacent — the fallback must be a real branch, not a slowed
  animation.
- **Every stroke stays `stroke="currentColor"`** and every accent stays `var(--accent)`.
  `src/ui/figures/__tests__/noHexColors.test.ts` greps this directory and fails the build on one hex
  literal. Do not weaken that test to accommodate an animation.
- **One stroke width everywhere**, including anything new you draw.
- **Fixed 200×200 viewBox**, unchanged. Frames only line up because coordinates are
  identical.
- Prefer **CSS animation over a JS rAF loop** — this renders on a phone next to a
  countdown, and a driver that competes for frames with the rest of the page is a
  regression. If you genuinely need JS, justify it.
- No new dependency.

### The legibility question, which is a real open question

[open-questions.md](../../wiki/open-questions.md) #4 asks whether a 2-second pause is
legible at ~120px. **You are the brief that answers it.** Build it, then render rung 5
and rung 6 of the push ladder side by side at the real size and look at them. If the
pause reads as a dropped frame rather than a hold, the sanctioned fallback is a visible
beat marker (a pulsing dot at the pause point), **not** more text. Report your verdict
either way — a "probably fine" is not an answer to this one.

## Acceptance

- `npm run typecheck`, `npm run lint`, `npx vitest run src/ui/figures src/ui/ExerciseFigure` clean.
- A test asserts the timeline for `{ eccentricSeconds: 3 }` and for
  `{ eccentricSeconds: 3, pauseSeconds: 2, pauseAt: 'bottom' }` **differ**, and differ in
  the way described above. This is the test that guards the reason this brief exists.
- A test asserts a pause segment has zero movement, at the correct pose for `'bottom'`
  vs `'top'`.
- A test asserts every one of the 35 rungs produces a timeline without throwing, and
  that rungs differing only in modifier produce different timelines.
- The existing reduced-motion and no-hex-colour tests still pass, unmodified.
- **Render the figures and look at them.** Report your honest verdict on open question
  #4, and on whether the eccentric direction is right for all five patterns.

---

## Outcome — 2026-07-29

**Done**, 87 figure tests. The load-bearing call was which pose is "lowered", because no test
catches getting it wrong — a 3-second eccentric would simply animate as a 3-second lift. It
splits 2/3: push and squat draw `end` at the bottom; hinge, prone and plank draw theirs at
the top. The rule encoded is that `end` is whatever the movement arrow points at.

Timelines compress 0.6× uniformly so the worst case loops in 3.6s, and timing is linear on
purpose: easing that decelerates into the turnaround makes a *pauseless* rung appear to dwell
at the bottom, which is the signal a paused rung owns.

**Answered open question 4**, and the answer was surprising enough to keep as a note rather
than delete: a 2-second pause is legible at 120px, but not because the figure stops moving —
because the two-frame crossfade snaps into focus. A true joint-interpolating morph would look
better *and weaken* this signal.

**Found that `design-system.md` contradicted the code it governs** (it claimed the countdown
ring was the only continuously-animating element and that nothing animates on load) and
correctly declined to edit the corpus itself. That page is now fixed.
