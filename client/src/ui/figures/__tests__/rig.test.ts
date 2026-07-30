// Runs in the default `node` environment: `rig.ts` is pure geometry, and keeping
// it testable with no DOM is the reason it emits numbers rather than JSX.
//
// ─── About the fixtures ─────────────────────────────────────────────────────
//
// The five rigs below are transcribed from the canonical-skeleton table in
// `corpus/briefs/todo/23-figure-rig-and-morph.md`, which was measured off the
// existing drawings. They are **fixtures, not art**: wave 2 owns the final
// numbers in `Push.tsx` and friends. They are here because a geometry module
// tested only on synthetic inputs proves nothing about the geometry the app
// actually has — `push`'s 94-unit arm chain folding 60° over a planted hand is
// the case that sets the sample resolution, and no tidy synthetic case is as
// harsh.
//
// Where a fixture departs from the brief's table it is commented, because those
// departures are findings about the table rather than choices about the test.
import { LADDERS } from '../../../domain/ladders.ts'
import { PATTERNS } from '@sports-app/shared/types.ts'
import { buildTimeline } from '../motion.ts'
import type { MotionTimeline } from '../motion.ts'
import {
  LIMB_IDS,
  SAMPLES_PER_MOVING_SEGMENT,
  angleBetween,
  blendPoses,
  boneEntries,
  isPlantedLimb,
  resolvePhasePose,
  resolvePose,
  sampleTimeline,
  solveFk,
  solveIk,
  worstTipDrift,
} from '../rig.ts'
import type { RigPose } from '../rig.ts'
import type { Joint, Rig } from '../types.ts'

/**
 * The brief's budget: ~1 figure unit of slide on a joint that is supposed to be
 * motionless. At the only call site's 132px (`Player.tsx`) one unit is 0.66
 * device pixels, so this is a good three times stricter than "invisible" — which
 * is the right side to err on, since a foot skating on the floor is worse than
 * the crossfade this replaces.
 *
 * (The brief glosses 1 unit as "half a stroke width"; `STROKE_WIDTH` is 6, so
 * half of it is 3. The stricter of the two numbers is the one asserted.)
 */
const DRIFT_BUDGET = 1

const LENGTH_EPSILON = 1e-9

function distance(a: Joint, b: Joint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Shortest distance from a point to a line *segment* — the torso is a segment,
 * not an infinite line, and a hand past the hip is clear of it. */
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

/** Deterministic pseudo-random spread. A seeded sequence rather than
 * `Math.random` so a failure is reproducible from the file alone. */
function spread(count: number, seed: number): readonly number[] {
  const values: number[] = []
  let state = seed
  for (let index = 0; index < count; index += 1) {
    state = (state * 1103515245 + 12345) % 2147483648
    values.push(state / 2147483648)
  }
  return values
}

// ─── The five fixtures ──────────────────────────────────────────────────────

const PUSH: Rig = {
  // Hands at y=176 and feet at y=150/158 in *both* drawn phases while the
  // shoulder descends 44 units — the case that motivates IK at all.
  shoulder: { start: { x: 62, y: 82 }, end: { x: 62, y: 126 } },
  torso: { length: 71.4, angleDeg: { start: 11, end: -15 } },
  neck: { length: 20, angleDeg: { start: -143, end: -148 } },
  limbs: {
    // bend -1 puts the elbow anticlockwise of the shoulder→hand line, which in
    // this side view is *back toward the feet* — where a push-up's elbow goes.
    // FINDING: the current END drawing has it the other way (elbow x=52 with the
    // shoulder at x=62 and the hand at x=56, so ahead of the line), which is
    // anatomically inverted. Read the bend sign off anatomy, not off the drawing.
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
    // FINDING: 67.6 and 77.0, not the table's 67.2 and 76.6. The table rounds
    // lengths to 0.1 and angles to whole degrees, and the rounding lands *short*:
    // with a torso of 71.4 at 11° the start hip is (132.1, 95.6), which is 67.44
    // from the planted foot at (172, 150) — so a 67.2 chain cannot reach a pose
    // the same table says is straight, and clamps. Every straight-in-one-phase
    // limb needs its canonical length taken from the derived chord, not from the
    // rounded measurement.
    legL: {
      kind: 'ik',
      root: 'hip',
      upper: 33.8,
      lower: 33.8,
      bend: -1,
      target: { start: { x: 172, y: 150 }, end: { x: 172, y: 150 } },
    },
    legR: {
      kind: 'ik',
      root: 'hip',
      upper: 38.5,
      lower: 38.5,
      bend: -1,
      target: { start: { x: 177, y: 158 }, end: { x: 177, y: 158 } },
    },
  },
}

const SQUAT: Rig = {
  shoulder: { start: { x: 100, y: 58 }, end: { x: 100, y: 108 } },
  // Front view, so the torso leans toward the viewer as the hips go back: 42 →
  // 34 is projection, not a stretched spine.
  torso: { length: 42, angleDeg: { start: 90, end: 90 }, foreshorten: { start: 1, end: 0.81 } },
  neck: { length: 18, angleDeg: { start: -90, end: -90 } },
  limbs: {
    // The brief's one sanctioned foreshorten case: the arms swing at the viewer.
    armL: {
      kind: 'fk',
      root: 'shoulder',
      length: 70.7,
      angleDeg: { start: 98, end: 180 },
      foreshorten: { start: 1, end: 0.45 },
    },
    armR: {
      kind: 'fk',
      root: 'shoulder',
      length: 70.7,
      angleDeg: { start: 82, end: 0 },
      foreshorten: { start: 1, end: 0.45 },
    },
    // FINDING: the legs need foreshortening too, and the brief says only the arms
    // do. A front-view femur points away from the viewer at the bottom of a
    // squat. Held at its full length in the picture plane with the foot planted
    // and the hip 36 units off the floor, the knee is forced ~36 units lateral —
    // a frog squat, and it collides with the forward-swung hands. 0.626
    // reproduces the drawn 49.6 chain and puts the knee ~16 out, which is what
    // the drawing has.
    //
    // 79.2 rather than the table's 78.6, for the same rounding reason as `push`'s
    // legs: the standing hip is 78.92 from the planted foot.
    legL: {
      kind: 'ik',
      root: 'hip',
      upper: 39.6,
      lower: 39.6,
      bend: 1,
      target: { start: { x: 88, y: 178 }, end: { x: 88, y: 178 } },
      foreshorten: { start: 1, end: 0.626 },
    },
    legR: {
      kind: 'ik',
      root: 'hip',
      upper: 39.6,
      lower: 39.6,
      bend: -1,
      target: { start: { x: 112, y: 178 }, end: { x: 112, y: 178 } },
      foreshorten: { start: 1, end: 0.626 },
    },
  },
}

const HINGE: Rig = {
  // The shoulders are the plant here — they do not move between phases — and the
  // hip rises 46 units, which is the whole drawing.
  shoulder: { start: { x: 58, y: 150 }, end: { x: 58, y: 150 } },
  torso: { length: 66, angleDeg: { start: 7, end: -35 } },
  neck: { length: 20, angleDeg: { start: 180, end: 180 } },
  limbs: {
    armL: { kind: 'fk', root: 'shoulder', length: 20.4, angleDeg: { start: 101, end: 101 } },
    armR: { kind: 'fk', root: 'shoulder', length: 24.1, angleDeg: { start: 85, end: 85 } },
    legL: {
      kind: 'ik',
      root: 'hip',
      upper: 36.88,
      lower: 43.91,
      bend: -1,
      target: { start: { x: 160, y: 170 }, end: { x: 160, y: 170 } },
    },
    legR: {
      kind: 'ik',
      root: 'hip',
      upper: 40,
      lower: 45.65,
      bend: -1,
      target: { start: { x: 166, y: 176 }, end: { x: 166, y: 176 } },
    },
  },
}

const PRONE: Rig = {
  shoulder: { start: { x: 58, y: 104 }, end: { x: 58, y: 104 } },
  torso: { length: 72.25, angleDeg: { start: 5, end: 5 } },
  neck: { length: 20.4, angleDeg: { start: -169, end: -169 } },
  limbs: {
    // 220, not the table's -140. Identical directions; opposite sweeps. Written
    // as -140 the arm travels the other 211° home, down through the torso
    // instead of up past the head. See `FkLimb`.
    armL: { kind: 'fk', root: 'shoulder', length: 49.7, angleDeg: { start: 71, end: 220 } },
    armR: { kind: 'fk', root: 'shoulder', length: 52.8, angleDeg: { start: 66, end: 233 } },
    legL: { kind: 'fk', root: 'hip', length: 40.8, angleDeg: { start: 11, end: 11 } },
    legR: { kind: 'fk', root: 'hip', length: 48.1, angleDeg: { start: 17, end: 17 } },
  },
}

const PLANK: Rig = {
  // FINDING: FK, though the brief's table marks all four limbs IK. Nothing in
  // the plank drawings is on the ground line (hands y≈140, feet y≈130, ground
  // 182) and every tip moves between phases. Worse, planting them is
  // over-constrained: the hip rises 14 units, which puts the planted foot 62.9
  // from the hip while the longest leg the drawings offer is 56.6 — unreachable
  // at any canonical length taken from the table. Held straight instead, the
  // shoulder stays put, the torso pitches, and the tips travel a few units,
  // which is what the drawings already do.
  shoulder: { start: { x: 62, y: 92 }, end: { x: 62, y: 92 } },
  torso: { length: 68.1, angleDeg: { start: 3.37, end: -8.44 } },
  neck: { length: 21.63, angleDeg: { start: -146, end: -146 } },
  limbs: {
    armL: { kind: 'fk', root: 'shoulder', length: 53.3, angleDeg: { start: 95, end: 96 } },
    armR: { kind: 'fk', root: 'shoulder', length: 58, angleDeg: { start: 88, end: 90 } },
    legL: { kind: 'fk', root: 'hip', length: 56.6, angleDeg: { start: 40, end: 42 } },
    legR: { kind: 'fk', root: 'hip', length: 65.1, angleDeg: { start: 41, end: 43 } },
  },
}

/**
 * Not a figure — a probe. Its IK tip sweeps straight across the −x axis, which is
 * where `atan2` flips sign, so the solved bone angle jumps ~358° between two
 * adjacent samples unless it is unwrapped. No real pose does this today, and a
 * guard nothing exercises is a guard that quietly stops working.
 */
const BRANCH_CUT: Rig = {
  shoulder: { start: { x: 100, y: 100 }, end: { x: 100, y: 100 } },
  torso: { length: 30, angleDeg: { start: 90, end: 90 } },
  neck: { length: 12, angleDeg: { start: -90, end: -90 } },
  limbs: {
    armL: {
      kind: 'ik',
      root: 'shoulder',
      upper: 40,
      lower: 40,
      bend: 1,
      target: { start: { x: 40, y: 60 }, end: { x: 40, y: 140 } },
    },
    armR: { kind: 'fk', root: 'shoulder', length: 20, angleDeg: { start: 0, end: 0 } },
    legL: { kind: 'fk', root: 'hip', length: 20, angleDeg: { start: 90, end: 90 } },
    legR: { kind: 'fk', root: 'hip', length: 20, angleDeg: { start: 90, end: 90 } },
  },
}

const RIGS: Readonly<Record<string, Rig>> = {
  push: PUSH,
  squat: SQUAT,
  hinge: HINGE,
  prone: PRONE,
  plank: PLANK,
}

const ALL_RUNGS = PATTERNS.flatMap((pattern) => LADDERS[pattern].rungs)

interface RigCase {
  readonly label: string
  readonly rig: Rig
  readonly timeline: MotionTimeline
}

/** Every (rig, timeline) pair the app will actually build. Labelled so a failure
 * names a rung rather than an index. */
const CASES: readonly RigCase[] = ALL_RUNGS.flatMap((rung) => {
  const rig = rung.figureId ? RIGS[rung.figureId] : undefined
  if (!rig) return []
  return [{ label: rung.id, rig, timeline: buildTimeline(rung.figureId, rung.modifier) }]
})

// The fixtures and the content have to actually meet, or every loop below runs
// zero times and the file is the third vacuous test this area has produced.
describe('the fixtures cover the content', () => {
  it('there is a rig for all 35 rungs', () => {
    expect(ALL_RUNGS).toHaveLength(35)
    expect(CASES).toHaveLength(35)
    expect(new Set(CASES.map((c) => c.rig)).size).toBe(5)
  })

  it('every rig declares exactly the four limbs `LIMB_IDS` iterates', () => {
    // A limb missing from `LIMB_IDS` would be silently skipped by every
    // assertion in this file rather than reported.
    expect(LIMB_IDS).toHaveLength(4)
    for (const [id, rig] of Object.entries(RIGS)) {
      expect(Object.keys(rig.limbs).sort(), id).toEqual([...LIMB_IDS].sort())
    }
  })
})

// ─── Forward kinematics ─────────────────────────────────────────────────────

describe('solveFk', () => {
  it('places the tip at exactly the declared length, at every angle', () => {
    const root = { x: 62, y: 82 }
    for (const angle of [-720, -181, -140, -0.5, 0, 37, 90, 179, 220, 361, 1080]) {
      const tip = solveFk(root, angle, 49.7)
      expect(distance(root, tip)).toBeCloseTo(49.7, 9)
      expect(angleBetween(root, tip)).toBeCloseTo(((((angle + 180) % 360) + 360) % 360) - 180, 6)
    }
  })

  it('a zero-length bone lands on its own root rather than nowhere', () => {
    expect(solveFk({ x: 10, y: 20 }, 45, 0)).toEqual({ x: 10, y: 20 })
  })

  it('never returns a non-finite coordinate, however bad the input', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      for (const tip of [
        solveFk({ x: bad, y: 0 }, 45, 50),
        solveFk({ x: 0, y: bad }, 45, 50),
        solveFk({ x: 0, y: 0 }, bad, 50),
        solveFk({ x: 0, y: 0 }, 45, bad),
      ]) {
        expect(Number.isFinite(tip.x)).toBe(true)
        expect(Number.isFinite(tip.y)).toBe(true)
      }
    }
  })
})

// ─── Two-bone inverse kinematics ────────────────────────────────────────────

describe('solveIk', () => {
  const root = { x: 62, y: 126 }
  const upper = 47.05
  const lower = 47.05

  it('hits a reachable target exactly, with both bones at their declared length', () => {
    const targets: readonly Joint[] = [
      { x: 58, y: 176 },
      { x: 62, y: 220 },
      { x: 120, y: 150 },
      { x: 20, y: 100 },
      { x: 62, y: 126 + upper + lower - 0.001 },
    ]
    for (const target of targets) {
      const solution = solveIk(root, target, upper, lower, 1)
      expect(solution.clamped, JSON.stringify(target)).toBe(false)
      expect(distance(solution.tip, target)).toBeLessThan(1e-9)
      expect(distance(root, solution.mid)).toBeCloseTo(upper, 9)
      expect(distance(solution.mid, solution.tip)).toBeCloseTo(lower, 9)
    }
  })

  it('draws straight toward a target beyond reach, and says it clamped', () => {
    const target = { x: 62, y: 400 }
    const solution = solveIk(root, target, upper, lower, 1)
    expect(solution.clamped).toBe(true)
    // Straight: both bones point the same way, and the tip is exactly the full
    // chain from the root along the line to the target.
    expect(solution.upperAngleDeg).toBeCloseTo(solution.lowerAngleDeg, 6)
    expect(distance(root, solution.tip)).toBeCloseTo(upper + lower, 9)
    expect(angleBetween(root, solution.tip)).toBeCloseTo(angleBetween(root, target), 6)
    // And still short of it — this is a limb at full extension, not a stretched one.
    expect(distance(solution.tip, target)).toBeGreaterThan(1)
  })

  it('clamps a target folded past the minimum instead of returning NaN', () => {
    // Unequal bones cannot fold below their difference.
    const solution = solveIk(root, { x: 63, y: 127 }, 40, 25, -1)
    expect(solution.clamped).toBe(true)
    expect(distance(root, solution.mid)).toBeCloseTo(40, 9)
    expect(distance(solution.mid, solution.tip)).toBeCloseTo(25, 9)
    expect(distance(root, solution.tip)).toBeCloseTo(15, 6)
  })

  it('folds equal bones flat onto the root when the target is the root', () => {
    const solution = solveIk(root, root, 30, 30, 1)
    expect(distance(root, solution.mid)).toBeCloseTo(30, 9)
    expect(distance(solution.mid, solution.tip)).toBeCloseTo(30, 9)
    expect(distance(root, solution.tip)).toBeCloseTo(0, 6)
  })

  it('puts the mid joint on the declared side, and keeps it there all the way through', () => {
    // The failure this prevents: a knee that snaps backwards mid-animation. A
    // per-frame "nearest solution" choice inverts as the chain passes through
    // straight; a declared sign cannot. Swept across the full range of chord
    // lengths the push-up arm sees, in both directions.
    for (const bend of [1, -1] as const) {
      const sides: number[] = []
      for (let step = 0; step <= 60; step += 1) {
        const target = { x: 58, y: root.y + 4 + (step / 60) * 90 }
        const solution = solveIk(root, target, upper, lower, bend)
        const chord = { x: target.x - root.x, y: target.y - root.y }
        const arm = { x: solution.mid.x - root.x, y: solution.mid.y - root.y }
        sides.push(Math.sign(chord.x * arm.y - chord.y * arm.x))
      }
      expect(sides).toHaveLength(61)
      // `bend: 1` rotates clockwise on screen, which with y-down is a positive
      // cross product. One sign, 61 times, no zero crossing in the middle.
      expect(new Set(sides)).toEqual(new Set([bend]))
    }
  })

  it('is finite for every degenerate input that can be constructed', () => {
    const degenerate: readonly [Joint, Joint, number, number][] = [
      [root, root, 0, 0],
      [root, root, 30, 30],
      [root, root, 30, 0],
      [root, root, 0, 30],
      [root, { x: 58, y: 176 }, 0, 0],
      [root, { x: 58, y: 176 }, 0, 50],
      [root, { x: 58, y: 176 }, 50, 0],
      [root, { x: 58, y: 176 }, -10, -10],
      [{ x: NaN, y: 0 }, { x: 0, y: NaN }, NaN, Infinity],
      [root, { x: Infinity, y: -Infinity }, 40, 40],
    ]
    for (const [from, target, a, b] of degenerate) {
      for (const bend of [1, -1] as const) {
        const solution = solveIk(from, target, a, b, bend)
        const label = JSON.stringify([from, target, a, b, bend])
        for (const value of [
          solution.mid.x,
          solution.mid.y,
          solution.tip.x,
          solution.tip.y,
          solution.upperAngleDeg,
          solution.lowerAngleDeg,
        ]) {
          expect(Number.isFinite(value), label).toBe(true)
        }
      }
    }
  })
})

// ─── The invariant the whole brief exists for ───────────────────────────────

function assertBoneLengths(pose: RigPose, label: string): void {
  const bones = boneEntries(pose)
  expect(bones.length, label).toBeGreaterThanOrEqual(6)
  for (const [id, bone] of bones) {
    const where = `${label} ${id}`
    // Two separate claims. The drawn segment is exactly as long as the bone says
    // it is, and the bone says something that is either its rest length or a
    // declared projection of it — never a third number.
    expect(distance(bone.from, bone.to), where).toBeCloseTo(bone.length, 6)
    expect(bone.length, where).toBeLessThanOrEqual(bone.restLength + LENGTH_EPSILON)
    expect(bone.length, where).toBeGreaterThanOrEqual(0)
  }
}

describe('a bone never changes length', () => {
  it('holds at every sampled stop of every rung', () => {
    let checked = 0
    for (const { label, rig, timeline } of CASES) {
      const samples = sampleTimeline(rig, timeline)
      expect(samples.length, label).toBeGreaterThan(4)
      for (const sample of samples) {
        assertBoneLengths(sample.pose, `${label}@${sample.percent.toFixed(2)}%`)
        checked += 1
      }
    }
    expect(checked).toBeGreaterThan(500)
  })

  it('holds between stops too — which is the point of rotating rather than tweening', () => {
    let checked = 0
    for (const { label, rig, timeline } of CASES) {
      const samples = sampleTimeline(rig, timeline)
      for (const [index, sample] of samples.entries()) {
        const next = samples[index + 1]
        if (!next) break
        for (const t of [0.25, 0.5, 0.75]) {
          assertBoneLengths(blendPoses(sample.pose, next.pose, t), `${label} blend ${t}`)
          checked += 1
        }
      }
    }
    expect(checked).toBeGreaterThan(1000)
  })

  it('holds at every position, not only the ones the sampler happens to pick', () => {
    for (const [id, rig] of Object.entries(RIGS)) {
      for (const position of spread(64, 7)) {
        assertBoneLengths(resolvePose(rig, position), `${id}@${position.toFixed(4)}`)
      }
    }
  })

  it('the epsilon is tight enough to catch the bug it was written for', () => {
    // Sanity check on the assertion above, so it cannot pass by being loose.
    // Interpolating *coordinates* between two correct poses is what the old
    // crossfade effectively promised and what a naive morph would do: at the
    // midpoint of `prone`'s 150° arm sweep the chord is ~26% of the radius, and
    // the arm nearly vanishes. `blendPoses` must not reproduce that, and a test
    // that could not tell the difference would be worthless.
    const start = resolvePhasePose(PRONE, 'start')
    const end = resolvePhasePose(PRONE, 'end')
    const naive = distance(
      { x: (start.shoulder.x + end.shoulder.x) / 2, y: (start.shoulder.y + end.shoulder.y) / 2 },
      {
        x: (start.limbs.armL.tip.x + end.limbs.armL.tip.x) / 2,
        y: (start.limbs.armL.tip.y + end.limbs.armL.tip.y) / 2,
      },
    )
    expect(naive / 49.7).toBeLessThan(0.35)
    const rigged = blendPoses(start, end, 0.5)
    expect(distance(rigged.shoulder, rigged.limbs.armL.tip)).toBeCloseTo(49.7, 6)
  })
})

// ─── Planted joints stay planted ────────────────────────────────────────────

describe('a planted joint does not skate', () => {
  it('is exactly on its target at every emitted stop', () => {
    let checked = 0
    for (const { label, rig, timeline } of CASES) {
      for (const sample of sampleTimeline(rig, timeline)) {
        for (const id of LIMB_IDS) {
          const limb = rig.limbs[id]
          if (!isPlantedLimb(limb)) continue
          const resolved = sample.pose.limbs[id]
          expect(resolved.clamped, `${label} ${id}`).toBe(false)
          expect(distance(resolved.tip, limb.target.start), `${label} ${id}`).toBeLessThan(1e-6)
          checked += 1
        }
      }
    }
    // push (4 planted limbs), squat (2) and hinge (2) all have some.
    expect(checked).toBeGreaterThan(400)
  })

  it('drifts under half a stroke width between stops, on every rung', () => {
    let worst = 0
    let worstLabel = ''
    for (const { label, rig, timeline } of CASES) {
      const drift = worstTipDrift(rig, timeline)
      if (drift > worst) {
        worst = drift
        worstLabel = label
      }
    }
    expect(worstLabel).not.toBe('')
    expect(worst, `worst at ${worstLabel}`).toBeLessThan(DRIFT_BUDGET)
  })

  it('the budget is met by resolution, not by luck — coarser sampling breaks it', () => {
    // If this ever stops failing at 2 samples, the drift assertion above has
    // become vacuous and `SAMPLES_PER_MOVING_SEGMENT` is no longer doing
    // anything. `push` is the harsh case: a 94-unit chain over a planted hand.
    const timeline = buildTimeline('push', { eccentricSeconds: 3 })
    const coarse = worstTipDrift(PUSH, timeline, 2)
    const chosen = worstTipDrift(PUSH, timeline, SAMPLES_PER_MOVING_SEGMENT)
    expect(coarse).toBeGreaterThan(DRIFT_BUDGET)
    expect(chosen).toBeLessThan(DRIFT_BUDGET)
    // And the knob is monotone, so raising it is the right lever when a
    // re-authored pose blows the budget.
    expect(worstTipDrift(PUSH, timeline, 4)).toBeGreaterThan(chosen)
  })
})

// ─── Sampling ───────────────────────────────────────────────────────────────

describe('sampleTimeline', () => {
  const timeline = buildTimeline('push', { eccentricSeconds: 3, pauseSeconds: 2, pauseAt: 'bottom' })

  it('spans 0% to 100% and never goes backwards', () => {
    const samples = sampleTimeline(PUSH, timeline)
    expect(samples[0]?.percent).toBe(0)
    expect(samples.at(-1)?.percent).toBeCloseTo(100, 6)
    for (const [index, sample] of samples.entries()) {
      const next = samples[index + 1]
      if (!next) break
      expect(next.percent).toBeGreaterThanOrEqual(sample.percent)
    }
  })

  it('gives a hold exactly two stops, so it reads as a stop rather than a slowdown', () => {
    // `buildTimeline`'s hold is what separates push-05 from push-06. Subdividing
    // it would emit identical stops; smearing it across a uniform grid would
    // blunt its edges, which is the one cue the paused rungs have left.
    const samples = sampleTimeline(PUSH, timeline)
    const still = samples.filter((sample) => sample.position === 1)
    expect(still).toHaveLength(2)
    const holdMs = timeline.segments.find((segment) => segment.phase === 'hold')?.durationMs ?? 0
    expect(holdMs).toBeGreaterThan(0)
    expect(still[1]!.percent - still[0]!.percent).toBeCloseTo((holdMs / timeline.totalMs) * 100, 4)
  })

  it('closes the loop: the last stop is the first pose, angle for angle', () => {
    // 100% must equal 0% *as numbers*, not merely as directions. An angle that
    // came back 360° short would spin the bone a full extra turn per loop.
    for (const [id, rig] of Object.entries(RIGS)) {
      for (const modifier of [undefined, { eccentricSeconds: 3 }, { pauseSeconds: 2 }]) {
        const samples = sampleTimeline(rig, buildTimeline(id, modifier))
        const first = boneEntries(samples[0]!.pose)
        const last = boneEntries(samples.at(-1)!.pose)
        expect(last).toHaveLength(first.length)
        for (const [index, [boneId, bone]] of first.entries()) {
          expect(last[index]![0]).toBe(boneId)
          expect(last[index]![1].angleDeg, `${id} ${boneId}`).toBeCloseTo(bone.angleDeg, 9)
        }
      }
    }
  })

  it('keeps consecutive angles within half a turn, so no bone takes the long way round', () => {
    for (const { label, rig, timeline: clock } of CASES) {
      const samples = sampleTimeline(rig, clock)
      for (const [index, sample] of samples.entries()) {
        const next = samples[index + 1]
        if (!next) break
        const before = boneEntries(sample.pose)
        const after = boneEntries(next.pose)
        for (const [boneIndex, [boneId, bone]] of before.entries()) {
          expect(Math.abs(after[boneIndex]![1].angleDeg - bone.angleDeg), `${label} ${boneId}`)
            .toBeLessThan(180)
        }
      }
    }
  })

  it('unwraps across the atan2 branch cut, where a bone would otherwise spin a whole turn', () => {
    // None of the five figures crosses the −x axis, so without this the
    // unwrapping in `sampleTimeline` would be untested speculation. `BRANCH_CUT`
    // is a synthetic rig whose IK tip sweeps straight through it.
    const samples = sampleTimeline(BRANCH_CUT, timeline)
    const angleAt = (pose: RigPose) => pose.limbs.armL.bones[0]!.angleDeg

    // The raw solution really does flip sign — assert that first, or the check
    // below passes on a rig that never needed unwrapping.
    const raw = samples.map((sample) => angleAt(resolvePose(BRANCH_CUT, sample.position)))
    const rawJump = Math.max(...raw.map((a, i) => (i === 0 ? 0 : Math.abs(a - raw[i - 1]!))))
    expect(rawJump).toBeGreaterThan(180)

    const emitted = samples.map((sample) => angleAt(sample.pose))
    for (const [index, angle] of emitted.entries()) {
      if (index === 0) continue
      expect(Math.abs(angle - emitted[index - 1]!)).toBeLessThan(180)
    }

    // Unwrapping adds multiples of 360, so it renames the angle without moving
    // the bone — and the blend across the crossing now follows the short way.
    for (const [index, sample] of samples.entries()) {
      const next = samples[index + 1]
      if (!next) break
      expect(sample.pose.limbs.armL.tip).toEqual(
        resolvePose(BRANCH_CUT, sample.position).limbs.armL.tip,
      )
      const drawn = blendPoses(sample.pose, next.pose, 0.5)
      const truth = resolvePose(BRANCH_CUT, (sample.position + next.position) / 2)
      expect(distance(drawn.limbs.armL.tip, truth.limbs.armL.tip)).toBeLessThan(DRIFT_BUDGET)
    }
  })

  it('a rig sampled at a coarser resolution still starts and ends where it should', () => {
    for (const count of [1, 2, 3, 40]) {
      const samples = sampleTimeline(HINGE, timeline, count)
      expect(samples.length).toBeGreaterThanOrEqual(3)
      expect(samples[0]?.position).toBe(0)
      expect(samples.at(-1)?.position).toBe(0)
    }
  })

  it('survives a nonsense resolution rather than emitting an empty stylesheet', () => {
    for (const count of [0, -5, NaN, Infinity, 0.4]) {
      const samples = sampleTimeline(PUSH, timeline, count)
      expect(samples.length).toBeGreaterThanOrEqual(timeline.segments.length + 1)
    }
  })
})

// ─── Nothing anywhere is NaN ────────────────────────────────────────────────

describe('no pose contains a non-finite number', () => {
  function assertFinite(pose: RigPose, label: string): void {
    const points: readonly Joint[] = [
      pose.shoulder,
      pose.hip,
      pose.head,
      ...LIMB_IDS.flatMap((id) => {
        const limb = pose.limbs[id]
        return [limb.root, limb.tip, limb.mid ?? limb.tip, limb.target ?? limb.tip]
      }),
    ]
    for (const point of points) {
      expect(Number.isFinite(point.x), label).toBe(true)
      expect(Number.isFinite(point.y), label).toBe(true)
    }
    for (const [id, bone] of boneEntries(pose)) {
      expect(Number.isFinite(bone.angleDeg), `${label} ${id}`).toBe(true)
      expect(Number.isFinite(bone.length), `${label} ${id}`).toBe(true)
    }
  }

  it('holds for every rig at every sampled and blended position', () => {
    for (const { label, rig, timeline } of CASES) {
      const samples = sampleTimeline(rig, timeline)
      for (const [index, sample] of samples.entries()) {
        assertFinite(sample.pose, label)
        const next = samples[index + 1]
        if (next) assertFinite(blendPoses(sample.pose, next.pose, 0.5), `${label} blend`)
      }
    }
  })

  it('holds for a rig built entirely out of degenerate numbers', () => {
    // Not a rig anybody would write — the point is that a typo in one produces a
    // wrong drawing rather than a blank one. SVG drops a whole `<path>` whose
    // `d` contains NaN, so one bad divide costs a limb.
    const broken: Rig = {
      shoulder: { start: { x: NaN, y: 0 }, end: { x: 0, y: Infinity } },
      torso: { length: NaN, angleDeg: { start: NaN, end: Infinity } },
      neck: { length: -0, angleDeg: { start: 0, end: 0 }, foreshorten: { start: NaN, end: 9 } },
      limbs: {
        armL: { kind: 'fk', root: 'shoulder', length: -50, angleDeg: { start: NaN, end: NaN } },
        armR: {
          kind: 'fk',
          root: 'hip',
          length: 0,
          angleDeg: { start: 0, end: 0 },
          foreshorten: { start: -3, end: 4 },
        },
        legL: {
          kind: 'ik',
          root: 'hip',
          upper: NaN,
          lower: -Infinity,
          bend: 1,
          target: { start: { x: NaN, y: NaN }, end: { x: 0, y: 0 } },
        },
        legR: {
          kind: 'ik',
          root: 'shoulder',
          upper: 0,
          lower: 0,
          bend: -1,
          target: { start: { x: 0, y: 0 }, end: { x: Infinity, y: 0 } },
        },
      },
    }
    for (const sample of sampleTimeline(broken, buildTimeline('push', { pauseSeconds: 2 }))) {
      assertFinite(sample.pose, 'broken')
    }
    for (const position of [-1, 0, 0.5, 1, 2, NaN, Infinity]) {
      assertFinite(resolvePose(broken, position), `broken@${position}`)
    }
  })
})

// ─── Shape of the output wave 2 consumes ────────────────────────────────────

describe('boneEntries', () => {
  it('names a one-bone limb after the limb and splits a two-bone one', () => {
    const fk = boneEntries(resolvePhasePose(PRONE, 'start')).map(([id]) => id)
    expect(fk).toEqual(['neck', 'torso', 'armL', 'armR', 'legL', 'legR'])
    const ik = boneEntries(resolvePhasePose(PUSH, 'end')).map(([id]) => id)
    expect(ik).toEqual([
      'neck',
      'torso',
      'armL-upper',
      'armL-lower',
      'armR-upper',
      'armR-lower',
      'legL-upper',
      'legL-lower',
      'legR-upper',
      'legR-lower',
    ])
  })

  it('every id is usable as a CSS identifier fragment', () => {
    for (const rig of Object.values(RIGS)) {
      for (const [id] of boneEntries(resolvePhasePose(rig, 'end'))) {
        expect(id).toMatch(/^[A-Za-z][A-Za-z0-9-]*$/)
      }
    }
  })
})

describe('resolvePose', () => {
  it('the two authored phases are the ends of the axis', () => {
    for (const [id, rig] of Object.entries(RIGS)) {
      expect(resolvePose(rig, 0), id).toEqual(resolvePhasePose(rig, 'start'))
      expect(resolvePose(rig, 1), id).toEqual(resolvePhasePose(rig, 'end'))
    }
  })

  it('clamps a position outside the loop instead of extrapolating the pose', () => {
    // Extrapolating would push a limb past its declared range, which is the one
    // thing an authored angle pair is supposed to bound.
    expect(resolvePose(SQUAT, -2)).toEqual(resolvePose(SQUAT, 0))
    expect(resolvePose(SQUAT, 5)).toEqual(resolvePose(SQUAT, 1))
  })

  it('derives every joint from the one authored anchor', () => {
    // The reason there is a single anchor: nudge it and the whole body follows.
    // Two anchors would let the torso stretch between them again.
    const pose = resolvePhasePose(HINGE, 'end')
    expect(distance(pose.shoulder, pose.hip)).toBeCloseTo(66, 6)
    expect(distance(pose.shoulder, pose.head)).toBeCloseTo(20, 6)
    expect(pose.limbs.armL.root).toEqual(pose.shoulder)
    expect(pose.limbs.legL.root).toEqual(pose.hip)
  })

  it('applies a declared foreshorten and nothing else does', () => {
    // squat's arms are the one sanctioned projection case in the brief.
    const start = resolvePhasePose(SQUAT, 'start')
    const end = resolvePhasePose(SQUAT, 'end')
    expect(distance(start.shoulder, start.limbs.armL.tip)).toBeCloseTo(70.7, 6)
    expect(distance(end.shoulder, end.limbs.armL.tip)).toBeCloseTo(70.7 * 0.45, 6)
    // Interpolated alongside the angle, so the shortening is gradual.
    const mid = resolvePose(SQUAT, 0.5)
    expect(distance(mid.shoulder, mid.limbs.armL.tip)).toBeCloseTo(70.7 * 0.725, 6)
    // prone declares none, so its arm is its full length throughout.
    for (const position of spread(16, 11)) {
      const pose = resolvePose(PRONE, position)
      expect(distance(pose.shoulder, pose.limbs.armL.tip)).toBeCloseTo(49.7, 6)
    }
  })

  it('refuses a foreshorten above 1, because lengthening a bone is the bug', () => {
    // Not policed by the type — it is a number — so it is policed here. A rig
    // that declared 1.6 and was honoured would still pass the length test, since
    // that test compares against `length × foreshorten`.
    const stretched: Rig = {
      ...PRONE,
      torso: { length: 60, angleDeg: { start: 0, end: 0 }, foreshorten: { start: 1.6, end: -0.4 } },
    }
    const start = resolvePhasePose(stretched, 'start')
    expect(start.torso.length).toBe(60)
    expect(distance(start.shoulder, start.hip)).toBeCloseTo(60, 6)
    const end = resolvePhasePose(stretched, 'end')
    expect(end.torso.length).toBe(0)
    expect(end.hip).toEqual(end.shoulder)
  })
})

// ─── Silhouette: two 6px strokes touching is an unreadable blob ─────────────

describe('no hand or foot crowds the torso', () => {
  it('stays 12 units clear at every position of every rung', () => {
    // A regression guard rather than a fix — the existing drawings already pass —
    // and the assertion that catches a sweep authored the wrong way round.
    // `prone`'s arm ends up pointing up-and-back; take that end angle the other
    // way and the hand passes straight over the torso at ~4 units, which is a
    // blob at 132px and reads as the arm having disappeared into the body.
    let worst = Infinity
    let worstLabel = ''
    for (const [figureId, rig] of Object.entries(RIGS)) {
      for (let step = 0; step <= 48; step += 1) {
        const pose = resolvePose(rig, step / 48)
        for (const id of LIMB_IDS) {
          const clearance = distanceToSegment(pose.limbs[id].tip, pose.shoulder, pose.hip)
          if (clearance < worst) {
            worst = clearance
            worstLabel = `${figureId} ${id}@${(step / 48).toFixed(2)}`
          }
        }
      }
    }
    expect(worstLabel).not.toBe('')
    expect(worst, `worst at ${worstLabel}`).toBeGreaterThan(12)
  })
})

