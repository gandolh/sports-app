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

---

# Wave 1 outcome, and the wave 2 contract

*Appended 2026-07-30 after wave 1 shipped (`figures/rig.ts`, commit 30024c8). Wave 2
agents: **read this section before the canonical table above.** It corrects it.*

## The table above is a starting point, not data

It was measured off drawings whose lengths were wrong, so imposing the canonical
length changes the angles that reproduce the intended silhouette. **Treat CANON as
authoritative and the angle columns as hints, then re-derive.** Budget more time for
`push` and `squat` than "re-author as a rig" suggests.

## Corrections — all confirmed numerically by wave 1

| # | Figure | Correction |
|---|---|---|
| 1 | `plank` | **Not IK. FK.** Nothing in it touches `GROUND_Y` (182) — hands ~140, feet ~130 — and a planted foot needs 62.9 from the hip when the longest leg available is 56.6, so IK clamps for the whole loop. Model it as the shoulder fixed and the torso pitching **3.37° → −8.44°**. Tips travel 1–13 units, which is what the drawings already do. |
| 2 | `prone` | **END angles are 220 and 233**, not −140/−127. As written they interpolate the long way (211°/294°) and drag the hand *down through the torso* to ~4 units — a blob at 132px that reads as the arm vanishing into the body. |
| 3 | `push` | **`bend: -1`.** The drawn elbow is *ahead* of the shoulder→hand line; a push-up's elbow goes back toward the feet. Read the sign off anatomy, not the pose. |
| 4 | all | **Straight-phase lengths come from the derived chord, not the rounded measurement.** The table's 0.1-rounding is short enough to make a pose the table calls *straight* unreachable, so it clamps. Use `push legL` 67.6, `push legR` 77.0, `squat` legs 79.2. |
| 5 | all | **The neck is a bone and it was omitted.** shoulder→head varies (push 20.0→18.9, plank 21.6→20.0). Declare it. |
| 6 | `hinge` | START hip moves to **(123.5, 158)** once the torso is 66. After that hinge is the cleanest of the five: the knee lands within 1 unit of the drawn one in *both* phases while the hip rises 46, with no clamping. |
| 7 | `push` | **Author it as a rigid body pivoting about the planted feet.** The exact rigid rotation that drops the shoulder 44 units gives shoulder (44.9, 126), hip (115.4, 113.9) — and yields a torso of 71.5 against CANON 71.4, which is the check that it is right. The table's END has the shoulder ~17 units too far right, and that error is the *only* reason its legs appear to bend 16 units at the bottom of a push-up. Authored correctly, **push's legs stay straight and only the arms fold** — a better drawing and less drift. |

## Two decisions taken by the user, 2026-07-30

**`squat` is redrawn side-on, facing right.** A side view keeps the femur in the
picture plane *and* lets the arms reach forward in-plane, so it removes **both**
foreshorten cases rather than adding a third. It also makes all five figures share
one projection — squat was the only front-facing one — and a side view shows squat
depth, which is what the rung actually prescribes. The front view's symmetric
silhouette is the accepted cost.

**`push` keeps its 44-unit chest descent and accepts a ~40-unit elbow.** Elbow
offset is `sqrt((chain/2)² − (chord/2)²)`, so the two are not independent: a modest
20-unit elbow buys only a ~10-unit descent, which at 132px is ~6.6 device pixels of
chest travel and reads as a still image. The descent *is* the information. The elbow
lands under the chest at (99.7, 154), 37 units clear of the torso, so the silhouette
guard passes comfortably. This is what a deep push-up looks like from the side; the
drawing's small bulge was the −44% lie.

## `foreshorten` is now dead and must be deleted

The side-on squat was the last case. **No figure may declare `foreshorten`.** With
zero users, bone length becomes *unconditionally* invariant, which is a stronger
statement than "invariant times a declared scalar" — so the field comes out of
`types.ts` and `rig.ts`, and the bone-length test becomes absolute. Do not reach for
it; if you believe you need it, report BLOCKED and say which limb and why.

## The wave 2 file contract — read this, six agents are working in parallel

**Figures become pure data.** A figure exports a `Rig`, not a component. Rendering is
generic: the hair spike, the trouser flare and the limb paths are all drawn by
`primitives.tsx` from any rig, because none of them need per-figure knowledge. This
is what makes the render path and the five figures independent of each other.

| Chunk | Owns | Contract it must honour |
|---|---|---|
| **B** (render path) | `primitives.tsx`, `ExerciseFigure.tsx`, `figures/index.ts`, `motion.ts` | Imports `<NAME>_RIG` from each figure file. Build a **fixture rig** for your own tests — do not wait on or import the real ones. `buildTimeline` stays untouched. |
| **C1** | `Push.tsx` | exports `PUSH_RIG: Rig` |
| **C2** | `Squat.tsx` | exports `SQUAT_RIG: Rig` |
| **C3** | `Hinge.tsx` | exports `HINGE_RIG: Rig` |
| **C4** | `Prone.tsx` | exports `PRONE_RIG: Rig` |
| **C5** | `Plank.tsx` | exports `PLANK_RIG: Rig` |

Rules that keep the parallelism safe:

- **Filenames stay `.tsx`** even though the figure files no longer contain JSX. A
  deliberate small ugliness: renaming five files plus the registry plus tests is
  churn with no payoff, and it would force B and C to agree on a rename mid-flight.
- **The `MovementArrow` spec is part of each figure's exported data** (its `x`, `y1`,
  `y2` differ per figure), drawn by the generic renderer.
- **A C agent touches exactly one file** and verifies it against `rig.ts` helpers
  directly — bone lengths constant, `worstTipDrift` under budget, no hand or foot
  within 12 units of the torso at any sample. You do not need the renderer to prove
  your geometry.
- **Only B touches `figures/index.ts`.** A C agent that edits it will conflict.
