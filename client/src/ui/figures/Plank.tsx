import type { FigureDefinition, Rig } from './types.ts'

/**
 * Plank/core: a flat plank to a hollow, hips-lifted shape — a subtle rock
 * rather than a big displacement, since the whole core ladder (dead bug, plank,
 * side plank, hollow hold, hollow rock, tuck L-sit) is time-based isometric work,
 * not reps through a large range.
 *
 * ## FK, not IK
 *
 * Nothing here is on the floor: hands sit near y 145, feet near 130, the ground
 * line at 182. Planting them would also be over-constrained — the hip rises 14
 * units, which would put a planted foot 62.9 from the hip against a longest leg
 * of 56.6, so IK would clamp for the whole loop. So the shoulder stays put, the
 * torso pitches 3.37° → −8.44°, and every limb is a rotation from its root: the
 * tips travel 1–13 units, which is what the drawings already did.
 *
 * Lengths are the longer of the two old measurements (the shorter is the bug):
 * arms 53.3 and 58, legs 56.6 and 65.1, torso 68.1. The neck lifts 3° with the
 * hollow.
 */
export const PLANK_RIG: Rig = {
  shoulder: { start: { x: 62, y: 92 }, end: { x: 62, y: 92 } },
  torso: { length: 68.1, angleDeg: { start: 3.37, end: -8.44 } },
  neck: { length: 21.63, angleDeg: { start: -146, end: -143 } },
  limbs: {
    armL: { kind: 'fk', root: 'shoulder', length: 53.3, angleDeg: { start: 95, end: 96 } },
    armR: { kind: 'fk', root: 'shoulder', length: 58, angleDeg: { start: 88, end: 90 } },
    legL: { kind: 'fk', root: 'hip', length: 56.6, angleDeg: { start: 40, end: 42 } },
    legR: { kind: 'fk', root: 'hip', length: 65.1, angleDeg: { start: 41, end: 43 } },
  },
}

/** Points up, above the hip: the hips lift into the hollow. The old arrow sat
 * on the legs. */
export const PLANK_FIGURE: FigureDefinition = {
  rig: PLANK_RIG,
  arrow: { x: 130, y1: 70, y2: 44 },
}
