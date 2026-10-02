import type { FigureDefinition, Rig } from './types.ts'

/**
 * Hinge: lying with the hips down, to the bridge (hips raised, shoulders and
 * feet planted). Covers the glute bridge, its pause/single-leg/elevated
 * variants, and the nordic negative — the eccentric-only rungs distinguish
 * themselves by the clock and the tempo overlay, not a new drawing.
 *
 * The shoulders are the anchor and do not move; the torso pitches from 6.96° to
 * −35.13° at the 66 units the bridged drawing measured, which lifts the hip 46
 * units, from (123.5, 158) to (112, 112). The old START drew the torso 52.3 long
 * with the hip at (110, 156): a torso cannot lengthen by 26% on the way up.
 *
 * Feet are planted, so the legs are two-bone IK with the knee above the
 * hip→heel line (`bend: -1`). The thigh lengths are chosen so the solved knees
 * land within ~3 units of the drawn ones in both phases (legL 33, legR 39.5) —
 * the shorter legR thigh the old drawing implied cannot reach its heel from the
 * bridged hip and would clamp there. The two legs differ because the far leg
 * is drawn offset, not because the body is asymmetric.
 */
export const HINGE_RIG: Rig = {
  shoulder: { start: { x: 58, y: 150 }, end: { x: 58, y: 150 } },
  torso: { length: 66, angleDeg: { start: 6.96, end: -35.13 } },
  neck: { length: 20, angleDeg: { start: 180, end: 180 } },
  limbs: {
    armL: { kind: 'fk', root: 'shoulder', length: 20.4, angleDeg: { start: 101, end: 101 } },
    armR: { kind: 'fk', root: 'shoulder', length: 24.1, angleDeg: { start: 85, end: 85 } },
    legL: {
      kind: 'ik',
      root: 'hip',
      upper: 33,
      lower: 43.91,
      bend: -1,
      target: { start: { x: 160, y: 170 }, end: { x: 160, y: 170 } },
    },
    legR: {
      kind: 'ik',
      root: 'hip',
      upper: 39.5,
      lower: 45.65,
      bend: -1,
      target: { start: { x: 166, y: 176 }, end: { x: 166, y: 176 } },
    },
  },
}

/** Points up, directly above the bridged hip: the hips rise. The old arrow ran
 * up through the hip and thigh. */
export const HINGE_FIGURE: FigureDefinition = {
  rig: HINGE_RIG,
  arrow: { x: 112, y1: 98, y2: 56 },
}
