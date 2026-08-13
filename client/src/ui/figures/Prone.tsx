import type { MovementArrowProps } from './primitives.tsx'
import type { Rig } from './types.ts'

/**
 * Prone: face-down, arms trailing by the hips, swinging overhead in a Y. Covers
 * the postural pull work — Y raise, T raise, Y-T-W combo, reverse snow angel,
 * lat slide, end-range hold (`client/src/domain/ladders.ts`). Labelled
 * "postural," never "pull," per the locked equipment decision
 * (`corpus/wiki/decisions.md`) — there is no anchor to pull against at home, and
 * pretending otherwise is the misrepresentation the wording exists to avoid.
 *
 * This is the figure the whole morph exists for. The torso, hip and legs never
 * move — only the arms, and they sweep ~150°, the largest rotation in the
 * five-figure set. A crossfade between two poses that far apart barely
 * overlaps, so it read as a ghost-arm double-exposure rather than motion; an
 * FK rotation is the fix, because it is the one interpolation that cannot pass
 * through the arm's own length on the way.
 *
 * ## Why this is FK and not IK
 *
 * Nothing here is planted. The hand is in open air at both ends of the sweep,
 * so there is no target for a two-bone solver to satisfy — the angle itself
 * *is* the movement, exactly the case `FkLimb` exists for. Length is invariant
 * by construction (a rotation cannot change it), so `foreshorten` is neither
 * needed nor permitted: this is a side view and the arm sweeps entirely in the
 * picture plane, so nothing here projects shorter.
 *
 * ## Canonical lengths: the longer measurement, because the shorter one is the bug
 *
 * The old drawing shortened both arms at `start` — 36.1 and 43.9 — next to
 * 49.7 and 52.8 at `end`. A ±38%/+20% swing on a side view, in plane, is not
 * foreshortening; it is the same limb drawn twice at two different lengths.
 * 49.7 (`armL`) and 52.8 (`armR`) are canonical for both phases; `start` is
 * redrawn to match rather than `end`, per the brief's canonical table.
 *
 * ## The 220°/233° trap — read this before "fixing" it back to −140°/−127°
 *
 * `atan2` on the intended overhead hand position reports −140° (`armL`) and
 * −127° (`armR`), and an early pass of the canonical-skeleton table recorded
 * exactly those numbers. **They are the right direction and the wrong number.**
 * `resolvePose` interpolates an FK angle *as written* — deliberately, so the
 * author controls which way a limb sweeps (see `FkLimb` in `types.ts`) — and
 * −140° is 211° away from the `start` angle of 71° going forward, but only
 * 149° away going backward. Declared as −140°, the arm takes the *longer* way
 * round: down, across the hip, and back up on the far side, dragging the hand
 * within ~4 units of the torso at the midpoint of the sweep — a blob at the
 * only call site's 132px, reading as the arm vanishing into the body rather
 * than swinging free of it.
 *
 * 220° (`armL`) and 233° (`armR`) are the same absolute direction — congruent
 * mod 360° — reached the *short* way: 149°/167° forward from the `start`
 * angles of 71°/66°, sweeping the hand up past the head, which is the motion
 * every cue in the ladder actually describes ("raise," "overhead," "reach").
 * `Prone.test.ts` asserts a 12-unit torso clearance at every sampled position
 * specifically so a future edit back to −140°/−127° fails loudly instead of
 * silently reintroducing the blob.
 *
 * ## Everything else is static, and stays that way
 *
 * `shoulder` is the same point in both phases, `torso` and `neck` don't
 * rotate, and the legs don't move — this figure spends its entire movement
 * budget on the arms. `torso` (72.25, 5°) and `neck` (20.4, −169°) are the
 * chord and bearing the old absolute coordinates already drew (shoulder
 * (58,104) → hip (130,110) → head (38,100)); declaring them as one rig anchor
 * plus two static bones reproduces that silhouette exactly rather than
 * re-drawing it.
 */
export const PRONE_RIG: Rig = {
  shoulder: { start: { x: 58, y: 104 }, end: { x: 58, y: 104 } },
  torso: { length: 72.25, angleDeg: { start: 5, end: 5 } },
  neck: { length: 20.4, angleDeg: { start: -169, end: -169 } },
  limbs: {
    // 220, not the -140 that `atan2` reports for the same overhead direction.
    // See the "220°/233° trap" section above — this is correction 2 of wave 2,
    // and it is the one number in this file most likely to get "corrected"
    // back to the wrong value by a reader who only checks the endpoint.
    armL: {
      kind: 'fk',
      root: 'shoulder',
      length: 49.7,
      angleDeg: { start: 71, end: 220 },
    },
    // Same trap, mirrored: 233, not -127.
    armR: {
      kind: 'fk',
      root: 'shoulder',
      length: 52.8,
      angleDeg: { start: 66, end: 233 },
    },
    legL: { kind: 'fk', root: 'hip', length: 40.8, angleDeg: { start: 11, end: 11 } },
    legR: { kind: 'fk', root: 'hip', length: 48.1, angleDeg: { start: 17, end: 17 } },
  },
}

/**
 * Points up, from hip height to just above the head — the arrow is a fixed
 * annotation (`MovementArrow`'s own contract: constant across `start`/`end` so
 * only the body animates under it), not a readout of the rig, so it does not
 * need to track the redrawn arm lengths above exactly. It only has to land in
 * the same place it always has: beside the head end of the figure, pointing
 * the way the arms are about to sweep.
 */
export const PRONE_MOVEMENT_ARROW: MovementArrowProps = { x: 48, y1: 138, y2: 80 }
