import type { FigureDefinition, Rig } from './types.ts'

/**
 * Squat, side view, facing right: standing to the bottom (hips back and down,
 * thighs parallel, knees forward over the toes, arms reaching forward for
 * balance). Every squat rung — assisted, bodyweight, tempo/pause variants,
 * heels elevated, split, single-leg, pistol progression — shares this rig.
 *
 * ## Why side-on (decided 2026-07-30)
 *
 * The squat used to be the one front-view figure, and a front view cannot be
 * rigged honestly: the femur and the arms swing toward the viewer, so they
 * project shorter, and the only way to draw that was a `foreshorten` factor —
 * three of them, by the end. Side-on, the femur and the arms both move in the
 * picture plane, every bone keeps one length, and all five figures share one
 * projection. It also shows squat *depth*, which is what the rungs prescribe
 * ("thighs parallel"). The front view's symmetric silhouette is the accepted
 * cost.
 *
 * ## The geometry
 *
 * Feet planted at x 97/104 on the floor; legs are two-bone IK, knee forward
 * (`bend: -1` in this view), at the standing chord rounded up (78.12) so the
 * standing pose is straight rather than clamped. The hip drops from (100, 100)
 * to (75.7, 139.6) — level with the knee, which is "parallel" — while the torso
 * pitches 32° forward over the feet, the way a body stays balanced with its
 * hips back.
 *
 * The arms are FK, the one free swing here: hanging slightly forward of the
 * thighs at the top (68°/62°, clear of the leg line at 132px rather than hidden
 * in it) to reaching horizontally at the bottom.
 */
export const SQUAT_RIG: Rig = {
  shoulder: { start: { x: 100, y: 58 }, end: { x: 98, y: 104 } },
  torso: { length: 42, angleDeg: { start: 90, end: 122 } },
  neck: { length: 18, angleDeg: { start: -90, end: -62 } },
  limbs: {
    armL: { kind: 'fk', root: 'shoulder', length: 64, angleDeg: { start: 68, end: -4 } },
    armR: { kind: 'fk', root: 'shoulder', length: 64, angleDeg: { start: 62, end: 2 } },
    legL: {
      kind: 'ik',
      root: 'hip',
      upper: 39.06,
      lower: 39.06,
      bend: -1,
      target: { start: { x: 104, y: 178 }, end: { x: 104, y: 178 } },
    },
    legR: {
      kind: 'ik',
      root: 'hip',
      upper: 39.06,
      lower: 39.06,
      bend: -1,
      target: { start: { x: 97, y: 178 }, end: { x: 97, y: 178 } },
    },
  },
}

/** Points down, in front of the head and above the reaching arms: the descent. */
export const SQUAT_FIGURE: FigureDefinition = {
  rig: SQUAT_RIG,
  arrow: { x: 156, y1: 34, y2: 80 },
}
