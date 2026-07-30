/**
 * The figure skeleton: bone lengths in, coordinates out.
 *
 * This module is the geometry half of brief 23. It holds no React, no DOM and no
 * CSS — it turns a `Rig` (`types.ts`) plus a position on the 0..1 axis
 * `motion.ts` already produces into concrete joints and per-bone angles. Wave 2
 * turns those angles into `@keyframes`; the two figure rules in `index.ts` —
 * *CSS animation only, never a JS loop* and *a figure component never animates
 * itself* — mean this code runs **once per rung**, when the stylesheet is built,
 * and never per frame.
 *
 * ## Why coordinates are derived rather than drawn
 *
 * The five figures used to be ten hand-placed coordinate sets, and nothing tied
 * a pair together. Measured across each pair, one bone changed length by up to
 * 55%, and four of the five worst cases were anatomically impossible rather than
 * foreshortening (`push` arm 94.1 → 52.3; `hinge` torso 52.3 → 66.0 — a torso
 * cannot lengthen). Crossfading those two drawings dissolved one into the other,
 * which hid it. Moving between them would not: a bone that shortens 44% while
 * you watch is the most visible thing on the drawing.
 *
 * So the length is declared once and the pose is a set of *rotations* about it.
 * Rotation preserves length exactly, at every position, including the positions
 * nobody sampled. That is a stronger guarantee than any test, and it is the
 * reason this module exists rather than a linter rule.
 *
 * ## FK and IK, and why both are needed
 *
 * A freely swinging limb is one rotation: `solveFk`. That covers `prone` arms
 * (150° sweep) and `squat` arms (82°), where the angle *is* the movement.
 *
 * The interesting half is the planted limbs. `push` keeps its hands at y=176 and
 * its feet at y=150/158 in *both* phases while the shoulder drops 44 units.
 * Measured as angles the arm rotates 4°, which is why the old table read as
 * "nothing happens" — what happens is the elbow folding to absorb the descent,
 * and that fold is not a number anybody can author twice consistently. It is
 * solved: `solveIk`, given the root, the planted target and two bone lengths.
 *
 * ## The one approximation, stated up front
 *
 * CSS interpolates the per-bone angles between the stops we emit; the true IK
 * path between two stops is not linear in those angles. So a planted hand can
 * drift slightly *between* samples even though it is exact *at* every sample.
 * `SAMPLES_PER_MOVING_SEGMENT` is chosen to keep that under half a stroke width,
 * and `worstTipDrift` measures it so the number is checkable rather than
 * asserted. A foot that skates on the floor is worse than the crossfade it
 * replaces.
 */
import type { MotionTimeline } from './motion.ts'
import type {
  BendSign,
  FigurePhase,
  IkLimb,
  Joint,
  LimbRoot,
  PhasePair,
  Rig,
  RigBone,
  RigBoneId,
  RigLimb,
  RigLimbId,
} from './types.ts'

/**
 * Below this, two points are the same point and a direction between them is
 * meaningless. Chosen well under the 0.01-unit precision any drawing needs, so
 * it only ever catches genuine degeneracy (a zero-length bone, a target sitting
 * on its own root) rather than a tight-but-real pose.
 */
const EPSILON = 1e-9

const DEG_TO_RAD = Math.PI / 180
const RAD_TO_DEG = 180 / Math.PI

/**
 * Canonical iteration order for limbs. Exported because CSS output has to be
 * deterministic — two identical rigs must produce byte-identical stylesheets, or
 * every rung gets its own `@keyframes` block and the sharing that makes 35 rungs
 * cheap disappears. `Object.keys` would very nearly do, and would break the day
 * someone reorders a literal.
 */
export const LIMB_IDS: readonly RigLimbId[] = ['armL', 'armR', 'legL', 'legR']

/**
 * A single non-finite number here would blank an entire `<path>`: SVG drops a
 * path whose `d` contains `NaN`, so one bad divide loses a whole limb rather
 * than misplacing it. Every value crossing into the geometry is funnelled
 * through this, which turns "the arm vanished" into "the arm is at the origin" —
 * still wrong, but visibly wrong, and it cannot cascade.
 */
function finite(value: number): number {
  return Number.isFinite(value) ? value : 0
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerpJoint(a: Joint, b: Joint, t: number): Joint {
  return {
    x: lerp(finite(a.x), finite(b.x), t),
    y: lerp(finite(a.y), finite(b.y), t),
  }
}

/** A bone length: never negative, never NaN. A negative length would draw the
 * limb backwards, which reads as an inverted joint rather than as a typo. */
function boneLength(value: number): number {
  return Math.max(0, finite(value))
}

/**
 * The foreshorten factor at a position, defaulting to 1.
 *
 * Clamped to `[0, 1]`, and the upper bound is the load-bearing half: a factor
 * above 1 would *lengthen* a bone, which is precisely the defect this module is
 * built to make unrepresentable. Silently clamping is better than honouring it,
 * because a rig that declared 1.2 would otherwise pass every length test — the
 * test compares against `length × foreshorten`.
 */
function foreshortenAt(pair: PhasePair<number> | undefined, position: number): number {
  if (!pair) return 1
  return clamp(lerp(clamp(finite(pair.start), 0, 1), clamp(finite(pair.end), 0, 1), position), 0, 1)
}

/** Forward kinematics, entire: one rotation and one translation. */
export function solveFk(root: Joint, angleDeg: number, length: number): Joint {
  const radians = finite(angleDeg) * DEG_TO_RAD
  const reach = boneLength(length)
  return {
    x: finite(root.x) + Math.cos(radians) * reach,
    y: finite(root.y) + Math.sin(radians) * reach,
  }
}

/** Direction `from` → `to` in degrees, y-down, matching `RigBone.angleDeg`.
 * Coincident points have no direction; 0 is returned so callers cannot get NaN,
 * and every caller here has already handled the degenerate case. */
export function angleBetween(from: Joint, to: Joint): number {
  const dx = finite(to.x) - finite(from.x)
  const dy = finite(to.y) - finite(from.y)
  if (Math.abs(dx) < EPSILON && Math.abs(dy) < EPSILON) return 0
  return Math.atan2(dy, dx) * RAD_TO_DEG
}

export interface IkSolution {
  readonly mid: Joint
  readonly tip: Joint
  /** Absolute direction root → mid, degrees. */
  readonly upperAngleDeg: number
  /** Absolute direction mid → tip, degrees. */
  readonly lowerAngleDeg: number
  /**
   * The target was unreachable and the chain was drawn at its nearest
   * achievable extent instead — straight, when the target is farther than
   * `upper + lower`; folded flat, when it is closer than `|upper - lower|`.
   *
   * Not an error: a straight limb one unit short of its target is the correct
   * drawing of "as far as it goes", and it is what the old poses drew for
   * `push`'s legs at the top of the rep. It is surfaced because a limb clamped
   * across a *whole* loop means the rig's lengths and its target disagree, which
   * is a rig bug the geometry cannot fix.
   */
  readonly clamped: boolean
}

/**
 * Two-bone inverse kinematics: place the mid joint so the tip lands on the
 * target.
 *
 * The circle-intersection has two mirror solutions and `bend` picks between
 * them. It is a property of the limb rather than of the frame on purpose — see
 * `BendSign`. Choosing per frame (nearest to the last one, say) is how a knee
 * inverts halfway through an animation, and the inversion is not gradual: the
 * joint snaps through the straight-limb singularity.
 *
 * The tip is built by rotating along the two bones rather than by taking the
 * target directly, so `|mid - root|` and `|tip - mid|` are exactly `upper` and
 * `lower` to floating-point precision. Length invariance is the guarantee this
 * whole module sells; landing on the target is the thing allowed to carry the
 * rounding error, and under clamping it is not satisfiable anyway.
 */
export function solveIk(
  root: Joint,
  target: Joint,
  upper: number,
  lower: number,
  bend: BendSign,
): IkSolution {
  const rootX = finite(root.x)
  const rootY = finite(root.y)
  const upperLength = boneLength(upper)
  const lowerLength = boneLength(lower)
  const dx = finite(target.x) - rootX
  const dy = finite(target.y) - rootY
  const distance = Math.hypot(dx, dy)

  // A target sitting on its own root has no direction to point at. Falling back
  // to straight down (the way a slack limb hangs) keeps the output finite and
  // deterministic; it cannot happen in a real rig, where a hand is never
  // coincident with its shoulder.
  const dirX = distance > EPSILON ? dx / distance : 0
  const dirY = distance > EPSILON ? dy / distance : 1

  const reach = upperLength + lowerLength
  const fold = Math.abs(upperLength - lowerLength)
  const clamped = distance > reach + EPSILON || distance < fold - EPSILON
  // The distance actually solvable. Everything below is exact for this value,
  // which is what keeps a clamped limb a *straight* limb rather than a NaN.
  const solvable = clamp(distance, fold, reach)

  // A zero-length bone is degenerate rather than wrong — a figure could
  // legitimately declare a limb with no forearm — and the law of cosines below
  // divides by `upperLength`, so it is handled here instead of guarded there.
  if (upperLength < EPSILON) {
    const tip = { x: rootX + dirX * lowerLength, y: rootY + dirY * lowerLength }
    const angle = Math.atan2(dirY, dirX) * RAD_TO_DEG
    return { mid: { x: rootX, y: rootY }, tip, upperAngleDeg: angle, lowerAngleDeg: angle, clamped }
  }

  const numerator = solvable * solvable + upperLength * upperLength - lowerLength * lowerLength
  const denominator = 2 * solvable * upperLength
  // `solvable` is only near zero when the chain has folded flat onto itself,
  // which requires `upper === lower`; the interior angle there is exactly 90°.
  const interior =
    denominator > EPSILON ? Math.acos(clamp(numerator / denominator, -1, 1)) : Math.PI / 2

  const baseAngle = Math.atan2(dirY, dirX)
  const upperAngle = baseAngle + bend * interior
  const mid = {
    x: rootX + Math.cos(upperAngle) * upperLength,
    y: rootY + Math.sin(upperAngle) * upperLength,
  }
  const reachable = { x: rootX + dirX * solvable, y: rootY + dirY * solvable }
  // Fully folded: `mid` and the reachable point coincide with nothing between
  // them, so aim the lower bone back at the root, which is where the tip is.
  const lowerAngle =
    Math.hypot(reachable.x - mid.x, reachable.y - mid.y) > EPSILON
      ? Math.atan2(reachable.y - mid.y, reachable.x - mid.x)
      : Math.atan2(rootY - mid.y, rootX - mid.x)
  const tip = {
    x: mid.x + Math.cos(lowerAngle) * lowerLength,
    y: mid.y + Math.sin(lowerAngle) * lowerLength,
  }

  return {
    mid,
    tip,
    upperAngleDeg: upperAngle * RAD_TO_DEG,
    lowerAngleDeg: lowerAngle * RAD_TO_DEG,
    clamped,
  }
}

// ─── Resolved output: what the solver hands back ─────────────────────────────

export interface ResolvedBone {
  readonly from: Joint
  readonly to: Joint
  /** Absolute direction `from` → `to`, degrees, y-down.
   *
   * Absolute, not relative to the parent bone. If wave 2 nests bones as SVG
   * groups it needs each child's *local* angle, which is this minus its
   * parent's — and because a difference of two linear interpolations is itself
   * linear, interpolating local angles and interpolating absolute ones describe
   * the same motion. Either nesting works; absolute is what the canonical
   * skeleton table is written in. */
  readonly angleDeg: number
  /** As drawn: `restLength × foreshorten`. */
  readonly length: number
  /** As declared. `length !== restLength` only where a phase declares
   * foreshortening, which makes the bone-length test self-describing. */
  readonly restLength: number
}

export interface ResolvedLimb {
  readonly rootId: LimbRoot
  /** One bone for an FK limb, two for IK. */
  readonly bones: readonly ResolvedBone[]
  readonly root: Joint
  /** The elbow/knee — `undefined` for a one-bone limb, which is exactly what
   * `StickFigure` wants: absent means a straight line root → tip. */
  readonly mid: Joint | undefined
  readonly tip: Joint
  /** The IK target at this position, or `undefined` for an FK limb. */
  readonly target: Joint | undefined
  readonly clamped: boolean
}

export interface RigPose {
  readonly position: number
  readonly shoulder: Joint
  readonly hip: Joint
  readonly head: Joint
  readonly neck: ResolvedBone
  readonly torso: ResolvedBone
  readonly limbs: Readonly<Record<RigLimbId, ResolvedLimb>>
}

function resolveBone(from: Joint, bone: RigBone, position: number): ResolvedBone {
  const restLength = boneLength(bone.length)
  const length = restLength * foreshortenAt(bone.foreshorten, position)
  const angleDeg = lerp(finite(bone.angleDeg.start), finite(bone.angleDeg.end), position)
  return { from, to: solveFk(from, angleDeg, length), angleDeg, length, restLength }
}

function resolveLimb(limb: RigLimb, root: Joint, position: number): ResolvedLimb {
  if (limb.kind === 'fk') {
    const bone = resolveBone(root, limb, position)
    return {
      rootId: limb.root,
      bones: [bone],
      root,
      mid: undefined,
      tip: bone.to,
      target: undefined,
      clamped: false,
    }
  }

  const factor = foreshortenAt(limb.foreshorten, position)
  const upperRest = boneLength(limb.upper)
  const lowerRest = boneLength(limb.lower)
  const target = lerpJoint(limb.target.start, limb.target.end, position)
  const solution = solveIk(root, target, upperRest * factor, lowerRest * factor, limb.bend)
  return {
    rootId: limb.root,
    bones: [
      {
        from: root,
        to: solution.mid,
        angleDeg: solution.upperAngleDeg,
        length: upperRest * factor,
        restLength: upperRest,
      },
      {
        from: solution.mid,
        to: solution.tip,
        angleDeg: solution.lowerAngleDeg,
        length: lowerRest * factor,
        restLength: lowerRest,
      },
    ],
    root,
    mid: solution.mid,
    tip: solution.tip,
    target,
    clamped: solution.clamped,
  }
}

/**
 * The rig at any position on the 0..1 axis: `0` is the drawn `start` pose, `1`
 * the drawn `end`, and everything between is the same skeleton part-rotated.
 *
 * Position feeds three kinds of interpolation, and which kind each value gets is
 * the whole design:
 *
 *   - the shoulder anchor is **lerped as a point**, because it is a translation
 *     and CSS lerps `translate()` the same way, so the two agree exactly;
 *   - bone angles and foreshorten factors are **lerped as numbers**, and every
 *     length stays constant through the rotation;
 *   - IK mid joints are **re-solved**, never interpolated, so the planted tip is
 *     exact at every position this function is asked about.
 *
 * FK angles are lerped *as written*, which is what lets an author choose the
 * long way round a sweep — see `FkLimb`.
 */
export function resolvePose(rig: Rig, position: number): RigPose {
  const t = clamp(finite(position), 0, 1)
  const shoulder = lerpJoint(rig.shoulder.start, rig.shoulder.end, t)
  const torso = resolveBone(shoulder, rig.torso, t)
  const neck = resolveBone(shoulder, rig.neck, t)
  const hip = torso.to

  const limbs = {} as Record<RigLimbId, ResolvedLimb>
  for (const id of LIMB_IDS) {
    const limb = rig.limbs[id]
    limbs[id] = resolveLimb(limb, limb.root === 'shoulder' ? shoulder : hip, t)
  }

  return { position: t, shoulder, hip, head: neck.to, neck, torso, limbs }
}

/** The rig at one of its two authored poses. The still frame under
 * `prefers-reduced-motion` is one of these, and so are the endpoints of every
 * loop. */
export function resolvePhasePose(rig: Rig, phase: FigurePhase): RigPose {
  return resolvePose(rig, phase === 'start' ? 0 : 1)
}

/** Every bone in a pose, paired with the id wave 2 names its `@keyframes` after.
 * Ordered deterministically — spine first, then `LIMB_IDS` — for the same reason
 * `LIMB_IDS` exists. */
export function boneEntries(pose: RigPose): readonly (readonly [RigBoneId, ResolvedBone])[] {
  const entries: (readonly [RigBoneId, ResolvedBone])[] = [
    ['neck', pose.neck],
    ['torso', pose.torso],
  ]
  for (const id of LIMB_IDS) {
    const bones = pose.limbs[id].bones
    if (bones.length === 1 && bones[0]) entries.push([id, bones[0]])
    else {
      if (bones[0]) entries.push([`${id}-upper`, bones[0]])
      if (bones[1]) entries.push([`${id}-lower`, bones[1]])
    }
  }
  return entries
}

/** True when both phases name the same target — the limb the drift test cares
 * about, because its tip is *supposed* to be motionless for the whole loop.
 * Narrows to `IkLimb`, since only an IK limb has a target to plant. */
export function isPlantedLimb(limb: RigLimb): limb is IkLimb {
  if (limb.kind !== 'ik') return false
  return (
    Math.abs(limb.target.start.x - limb.target.end.x) < EPSILON &&
    Math.abs(limb.target.start.y - limb.target.end.y) < EPSILON
  )
}

// ─── Sampling: the JS runs once, CSS does the rest ───────────────────────────

/**
 * Interior samples emitted per *moving* timeline segment. Holds get no interior
 * samples at all — a hold is one still position, and subdividing it would emit
 * identical stops.
 *
 * ## Why 12
 *
 * Between two emitted stops CSS interpolates each bone's angle linearly, and the
 * true IK path is not linear in those angles. So a planted hand traces a shallow
 * arc off its plant and back: exact at every stop, worst at the midpoint. The
 * error falls off with the square of the angle step, so resolution buys a lot —
 * halving the step quarters the drift.
 *
 * `push` is the worst case in the content by a wide margin: a 94-unit arm chain
 * over a hand planted on the floor, with a shoulder that descends 44 units, so
 * the elbow folds through ~58° across half a loop. Measured on that geometry with
 * `worstTipDrift`, in figure units:
 *
 *     samples   2      4      6      8     10     12     16
 *     drift   5.05   2.51   1.66   1.23   0.97   0.80   0.59
 *
 * The budget is ~1 unit, which at the only call site's 132px is two thirds of a
 * device pixel. 12 clears it with room for wave 2 to re-author a pose without
 * re-deriving this number; 10 would clear it by 3%, which is not margin. No other
 * figure is close — `hinge` peaks at 0.27 and the two all-FK figures at zero,
 * because an FK angle is interpolated identically along both paths.
 *
 * The cost is CSS text and nothing else, since none of this runs per frame: the
 * longest clock in the content (`push-06` — descend, hold, return) has two moving
 * segments, so 26 stops per bone across ten bones. Raising it further is the
 * right lever if a re-authored pose blows the budget; accepting a foot that
 * skates is not, because a slide is worse than the crossfade this replaces.
 */
export const SAMPLES_PER_MOVING_SEGMENT = 12

export interface RigSample {
  /** Keyframe offset, 0..100. */
  readonly percent: number
  /** Position on the timeline's own axis: 0 = drawn `start`, 1 = drawn `end`. */
  readonly position: number
  readonly pose: RigPose
}

/** Bring `degrees` into the same revolution as `reference`, so a bone never
 * takes the long way round between two stops. Only matters where `atan2`'s
 * branch cut falls inside a sweep: without it, a bone crossing ±180° would be
 * told to spin 350° in one step rather than 10°. */
function unwrapAngle(reference: number, degrees: number): number {
  return degrees + Math.round((reference - degrees) / 360) * 360
}

function unwrapBone(reference: ResolvedBone, bone: ResolvedBone): ResolvedBone {
  const angleDeg = unwrapAngle(reference.angleDeg, bone.angleDeg)
  return angleDeg === bone.angleDeg ? bone : { ...bone, angleDeg }
}

function unwrapPose(reference: RigPose, pose: RigPose): RigPose {
  const limbs = {} as Record<RigLimbId, ResolvedLimb>
  for (const id of LIMB_IDS) {
    const limb = pose.limbs[id]
    const previous = reference.limbs[id]
    limbs[id] = {
      ...limb,
      bones: limb.bones.map((bone, index) => {
        const before = previous.bones[index]
        return before ? unwrapBone(before, bone) : bone
      }),
    }
  }
  return {
    ...pose,
    neck: unwrapBone(reference.neck, pose.neck),
    torso: unwrapBone(reference.torso, pose.torso),
    limbs,
  }
}

/**
 * The timeline as a list of solved poses — one per keyframe stop wave 2 emits.
 *
 * Segment boundaries are always stops, and interior samples are only added
 * inside moving segments. That ordering is load-bearing: `buildTimeline`'s holds
 * are what separate `push-05` from `push-06`, and a hold only reads as a hold if
 * its two ends are exact stops with nothing between them. Sampling on a uniform
 * grid over the whole loop instead would smear the hold's edges by up to one
 * grid step and blunt the only cue the paused rungs have left.
 *
 * Times are cumulative, so consecutive stops always lie inside one segment,
 * where position is linear in time — which is what makes a plain `linear` CSS
 * animation the correct playback and what lets `worstTipDrift` find a midpoint
 * position by averaging two neighbours.
 */
export function sampleTimeline(
  rig: Rig,
  timeline: MotionTimeline,
  samplesPerMovingSegment: number = SAMPLES_PER_MOVING_SEGMENT,
): readonly RigSample[] {
  const subdivisions = Math.max(1, Math.floor(finite(samplesPerMovingSegment)))
  // A timeline with no segments cannot happen through `buildTimeline`, but a
  // zero here would divide by zero below; one still pose is the honest answer.
  const totalMs = Math.max(1, finite(timeline.totalMs))
  const first = timeline.segments[0]
  if (!first) return [{ percent: 0, position: 0, pose: resolvePose(rig, 0) }]

  const stops: { percent: number; position: number }[] = [
    { percent: 0, position: clamp(finite(first.from), 0, 1) },
  ]
  let elapsedMs = 0
  for (const segment of timeline.segments) {
    const from = clamp(finite(segment.from), 0, 1)
    const to = clamp(finite(segment.to), 0, 1)
    const duration = Math.max(0, finite(segment.durationMs))
    const steps = segment.phase === 'hold' || from === to ? 1 : subdivisions
    for (let step = 1; step <= steps; step += 1) {
      const fraction = step / steps
      stops.push({
        percent: ((elapsedMs + duration * fraction) / totalMs) * 100,
        position: lerp(from, to, fraction),
      })
    }
    elapsedMs += duration
  }

  const samples: RigSample[] = []
  for (const stop of stops) {
    const pose = resolvePose(rig, stop.position)
    const previous = samples.at(-1)
    samples.push({
      percent: clamp(stop.percent, 0, 100),
      position: stop.position,
      pose: previous ? unwrapPose(previous.pose, pose) : pose,
    })
  }
  return samples
}

/**
 * The pose CSS actually paints part-way between two emitted stops.
 *
 * Deliberately dumb: it lerps the anchor, every bone angle and every bone length
 * as plain numbers and rebuilds the chain from them, because that is exactly
 * what an interpolated `translate()`/`rotate()` does — including lerping angles
 * *numerically* rather than by shortest arc, which is why `sampleTimeline`
 * unwraps them first.
 *
 * Two things follow. Bone lengths survive, since lerping a length between two
 * equal lengths returns it, which is why no bone can collapse between samples
 * the way interpolating *coordinates* collapsed `prone`'s arm to 26% of its
 * length at the midpoint of its 150° sweep. And IK targets do not survive
 * exactly, which is the approximation `worstTipDrift` measures.
 */
export function blendPoses(a: RigPose, b: RigPose, t: number): RigPose {
  const blendBone = (from: Joint, first: ResolvedBone, second: ResolvedBone | undefined) => {
    const other = second ?? first
    const angleDeg = lerp(first.angleDeg, other.angleDeg, t)
    const length = lerp(first.length, other.length, t)
    return {
      from,
      to: solveFk(from, angleDeg, length),
      angleDeg,
      length,
      restLength: first.restLength,
    }
  }

  const shoulder = lerpJoint(a.shoulder, b.shoulder, t)
  const torso = blendBone(shoulder, a.torso, b.torso)
  const neck = blendBone(shoulder, a.neck, b.neck)
  const hip = torso.to

  const limbs = {} as Record<RigLimbId, ResolvedLimb>
  for (const id of LIMB_IDS) {
    const limb = a.limbs[id]
    const other = b.limbs[id]
    const root = limb.rootId === 'shoulder' ? shoulder : hip
    const bones: ResolvedBone[] = []
    let cursor = root
    for (const [index, bone] of limb.bones.entries()) {
      const blended = blendBone(cursor, bone, other.bones[index])
      bones.push(blended)
      cursor = blended.to
    }
    limbs[id] = {
      rootId: limb.rootId,
      bones,
      root,
      mid: bones.length > 1 ? bones[0]?.to : undefined,
      tip: cursor,
      target:
        limb.target && other.target ? lerpJoint(limb.target, other.target, t) : limb.target,
      clamped: limb.clamped || other.clamped,
    }
  }

  return {
    position: lerp(a.position, b.position, t),
    shoulder,
    hip,
    head: neck.to,
    neck,
    torso,
    limbs,
  }
}

/**
 * Worst distance, in figure units, between where a limb's tip is drawn and where
 * it belongs, measured at the midpoint of every gap between emitted stops.
 *
 * This is the number that decides `SAMPLES_PER_MOVING_SEGMENT`, and it exists as
 * a function rather than as a comment so a rig re-authored in a later wave can
 * be checked in one line instead of re-derived by hand.
 *
 * Midpoints only: the error is zero at the stops by construction and, being a
 * smooth second-order deviation over each gap, is largest in the middle. FK
 * limbs contribute nothing — their angle is lerped in both paths, so the blend
 * *is* the truth — which leaves this measuring exactly the IK approximation.
 */
export function worstTipDrift(
  rig: Rig,
  timeline: MotionTimeline,
  samplesPerMovingSegment: number = SAMPLES_PER_MOVING_SEGMENT,
): number {
  const samples = sampleTimeline(rig, timeline, samplesPerMovingSegment)
  let worst = 0
  for (const [index, sample] of samples.entries()) {
    const next = samples[index + 1]
    if (!next) break
    const drawn = blendPoses(sample.pose, next.pose, 0.5)
    const truth = resolvePose(rig, (sample.position + next.position) / 2)
    for (const id of LIMB_IDS) {
      const a = drawn.limbs[id].tip
      const b = truth.limbs[id].tip
      worst = Math.max(worst, Math.hypot(a.x - b.x, a.y - b.y))
    }
  }
  return worst
}
