import type { ComponentType } from 'react'

/** A figure never knows which rung it is drawing — only which half of the
 * movement it is showing. See `figures/index.ts` for the full contract. */
export type FigurePhase = 'start' | 'end'

export interface FigureProps {
  readonly phase: FigurePhase
}

/** Every registered figure is a plain function component of this shape. */
export type FigureComponent = ComponentType<FigureProps>

/** A point in the 200×200 figure coordinate space. */
export interface Joint {
  readonly x: number
  readonly y: number
}

// ─── The rig: what a figure author writes ───────────────────────────────────
//
// These are the *declaration* types — the vocabulary a figure file spells out.
// The types describing what the solver hands back (`ResolvedBone`, `RigPose`,
// `RigSample`) live next to the solver in `rig.ts`, because they are output, not
// input, and a figure file never names them.
//
// The governing rule, and the reason these types look the way they do: **a
// length is declared once per bone, an angle twice — once per phase.** Brief 23
// exists because the previous poses were authored as two independent coordinate
// sets, which let a single arm be 94.1 units long at the top of a push-up and
// 52.3 at the bottom (−44%). There is no way to express that here: a rotation
// cannot change a length, and the length has only one declaration site to
// disagree with itself. That is the point — not a test to be argued with, but a
// shape the mistake will not fit into.

/** A value that differs between the two drawn phases. `{ start, end }` is the
 * literal shape of the brief's canonical-skeleton table, one row per bone. */
export type PhasePair<T> = Readonly<Record<FigurePhase, T>>

/**
 * Which side of the root→tip line a two-bone chain's mid joint sits on, in
 * screen coordinates (**y grows downward**, so a positive rotation is clockwise
 * on screen). `1` puts the elbow/knee clockwise of the line, `-1`
 * anticlockwise.
 *
 * Concretely: the glute bridge's knee sits *above* the hip→heel line, so
 * `hinge` legs declare `-1`. A push-up's elbow points back toward the feet,
 * which in the side view used by `Push.tsx` is clockwise of the shoulder→hand
 * line, so `push` arms declare `1`.
 *
 * It is declared **per limb, not per phase**, and that is the whole safety
 * property: an IK solver has two mirror solutions at every position, and
 * picking the nearer one per frame is how a knee snaps backwards halfway
 * through an animation. With one sign for the whole limb the inversion is
 * unrepresentable.
 */
export type BendSign = 1 | -1

/** Which axial joint a limb hangs from. Arms hang from the shoulder, legs from
 * the hip; both are derived from the spine, never authored. */
export type LimbRoot = 'shoulder' | 'hip'

/**
 * One rigid segment: a length declared once, a direction declared per phase.
 *
 * `foreshorten` is the single documented escape hatch, and it is deliberately
 * awkward to reach for. A limb rotating out of the picture plane really does
 * project shorter — `Squat.tsx` is drawn front-on and its arms swing toward the
 * viewer — and without a name for that, the only way to draw it is to shorten
 * the bone, which is indistinguishable from the bug this file's shape exists to
 * prevent. Declaring it says "this is projection, and here is how much", so a
 * reader can tell the two apart and a test can still hold the *rest* of the
 * skeleton to an exact length. Absent means 1 (no projection). Values above 1
 * are clamped away rather than honoured: lengthening a bone is the bug.
 */
export interface RigBone {
  readonly length: number
  /** Absolute direction from the bone's root to its tip, degrees, y-down. */
  readonly angleDeg: PhasePair<number>
  readonly foreshorten?: PhasePair<number>
}

/**
 * A limb that swings freely: one bone, its direction authored per phase.
 *
 * Used where the tip is in the air and the angle is the thing the drawing is
 * *about* — `prone` arms sweeping 150° from the hips to overhead, `squat` arms
 * swinging 82° forward for balance.
 *
 * **The two angles are interpolated as written, not by shortest arc**, so the
 * author chooses which way round the sweep goes. This matters: `prone`'s left
 * arm ends up pointing up-and-back, which is `-140°` measured with `atan2` but
 * must be *declared* as `220°`. Written as `-140` the arm takes the other 211°
 * home, sweeping down through the torso instead of up past the head.
 */
export interface FkLimb extends RigBone {
  readonly kind: 'fk'
  readonly root: LimbRoot
}

/**
 * A limb whose tip is planted while its root moves: two bones, and the mid
 * joint is *solved* rather than authored.
 *
 * This is the case the previous drawings got wrong. `push`'s hands sit at
 * y=176 in both phases and its feet at y=150/158 in both — the shoulder
 * descends 44 units while the hand does not move at all. Measured as angles the
 * arm barely rotates (4°), which reads as "nothing happens"; what actually
 * happens is the elbow folding, and an elbow angle that satisfies a planted
 * hand is not a number a person can author twice and keep consistent.
 *
 * `target` is per-phase because a few tips travel a little, but the common and
 * intended case is the same point twice — see `isPlantedLimb` in `rig.ts`. It
 * is the one coordinate a limb declares, and it has to be: "on the floor" is a
 * statement about the canvas, not about the root, and a target expressed
 * relative to a moving root is by definition not planted.
 */
export interface IkLimb {
  readonly kind: 'ik'
  readonly root: LimbRoot
  /** Root → mid (upper arm, femur). */
  readonly upper: number
  /** Mid → tip (forearm, shank). */
  readonly lower: number
  readonly bend: BendSign
  readonly target: PhasePair<Joint>
  /** Scales *both* bones. See `RigBone.foreshorten` — same escape hatch, same
   * warning; a front-view squat's femur swings away from the viewer too. */
  readonly foreshorten?: PhasePair<number>
}

export type RigLimb = FkLimb | IkLimb

/** The four limbs every figure has. Fixed, because `StickFigure` draws exactly
 * two arms and two legs and a figure is a pose, not a new anatomy. */
export type RigLimbId = 'armL' | 'armR' | 'legL' | 'legR'

/** Bone identity for keyframe generation. A one-bone limb is named for the limb
 * itself; a two-bone limb splits. Wave 2 turns each of these into one
 * `@keyframes` block, so they double as CSS identifier fragments. */
export type RigBoneId =
  | 'neck'
  | 'torso'
  | RigLimbId
  | `${RigLimbId}-upper`
  | `${RigLimbId}-lower`

/**
 * A figure's whole skeleton and both its poses.
 *
 * `shoulder` is the **only** authored coordinate, and everything else — hip,
 * head, every limb joint — is derived from it by rotation. One anchor is what
 * makes the figure move as a body: nudge it and the whole drawing follows,
 * where two anchors would let the torso stretch between them again.
 *
 * The shoulder is the anchor rather than the hip because it is where the arms
 * hang from, and in four of the five patterns it is the joint the movement is
 * *about* — the push-up's shoulder descends, the squat's drops, the plank's
 * stays put while the hip rises. The hip follows from `torso`.
 */
export interface Rig {
  readonly shoulder: PhasePair<Joint>
  /** Shoulder → hip. */
  readonly torso: RigBone
  /** Shoulder → head centre. Short, but a bone: without it the head drifts off
   * the neck when the torso pitches. */
  readonly neck: RigBone
  readonly limbs: Readonly<Record<RigLimbId, RigLimb>>
}
