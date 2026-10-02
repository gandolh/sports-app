import type { FigureDefinition, Rig } from './types.ts'

/**
 * Push-up, side view, head left and feet right: top (arms straight) to bottom
 * (chest low, elbows folded back). Every push rung — hands-high counter, chair,
 * knees, full, tempo/pause variants, elevated, diamond, archer — shares this one
 * rig; what differs between them is the clock (`motion.ts`) and the overlays.
 *
 * ## A rigid body pivoting about the planted feet
 *
 * A push-up is a plank that rotates about the toes, so the whole spine is one
 * rotation: −21.03° about the left foot (172, 150), chosen to drop the shoulder
 * exactly the 44 units the old drawing dropped it. Everything follows from that
 * one number — shoulder (62, 82) → (44.93, 126), torso 11.31° → −9.72°, neck
 * −143.13° → −164.16° — and the check that it is right is that the torso comes
 * out at 71.39 in both phases, the length the old START drew.
 *
 * The old END put the shoulder ~17 units too far right, and that error is the
 * only reason its legs appeared to bend at the bottom of the rep. Pivoted
 * correctly the legs stay straight: the left foot is the pivot, so its chord
 * never changes, and the right foot's shortens by 0.8 units, which the knee
 * absorbs invisibly.
 *
 * ## IK everywhere, because hands and feet are on the floor
 *
 * Hands stay at y=176 and feet at y=150/158 for the whole loop, so every limb is
 * a two-bone chain solved to its plant. The arms are the 94.1 the old START drew
 * straight (the old END's 52.3 was the −44% lie); at the bottom the chord is
 * ~52, so the elbow folds ~39 units out — back toward the feet, which is `bend:
 * -1` in this view. That is what a deep push-up looks like from the side, and the
 * 44-unit chest travel it buys is the information at 132px.
 *
 * Leg lengths are the start-pose chords rounded *up* (67.22 against 67.20,
 * 76.62 against 76.61): rounded down, a pose the drawing calls straight is
 * unreachable and the solver clamps it for the whole loop.
 */
export const PUSH_RIG: Rig = {
  shoulder: { start: { x: 62, y: 82 }, end: { x: 44.93, y: 126 } },
  torso: { length: 71.39, angleDeg: { start: 11.31, end: -9.72 } },
  neck: { length: 20, angleDeg: { start: -143.13, end: -164.16 } },
  limbs: {
    armL: {
      kind: 'ik',
      root: 'shoulder',
      upper: 47.05,
      lower: 47.05,
      bend: -1,
      target: { start: { x: 58, y: 176 }, end: { x: 58, y: 176 } },
    },
    armR: {
      kind: 'ik',
      root: 'shoulder',
      upper: 47.05,
      lower: 47.05,
      bend: -1,
      target: { start: { x: 66, y: 176 }, end: { x: 66, y: 176 } },
    },
    legL: {
      kind: 'ik',
      root: 'hip',
      upper: 33.61,
      lower: 33.61,
      bend: -1,
      target: { start: { x: 172, y: 150 }, end: { x: 172, y: 150 } },
    },
    legR: {
      kind: 'ik',
      root: 'hip',
      upper: 38.31,
      lower: 38.31,
      bend: -1,
      target: { start: { x: 177, y: 158 }, end: { x: 177, y: 158 } },
    },
  },
}

/** Points down, above the back at mid-body: the chest's descent. Clear of the
 * torso at its highest (y≈90 here at the top of the rep). */
export const PUSH_FIGURE: FigureDefinition = {
  rig: PUSH_RIG,
  arrow: { x: 100, y1: 36, y2: 74 },
}
