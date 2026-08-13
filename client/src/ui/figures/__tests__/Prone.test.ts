// Runs in the default `node` environment, same as `rig.test.ts`: this is pure
// geometry, no DOM.
//
// This file only owns `Prone.tsx`. It duplicates a little of `rig.test.ts`'s
// machinery on purpose — that file is wave 1's, shared across all five
// figures, and touching it would conflict with five agents editing this brief
// at once. Everything here is scoped to `PRONE_RIG` alone.
import { STROKE_WIDTH } from '../constants.ts'
import { PRONE_MOVEMENT_ARROW, PRONE_RIG } from '../Prone.tsx'
import { buildTimeline } from '../motion.ts'
import {
  LIMB_IDS,
  boneEntries,
  resolvePhasePose,
  resolvePose,
  sampleTimeline,
  worstTipDrift,
} from '../rig.ts'
import type { Joint, Rig } from '../types.ts'

function distance(a: Joint, b: Joint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Shortest distance from a point to a line *segment* — the torso is a
 * segment, not an infinite line, mirroring `rig.test.ts`'s silhouette check. */
function distanceToSegment(point: Joint, from: Joint, to: Joint): number {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const lengthSquared = dx * dx + dy * dy
  const along =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared))
  return distance(point, { x: from.x + dx * along, y: from.y + dy * along })
}

/** Fine sweep across the whole 0..1 axis, not just the two authored phases —
 * the trap this figure exists to catch (correction 2: −140°/−127° vs.
 * 220°/233°) only shows up mid-sweep, at the midpoint of the arm's rotation,
 * not at either endpoint. 200 steps resolves the sweep to under a degree per
 * step for a ~150° rotation, which is enough to find the true extremum rather
 * than stepping over it. */
const SWEEP_STEPS = 200
const sweepPositions = Array.from({ length: SWEEP_STEPS + 1 }, (_, i) => i / SWEEP_STEPS)

// Half the stroke: a line's drawn edge sits this far past its endpoint
// coordinate, round cap included, so this is the real margin a coordinate
// needs from the 0..200 viewBox edge.
const HALF_STROKE = STROKE_WIDTH / 2

describe('PRONE_RIG shape', () => {
  it('declares all four limbs as free-swinging FK, never IK', () => {
    // Nothing is planted — the hand is in open air at both ends of the
    // sweep — so an IK declaration here would be modelling a constraint that
    // does not exist and would silently start clamping.
    for (const id of LIMB_IDS) {
      expect(PRONE_RIG.limbs[id].kind, id).toBe('fk')
    }
  })

  it('declares the neck bone (correction 5) rather than omitting it', () => {
    expect(PRONE_RIG.neck.length).toBeGreaterThan(0)
    expect(Number.isFinite(PRONE_RIG.neck.angleDeg.start)).toBe(true)
    expect(Number.isFinite(PRONE_RIG.neck.angleDeg.end)).toBe(true)
  })

  it('declares no foreshorten anywhere — the field is dead as of wave 2', () => {
    expect(PRONE_RIG.torso.foreshorten).toBeUndefined()
    expect(PRONE_RIG.neck.foreshorten).toBeUndefined()
    for (const id of LIMB_IDS) {
      const limb = PRONE_RIG.limbs[id]
      expect(limb.foreshorten, id).toBeUndefined()
    }
  })

  it('torso, hip and legs are identical in both phases — only the arms move', () => {
    expect(PRONE_RIG.shoulder.start).toEqual(PRONE_RIG.shoulder.end)
    expect(PRONE_RIG.torso.angleDeg.start).toBe(PRONE_RIG.torso.angleDeg.end)
    expect(PRONE_RIG.neck.angleDeg.start).toBe(PRONE_RIG.neck.angleDeg.end)
    for (const id of ['legL', 'legR'] as const) {
      const limb = PRONE_RIG.limbs[id]
      expect(limb.kind, id).toBe('fk')
      if (limb.kind === 'fk') expect(limb.angleDeg.start, id).toBe(limb.angleDeg.end)
    }
    for (const id of ['armL', 'armR'] as const) {
      const limb = PRONE_RIG.limbs[id]
      expect(limb.kind, id).toBe('fk')
      if (limb.kind === 'fk') expect(limb.angleDeg.start, id).not.toBe(limb.angleDeg.end)
    }
  })

  it('the arms sweep close to the brief-measured 150°/167°, and forward — not backward', () => {
    for (const [id, expectedSweep] of [
      ['armL', 149],
      ['armR', 167],
    ] as const) {
      const limb = PRONE_RIG.limbs[id]
      if (limb.kind !== 'fk') throw new Error(`${id} is not FK`)
      const sweep = limb.angleDeg.end - limb.angleDeg.start
      // Forward (positive) and in the ~150° neighbourhood — not the ~-211°/
      // ~-294° a −140°/−127° declaration would produce.
      expect(sweep, id).toBeGreaterThan(0)
      expect(sweep, id).toBeCloseTo(expectedSweep, 0)
    }
  })
})

describe('bone length is invariant across the whole sweep', () => {
  it('every bone is exactly canonical length at 200 positions, not just the two phases', () => {
    const canonical: Record<string, number> = {
      torso: PRONE_RIG.torso.length,
      neck: PRONE_RIG.neck.length,
      armL: 49.7,
      armR: 52.8,
      legL: 40.8,
      legR: 48.1,
    }
    let checked = 0
    for (const position of sweepPositions) {
      const pose = resolvePose(PRONE_RIG, position)
      for (const [id, bone] of boneEntries(pose)) {
        expect(bone.length, `${id}@${position.toFixed(3)}`).toBeCloseTo(canonical[id]!, 6)
        expect(distance(bone.from, bone.to), `${id}@${position.toFixed(3)}`).toBeCloseTo(
          canonical[id]!,
          6,
        )
        checked += 1
      }
    }
    expect(checked).toBe(sweepPositions.length * 6)
  })

  it('holds between emitted stops too, under a couple of representative timelines', () => {
    // `blendPoses` (via `sampleTimeline`) is where a naive coordinate morph
    // would have collapsed this figure's arm to ~26% of its length at the
    // midpoint of the sweep — see `rig.ts`'s docstring. Nothing here should be
    // able to reproduce that, since every stop and every blend is a rotation.
    for (const modifier of [
      undefined,
      { eccentricSeconds: 3 },
      { pauseSeconds: 2, pauseAt: 'bottom' as const },
      { pauseSeconds: 1, pauseAt: 'top' as const },
    ]) {
      const timeline = buildTimeline('prone', modifier)
      const samples = sampleTimeline(PRONE_RIG, timeline)
      expect(samples.length).toBeGreaterThan(2)
      for (const sample of samples) {
        for (const [id, bone] of boneEntries(sample.pose)) {
          expect(distance(bone.from, bone.to), `${id}@${sample.percent.toFixed(1)}%`).toBeCloseTo(
            bone.length,
            6,
          )
        }
      }
    }
  })
})

describe('worstTipDrift', () => {
  it('is under the 1-unit budget — and should be ~0, since an all-FK figure has nothing to drift', () => {
    // `rig.ts`: "FK limbs contribute nothing [to drift] — their angle is
    // lerped in both paths, so the blend *is* the truth." `prone` has no IK
    // limb at all, so this is really asserting the docstring's claim about
    // this exact figure rather than exercising an approximation.
    for (const modifier of [
      { eccentricSeconds: 3 },
      { pauseSeconds: 2, pauseAt: 'bottom' as const },
    ]) {
      const timeline = buildTimeline('prone', modifier)
      const drift = worstTipDrift(PRONE_RIG, timeline)
      expect(drift).toBeLessThan(1)
      expect(drift).toBeCloseTo(0, 6)
    }
  })
})

describe('no hand comes within 12 units of the torso segment', () => {
  it('holds at every one of 200 positions across the sweep', () => {
    let worst = Infinity
    let worstAt = ''
    for (const position of sweepPositions) {
      const pose = resolvePose(PRONE_RIG, position)
      for (const id of LIMB_IDS) {
        const clearance = distanceToSegment(pose.limbs[id].tip, pose.shoulder, pose.hip)
        if (clearance < worst) {
          worst = clearance
          worstAt = `${id}@${position.toFixed(3)}`
        }
      }
    }
    expect(worstAt).not.toBe('')
    expect(worst, `worst at ${worstAt}`).toBeGreaterThan(12)
  })

  it('fails this exact assertion if the trap is un-fixed — armL/armR at -140/-127', () => {
    // This is the test that actually earns its keep: it proves the guard
    // above is not vacuous by showing the specific regression it exists to
    // catch really does trip it. -140/-127 point the same *direction* as
    // 220/233 (they are congruent mod 360) but are interpolated the *long*
    // way from the start angles of 71/66, dragging the hand down through the
    // torso instead of up past the head.
    const trapped: Rig = {
      ...PRONE_RIG,
      limbs: {
        ...PRONE_RIG.limbs,
        armL: { ...PRONE_RIG.limbs.armL, kind: 'fk', angleDeg: { start: 71, end: -140 } },
        armR: { ...PRONE_RIG.limbs.armR, kind: 'fk', angleDeg: { start: 66, end: -127 } },
      },
    }
    let worst = Infinity
    for (const position of sweepPositions) {
      const pose = resolvePose(trapped, position)
      for (const id of ['armL', 'armR'] as const) {
        const clearance = distanceToSegment(pose.limbs[id].tip, pose.shoulder, pose.hip)
        worst = Math.min(worst, clearance)
      }
    }
    // The brief measured ~4 units for this exact regression. Assert well
    // clear of the 12-unit guard, in the direction that would fail it, so a
    // future change to the guard's threshold cannot make this pass by luck.
    expect(worst).toBeLessThan(6)
  })
})

describe('nothing in the sweep leaves the 200×200 viewBox', () => {
  it('every drawn point stays clear of the edge by at least half a stroke width', () => {
    // The known tight spot, stated up front rather than discovered by the
    // test: `armR` (the longer arm, 52.8) points due left (180°) partway
    // through its 66°→233° sweep, since 180 lies inside that range. At that
    // instant the tip is `shoulder.x - 52.8` = 58 - 52.8 = 5.2, which is the
    // ~5.2 wave 1 flagged. `armL` never reaches 180° as a full swing the same
    // way`s — its own minimum is shallower — so `armR` is expected to be the
    // binding case, not a surprise if it turns out to be.
    let worstMargin = Infinity
    let worstAt = ''
    for (const position of sweepPositions) {
      const pose = resolvePose(PRONE_RIG, position)
      const points: readonly [string, Joint][] = [
        ['shoulder', pose.shoulder],
        ['hip', pose.hip],
        ['head', pose.head],
        ...LIMB_IDS.map((id): [string, Joint] => [id, pose.limbs[id].tip]),
      ]
      for (const [label, point] of points) {
        const margin = Math.min(
          point.x - HALF_STROKE,
          200 - point.x - HALF_STROKE,
          point.y - HALF_STROKE,
          200 - point.y - HALF_STROKE,
        )
        if (margin < worstMargin) {
          worstMargin = margin
          worstAt = `${label}@${position.toFixed(3)}`
        }
      }
    }
    expect(worstAt).not.toBe('')
    // Positive: nothing actually clips. Reported, not just asserted loosely,
    // because the margin is real but thin — see the report back to the brief.
    expect(worstMargin, `worst margin at ${worstAt}`).toBeGreaterThan(0)
    // And tight enough that this is a live constraint, not slack nobody could
    // ever hit — if this ever climbs comfortably above ~5, the note above is
    // stale and should be revisited.
    expect(worstMargin, `worst margin at ${worstAt}`).toBeLessThan(5)
  })
})

describe('nothing resolves to NaN or Infinity', () => {
  it('holds across the sweep and at both blended midpoints of a real timeline', () => {
    for (const position of sweepPositions) {
      const pose = resolvePose(PRONE_RIG, position)
      for (const [id, bone] of boneEntries(pose)) {
        expect(Number.isFinite(bone.angleDeg), id).toBe(true)
        expect(Number.isFinite(bone.length), id).toBe(true)
        expect(Number.isFinite(bone.to.x) && Number.isFinite(bone.to.y), id).toBe(true)
      }
    }
    const timeline = buildTimeline('prone', { eccentricSeconds: 3, pauseSeconds: 2 })
    const samples = sampleTimeline(PRONE_RIG, timeline)
    expect(samples.length).toBeGreaterThan(2)
    for (const sample of samples) {
      for (const [id, bone] of boneEntries(sample.pose)) {
        expect(Number.isFinite(bone.angleDeg), id).toBe(true)
      }
    }
  })
})

describe('the two authored phases match the drawing this replaces', () => {
  it('start is arms-by-the-hips, end is arms-overhead — not the reverse', () => {
    const start = resolvePhasePose(PRONE_RIG, 'start')
    const end = resolvePhasePose(PRONE_RIG, 'end')
    // "By the hips": the start-pose hand sits below the shoulder, roughly at
    // or past hip height.
    expect(start.limbs.armL.tip.y).toBeGreaterThan(start.shoulder.y)
    expect(start.limbs.armR.tip.y).toBeGreaterThan(start.shoulder.y)
    // "Overhead": the end-pose hand sits above the head, and toward the head
    // end of the body (smaller x) rather than out past the hip.
    expect(end.limbs.armL.tip.y).toBeLessThan(end.head.y)
    expect(end.limbs.armR.tip.y).toBeLessThan(end.head.y)
    expect(end.limbs.armL.tip.x).toBeLessThan(end.shoulder.x)
    expect(end.limbs.armR.tip.x).toBeLessThan(end.shoulder.x)
  })
})

describe('PRONE_MOVEMENT_ARROW', () => {
  it('points up (end above start), matching the arm sweeping toward overhead', () => {
    expect(PRONE_MOVEMENT_ARROW.y2).toBeLessThan(PRONE_MOVEMENT_ARROW.y1)
  })

  it('is a plain finite spec — nothing derived that could come back NaN', () => {
    for (const value of [
      PRONE_MOVEMENT_ARROW.x,
      PRONE_MOVEMENT_ARROW.y1,
      PRONE_MOVEMENT_ARROW.y2,
    ]) {
      expect(Number.isFinite(value)).toBe(true)
    }
  })
})
