# Task 23 — Replace the figure crossfade with a rigged morph

## Context

Five drawings cover all 35 rungs. Each is a pair of poses (`start`, `end`) that
`ExerciseFigure.tsx` **crossfades** on a clock derived from `Rung.modifier`
(`figures/motion.ts`, brief 18). A crossfade dissolves; it does not move. Two
consequences, both measured:

- **`plank` shifts the hip 14px between poses.** Dissolving two near-identical
  figures reads as a stroke thickening and thinning, not a body moving. That is the
  entire core ladder.
- **`prone` sweeps the hands 150°**, far enough that the frames barely overlap, so it
  reads as a **ghost arm** double-exposure.

`motion.ts` says a morph is impossible because the poses "have different path
*shapes* … so there is nothing to tween geometrically". **That is wrong.** The poses
are joint dictionaries with fixed topology apart from optional mid-joints, and three
of the five (`hinge`, `prone`, `plank`) already have identical topology.

The real blocker is that **bone lengths are not preserved between the two poses of a
figure**, because the pairs were drawn as independent illustrations that read
correctly as stills rather than as one skeleton in two configurations. Four of the
five worst cases are anatomically impossible, not foreshortening:

```
push  arm    94.1 -> 52.3  -44%   side view, in plane — impossible
prone arm    36.1 -> 49.7  +38%   side view, in plane — impossible
hinge torso  52.3 -> 66.0  +26%   a torso cannot lengthen
squat leg    78.6 -> 49.6  -37%   a bent chain must sum to the straight length
squat arm    70.7 -> 32.0  -55%   front view, arms swing at the viewer — REAL
```

And correcting the lengths is not sufficient on its own. Interpolating joint
*coordinates* between two correct poses still collapses the bone mid-tween, because a
chord is shorter than its radius:

```
limb         sweep    bone length at t=0.5
prone.arm     150°    26% of correct  <- the arm nearly vanishes
squat.arm      82°    76% of correct
all others    <=35°   >=95%, invisible
```

**So angle interpolation is the only correct option, not a preference.** Everything
below follows from that.

## The decisions, grilled 2026-07-30

Taken with the user. Do not relitigate; report BLOCKED if one looks wrong.

1. **Poses get redrawn** so each limb keeps one length. Most changes are corrections.
2. **One documented exception:** a declared per-phase `foreshorten` scalar, used
   *only* for `squat` arms (0.45). It exists so a real projection effect has a name;
   it is not a licence to paper over a sloppy pose.
3. **Authored as one skeleton plus per-phase angles**, not coordinates — that makes
   length-constancy structural rather than a test you fight.
4. **Art: monochrome structural cues only.** A hair spike and a trouser flare, both
   `currentColor` strokes at `STROKE_WIDTH`, unfilled. No second colour, no fill, no
   face. Rationale below.
5. **The turnaround stays linear.** R3 (easing into the bottom) is explicitly
   deferred — see *Out of scope*.
6. **`motion.ts` generates per-bone keyframes**, taking the rig as a parameter.

## Files you OWN

```
client/src/ui/figures/rig.ts            NEW — the rig type, FK, 2-bone IK, sampling
client/src/ui/figures/primitives.tsx    StickFigure renders a rig; add the two art cues
client/src/ui/figures/types.ts          Joint stays; add the rig types
client/src/ui/figures/Push.tsx          re-authored as a rig
client/src/ui/figures/Squat.tsx         re-authored as a rig (owns the foreshorten case)
client/src/ui/figures/Hinge.tsx         re-authored as a rig
client/src/ui/figures/Prone.tsx         re-authored as a rig
client/src/ui/figures/Plank.tsx         re-authored as a rig
client/src/ui/figures/motion.ts         ADD keyframe generation from a rig; DO NOT
                                        touch buildTimeline
client/src/ui/ExerciseFigure.tsx        one <svg> instead of two stacked frames
client/src/ui/figures/__tests__/        adapt; see Acceptance for what must survive
```

## Files you must NOT touch

`client/src/domain/**` — the rungs, ladders and modifiers are input. If a figure needs
a domain change, this brief has failed its premise: report BLOCKED and say what
diverged.

`figures/overlays.tsx` — the four overlays are deliberately positioned at generic spots
on the 200×200 canvas rather than anatomical anchors, so a rig does not disturb them.
Leave them, and keep them in their own static layer so annotations do not pulse.

`buildTimeline` in `motion.ts` — its segments, `LOWERED_PHASE`, `MOTION_SCALE` and every
assertion about them are correct and reusable. You are adding a *renderer* for the
timeline it already produces; its own docstring anticipates exactly this ("a future
morphing renderer would consume the same timeline").

## What to build

### 1. The rig

A figure declares **one skeleton** — a length per limb, once — and **two angle sets**,
one per phase. Coordinates are derived, never authored. A rotation cannot change a
length, so `-55%` cannot happen: the invariant holds by construction rather than by
discipline, which is the whole point.

### 2. Planted limbs need IK; free limbs need FK

This is the part that is easy to get wrong. Measured sweeps show `push`'s limbs barely
rotate (armL 4°, armR 0°, legs −8°) — because **the hands and feet are planted** (y=176
and y=150/158 in *both* phases) and the torso descends. The shoulder moves while the
hand is fixed, so the elbow angle is not authored, it is **solved**.

| Rig | Limbs | Why |
|---|---|---|
| **IK** (2-bone, endpoint planted) | `push` arms + legs, `squat` legs, `hinge` legs, `plank` arms + legs | hand/foot is on the floor; the torso moves |
| **FK** (rotation chain from torso) | `squat` arms (82° sweep), `prone` arms (150°) | the limb swings freely |

2-bone IK: given root, target and two bone lengths, the joint sits at one of two
solutions — pick by a declared **bend direction** per limb, so an elbow cannot invert
between frames. Clamp when the target is farther than the bones can reach (draw
straight) or closer than they can fold.

### 3. `motion.ts` emits sampled keyframes — the JS runs once, not per frame

`figures/index.ts` is explicit and both rules stand: **"CSS animation only, never a JS
loop"** (this renders beside a live countdown on a phone) and **"a figure component
never animates itself."** So:

```
motionStyles(timeline, rig) →
  sample the timeline at a fixed resolution
  per sample: solve FK or IK → concrete per-bone angles
  emit one @keyframes per bone, with those angles as stops
```

CSS interpolates between stops, and rotation preserves length, so no bone can collapse
between samples either. Clock logic stays in `motion.ts`; angles stay in the figure
files; `motion.ts` merely combines them. No new CSS features — plain `@keyframes` on
`transform` — so nothing needs feature detection.

**Known approximation, and it needs a test.** Interpolating two bone angles linearly
does not trace the exact IK path, so a *planted* hand can drift slightly between
samples. Pick the resolution so drift stays under ~1 unit (half a stroke width) and
assert it: sample midpoints between emitted stops and check the planted joint has not
moved. Raise the resolution rather than accepting visible slide — a foot that skates on
the floor is worse than the crossfade.

### 4. The two art cues, and why they are not decoration

Both were chosen for a functional reason and each pays for itself:

- **Hair spike** — a fixed orientation landmark on the head. `prone` sweeps an arm 150°;
  without a landmark the eye has nothing stationary to read the rotation against.
- **Trouser flare** — marks the **hip**, currently an invisible vertex where three lines
  meet, and the joint carrying the most information in both `hinge` (156→112) and
  `plank` (96→82).

`currentColor`, `STROKE_WIDTH`, unfilled. This keeps every existing drawing rule: no
face, one stroke width, and `fill` still reserved for the single accent element (the
`MovementArrow`). **Do not add a colour.** A filled coloured garment would need a new
palette token, a contrast pair, and a `decisions.md` revisit, and it was considered and
rejected.

### 5. Hard requirements

- **200×200 viewBox unchanged**, and figures must read at **132px** — the only call
  site is `Player.tsx:157`.
- **`prefers-reduced-motion` stays a real branch**: no `@keyframes` emitted at all, and
  the still pose is the **`end`** pose. Note the existing test claims "start" — see
  below; the CSS is right and the test is wrong.
- **No hex colour anywhere** in `client/src/ui/` outside `tokens.css`
  (`client/src/ui/__tests__/noHexColors.test.ts` enforces it, and it is real now that
  `css: true` is set).
- **Overlays render once**, in their own layer.

## The canonical skeleton — the data to work from

Canonical length is the longer measurement, because the short one is the bug. "Redraw"
names the phase whose drawing must change. Angles are the root→tip direction in degrees.

```
fig     limb    len(S)  len(E)  CANON   redraw   angle S    angle E   sweep
push    torso    71.4   70.3   71.4   —          11°      -15°    -26°
push    armL     94.1   52.3   94.1   END        92°       97°      4°   IK
push    armR     94.1   51.0   94.1   END        88°       88°      0°   IK
push    legL     67.2   59.4   67.2   END        53°       45°     -8°   IK
push    legR     76.6   68.6   76.6   END        54°       47°     -7°   IK

squat   torso    42.0   34.0   42.0   END        90°       90°      0°
squat   armL     70.7   32.0   70.7   END*       98°      180°     82°   FK
squat   armR     70.7   32.0   70.7   END*       82°        0°    -82°   FK
squat   legL     78.6   49.6   78.6   END        97°      108°     11°   IK
squat   legR     78.6   49.6   78.6   END        83°       72°    -11°   IK

hinge   torso    52.3   66.0   66.0   START       7°      -35°    -42°
hinge   armL     20.4   20.4   20.4   —         101°      101°      0°
hinge   armR     24.1   24.1   24.1   —          85°       85°      0°
hinge   legL     80.8   76.7   80.8   END        16°       50°     35°   IK
hinge   legR     85.1   85.7   85.7   —          20°       50°     30°   IK

prone   torso    72.2   72.2   72.2   —           5°        5°      0°
prone   armL     36.1   49.7   49.7   START      71°     -140°    150°   FK
prone   armR     43.9   52.8   52.8   START      66°     -127°    167°   FK
prone   legL     40.8   40.8   40.8   —          11°       11°      0°
prone   legR     48.1   48.1   48.1   —          17°       17°      0°

plank   torso    68.1   60.0   68.1   END         3°        0°     -3°
plank   armL     48.2   53.3   53.3   START      95°       96°      2°   IK
plank   armR     54.0   58.0   58.0   START      88°       90°      2°   IK
plank   legL     52.5   56.6   56.6   START      40°       42°      2°   IK
plank   legR     61.0   65.1   65.1   START      41°       43°      2°   IK
```

`END*` on the squat arms is **not** a redraw — it is the foreshorten case. Canonical
70.7, drawn at 32.0, so `foreshorten: 0.45` at `end`. Interpolate the factor alongside
the angle.

## Two vacuous tests to fix while you are here

Both are green and worthless, and this area has now produced two of them:

1. **[ExerciseFigure.test.tsx:111]** is named "holds the start frame … under
   prefers-reduced-motion" but asserts
   `startFrame.classList.contains('exercise-figure__frame--start')` — it queried by that
   exact class, so it is tautologically true. It also contradicts the CSS, which holds
   the **end** pose. Make it assert the actual still pose.
2. The pattern to avoid generally: **a test that greps files it failed to open is green
   and worthless.** Assert your input is non-empty.

## Acceptance

- All 35 rungs render and animate; `npm run check` clean; `npm audit` clean.
- **Every assertion in `motion.test.ts` about `buildTimeline` still passes unmodified.**
  If you changed the timeline, you changed the wrong thing. The opacity-specific CSS
  assertions (`emits one @keyframes per frame`, `the two frames are complements`) are
  expected to be rewritten for per-bone keyframes; the *timeline* ones are not.
- **`is linear — any easing into the turnaround would fake a hold` still passes.**
- **New: a bone-length test.** For every figure, every limb, at every sampled stop,
  length equals canonical (times any declared `foreshorten`) within a tight epsilon.
  This is the test that makes the whole brief hold.
- **New: a planted-joint drift test.** At sample midpoints, joints declared planted have
  not moved more than ~1 unit.
- **New: a silhouette test.** No hand or foot comes within 12 units of the torso segment
  at any sampled stop — two 6px strokes touching is an unreadable blob. The current
  poses pass this (worst case `prone` at 13.0), so it is a regression guard, not a fix.
- `prefers-reduced-motion` emits no `@keyframes` at all and shows the `end` pose.
- Report an honest verdict on **whether the morph reads better than the crossfade at
  132px**, and specifically on the pause. See below — you are spending a real cue.

## The cue you are spending, stated plainly

[wiki/open-questions.md](../../wiki/open-questions.md) retired question 4 with a
warning: the crossfade's *imperfection* is load-bearing, because a two-frame dissolve
is a soft double-exposure while moving and crisp only at the endpoints, so a paused
rung visibly **snaps into focus and freezes**. Blur-vs-crisp is a stronger signal than
slow-vs-stopped. "Anyone proposing a morph is trading one for the other and should say
so." This brief says so.

The cost is lower than that note implies, and the note missed why: **the pause already
has a dedicated static channel.** `renderOverlays` draws `<AngleArc at={pauseAt} />`
whenever `pauseAt && pauseSeconds` — that is exactly the 5 rungs of 35 that have a
hold. So "this rung holds, and here" is carried by the overlay *and* by the cue text.
The blur was a third, redundant signal.

Fold the outcome back into question 4 either way.

## Explicitly out of scope

- **R3, easing the turnaround.** The loop reverses direction instantly at the bottom,
  which no body does, and the engine's Hermite is the standard fix. Deferred
  deliberately: 30 of 35 rungs have no pause, so easing them all risks 30 rungs reading
  as lightly paused — the exact confusion the linearity rule prevents. It also needs a
  `decisions.md` revisit and deletes a test. **And the rig may dissolve the problem on
  its own**, since a limb rotating at constant angular velocity already reads more
  organically than a point translating linearly. Ship this, look at it, then decide.
- **R1, the easing module and injected-time tween.** Real but unrelated — it touches
  `client/src/ui/components/CountUp.tsx`, not the figures. Still captured in
  [todos/figure-animation-from-game-engine.md](../../todos/figure-animation-from-game-engine.md).
- **Colour on the figures**, a sixth pose, and any change to the four overlays.
