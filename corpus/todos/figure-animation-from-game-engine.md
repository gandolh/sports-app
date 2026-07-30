# Improving the figure animation, researched against ~/projects/game-engine

Captured 2026-07-30. Research only — **nothing here has been implemented**, and R2
and R3 both need a decision before they could be.

The question was what the game-engine monorepo has that would improve this app's
animations. The useful answer turned out not to be a technique to copy but a
**measurement**: the thing blocking a better figure animation is the pose data, not
the animation system.

## What the engine actually has

Four relevant modules. Note sports-app **cannot depend on any of them** — separate
repo, and this client's dependency list is deliberately short — so everything below
is copy-the-idea, not import.

| Module | What it is | Applicable here? |
|---|---|---|
| **game-engine** → engine/core/src/animation/easing.ts | 6 pure `(t: number) => number` curves — `linear`, `smoothstep`, `easeOutQuad`, `easeOutCubic`, `easeOutBack`, `easeOutElastic` | **Yes, directly** |
| **game-engine** → engine/ui/src/anim/tween.ts | A tween with an explicit *injected-time* contract: never calls `Date.now()`/`performance.now()`; caller passes `dt` | **Yes, directly** |
| **game-engine** → engine/core/src/animation/clip.ts | `AnimationClip` — frames with per-frame durations, `sampleAt(elapsedMs)`, loop handling, `eventsBetween(prev, cur)` | Already independently reinvented, see below |
| **game-engine** → games/citadel/client/src/render/entity-interp.ts | Catmull-Rom/Hermite corner smoothing + a render-delay jitter buffer for stepped sim positions | Mostly **no** — one narrow use, and it is currently forbidden |

**The engine's clip.ts and our `figures/motion.ts` are the same idea, arrived at twice.** Both
are "a list of timed segments, sampled to a position". Ours is the better fit and
should not be replaced: its segments carry `from`/`to` positions on an abstract 0..1
axis and a typed `phase` (`eccentric`/`concentric`/`hold`), and it is *derived from
domain data* (`Rung.modifier`) rather than authored. The engine's samples a frame
*name*, which is a sprite-sheet concern we do not have.

**Two places we are ahead of the engine**, worth not regressing: reduced motion is a
real branch here (no `@keyframes` are emitted at all), and the engine has no notion
of it anywhere; and our timeline is generated from the prescription, so a new rung
animates correctly with no animation authoring.

## The headline finding: the poses are not a rig

`figures/motion.ts` says the crossfade is the only interpolation available because
"the poses have different path *shapes* … so there is nothing to tween
geometrically". **That is overstated, and the real obstacle is different and worse.**

The poses are not paths. They are joint dictionaries (`StickFigureProps`: `head`,
`shoulder`, `hip`, `handL` and `handR`, `footL` and `footR`, plus *optional* `elbowL`, `elbowR`, `kneeL`, `kneeR`), and
the topology is fixed apart from those optional mid-joints. Measured:

```
figure   START mid-joints    END mid-joints    verdict
push     (none)              elbowL,elbowR     differs → needs canonicalising
squat    (none)              kneeL,kneeR       differs → needs canonicalising
hinge    kneeL,kneeR         kneeL,kneeR       IDENTICAL
prone    (none)              (none)            IDENTICAL
plank    (none)              (none)            IDENTICAL
```

**Three of the five figures already have identical topology** and could be
interpolated with no canonicalisation whatsoever. So the stated blocker is not the
blocker.

The actual blocker is that **bone lengths are not preserved between the two poses**:

```
figure  limb    START    END      Δ%
squat   armL     70.7    32.0    -55%
squat   armR     70.7    32.0    -55%
push    armR     94.1    51.0    -46%
push    armL     94.1    52.3    -44%
squat   legL/R   78.6    49.6    -37%
prone   armL     36.1    49.7    +38%
hinge   torso    52.3    66.0    +26%
squat   torso    42.0    34.0    -19%
```

The two poses of each figure were drawn as **independent illustrations that read
correctly as stills**, not as one skeleton in two configurations. Some of that is
deliberate foreshortening (the squat's arms come forward, so they *should* draw
shorter). But it means a naive joint lerp makes limbs **telescope** — a squat whose
arms shrink by half on the way down would look worse than the current dissolve, not
better.

So: a morph is not blocked by the renderer. It is blocked by the pose data, and the
fix is a content change.

## What is actually wrong with the crossfade today

Worth stating, because it is the reason to bother. A crossfade dissolves; it does not
move. At 120px with a 6px stroke:

- **`plank`** shifts the hip by 14px between poses. Dissolving two near-identical
  figures reads as a *stroke thickening and thinning*, not as a body moving. This is
  the whole core ladder.
- **`prone`** moves the hands 70,138 → 20,72 — far enough that the two frames barely
  overlap, so it reads as a **ghost arm** double-exposure rather than an arm
  sweeping. A chord lerp would be no better: it passes the hand *through the torso*.
  An arc about the shoulder is what is wanted, and fixed bone length gives that for
  free.

## The trade the corpus already recorded — and a correction to it

[wiki/open-questions.md](../wiki/open-questions.md) retired question 4 with a warning:
the crossfade's *imperfection* is load-bearing, because a paused rung "visibly snaps
into focus and freezes" — blur-vs-crisp is a stronger cue than slow-vs-stopped, so
"anyone proposing a morph is trading one for the other and should say so." Saying so.

**But the cost is lower than that note implies, and the note is missing something:
the pause already has its own dedicated static channel.**
`ExerciseFigure.tsx#renderOverlays` draws `<AngleArc at={modifier.pauseAt} />`
whenever `pauseAt && pauseSeconds`. So "this rung has a hold, and here is where"
is already carried by the overlay *and* by the cue text. The blur is a third,
redundant signal, not the only one. That materially changes the trade and should be
folded into the question-4 note either way.

## Recommendations, cheapest first

**R1 — extract an easing module; adopt the injected-time contract.** No visual change,
no decision needed. `client/src/ui/components/CountUp.tsx` currently inlines
`1 - (1 - progress) ** 3` with a comment apologising that it only approximates
`--ease-out`; that expression *is* the engine's `easeOutCubic`. It also calls
`performance.now()` inside its effect, which is why it needs a `shouldAnimate` guard
to avoid getting stuck at zero in test renderers. The engine's rule — time is always
injected, never read — would make the count-up unit-testable at an arbitrary `t`, the
same way `motion.ts` already is. Small, and it removes a guard rather than adding one.

**R2 — re-author the five pose pairs as a bone rig, then animate with CSS transforms.**
This is the real win and it is a content change, not a system change: express each
figure as fixed limb lengths plus per-phase joint *angles*, and render as nested `<g>`
elements that rotate. Two properties fall out of that shape:

- **Telescoping becomes impossible by construction.** A rotation cannot change a
  length, so the -55% squat arm cannot happen — it is prevented structurally rather
  than by discipline.
- **Hands travel arcs, not chords**, which fixes `prone` without any special-casing.

It also keeps the current architecture: CSS `@keyframes` on `transform`, universal
browser support, GPU-friendly, **zero per-frame JS**, and `motion.ts` is untouched —
its own docstring already anticipates this ("a future morphing renderer would consume
the same timeline"), and it would.

Two alternatives considered and not recommended:

- *CSS `d` interpolation.* Works only when both paths have identical command lists,
  which is exactly the topology condition — so it would work on `hinge`/`prone`/`plank`
  today. Cheap, but it does nothing about bone length, needs a browser-support check
  (roughly Chrome 80+/Firefox 97+/Safari 16+), and leaves two figures on a different
  code path. Possible cheap intermediate; not the destination.
- *rAF + mutating SVG attributes through refs.* Universal support and ~40 lines, but
  introduces per-frame JS the app currently does not have anywhere, for no advantage
  over transforms once the rig exists.

**R3 — reconsider the linear turnaround. Needs a decision, do not just do it.**
The loop currently walks 0 → 1 → 0 at a constant rate, so the figure **reverses
direction instantaneously** at the bottom, which no body does. This is the one place
the engine's Hermite/Catmull-Rom applies — its stated purpose there is that a unit
"rounds the corner instead of snapping around it", which is precisely the defect.

But [wiki/design-system.md](../wiki/design-system.md) forbids exactly this: easing
that decelerates into the turnaround "makes a pauseless rung look like it dwells at
the bottom, which is precisely the signal a paused rung owns". That rule stands until
someone revisits it. The `AngleArc` observation above is the argument that it *could*
be revisited — but that is a `decisions.md` revisit plus a `log.md` entry, not a
tweak.

**R4 — do not take.** The jitter buffer and render-delay machinery in
entity-interp.ts solve a problem we do not have (no network snapshots, no stepped
integer positions). `AnimationClip.eventsBetween` would be the right tool for timed
audio cues, which are deliberately out of v2 scope.

## If only one thing gets done

R1, because it is free. But the visible improvement is **R2**, and R2's prerequisite
is re-drawing five pose pairs as rigs — which is an afternoon of geometry, not an
animation project. Everything else is downstream of that.
