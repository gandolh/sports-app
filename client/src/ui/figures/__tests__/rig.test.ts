// Runs in the default `node` environment: `rig.ts` is pure geometry, and keeping
// it testable with no DOM is the reason it emits numbers rather than JSX.
//
// ─── About the rigs ─────────────────────────────────────────────────────────
//
// Every assertion below runs on the five rigs the app actually ships, imported
// from the figure files, across all 38 rungs' clocks. Wave 1 tested transcribed
// fixtures because the figure files did not exist yet; a geometry module tested
// on stand-ins proves nothing about the geometry the app draws — `push`'s
// 94-unit arm chain folding over a planted hand is the case that sets the sample
// resolution, and no tidy synthetic case is as harsh. The one synthetic rig left
// is `BRANCH_CUT`, a probe for a code path no real pose reaches.
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
import type { Joint, Rig, RigBoneId } from '../types.ts'
import { HINGE_RIG as HINGE } from '../Hinge.tsx'
import { PLANK_RIG as PLANK } from '../Plank.tsx'
import { PRONE_RIG as PRONE } from '../Prone.tsx'
import { PUSH_RIG as PUSH } from '../Push.tsx'
import { SQUAT_RIG as SQUAT } from '../Squat.tsx'
import { figures } from '../index.ts'

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

// The rigs and the content have to actually meet, or every loop below runs
// zero times and the file is the third vacuous test this area has produced.
describe('the rigs cover the content', () => {
  it('there is a rig for all 38 rungs', () => {
    expect(ALL_RUNGS).toHaveLength(38)
    expect(CASES).toHaveLength(38)
    expect(new Set(CASES.map((c) => c.rig)).size).toBe(5)
  })

  it('tests the rigs the registry renders, not copies of them', () => {
    expect(Object.keys(RIGS).sort()).toEqual(Object.keys(figures).sort())
    for (const [id, rig] of Object.entries(RIGS)) expect(figures[id]?.rig, id).toBe(rig)
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

/** The length a rig *declares* for a bone — the canonical number, read from
 * the rig rather than from the solver's output, so the comparison below is
 * against the source and not against itself. */
function declaredLength(rig: Rig, id: RigBoneId): number {
  if (id === 'neck' || id === 'torso') return rig[id].length
  const [limbId, part] = id.split('-') as [keyof Rig['limbs'], 'upper' | 'lower' | undefined]
  const limb = rig.limbs[limbId]
  if (limb.kind === 'fk') return limb.length
  return part === 'lower' ? limb.lower : limb.upper
}

function assertBoneLengths(rig: Rig, pose: RigPose, label: string): void {
  const bones = boneEntries(pose)
  expect(bones.length, label).toBeGreaterThanOrEqual(6)
  for (const [id, bone] of bones) {
    const where = `${label} ${id}`
    // Two separate claims. The drawn segment is exactly as long as the bone says
    // it is, and the bone says exactly what the rig declares — absolutely, since
    // no figure may foreshorten.
    expect(distance(bone.from, bone.to), where).toBeCloseTo(bone.length, 6)
    expect(Math.abs(bone.length - declaredLength(rig, id)), where).toBeLessThan(LENGTH_EPSILON)
  }
}

describe('a bone never changes length', () => {
  it('holds at every sampled stop of every rung', () => {
    let checked = 0
    for (const { label, rig, timeline } of CASES) {
      const samples = sampleTimeline(rig, timeline)
      expect(samples.length, label).toBeGreaterThan(4)
      for (const sample of samples) {
        assertBoneLengths(rig, sample.pose, `${label}@${sample.percent.toFixed(2)}%`)
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
          assertBoneLengths(rig, blendPoses(sample.pose, next.pose, t), `${label} blend ${t}`)
          checked += 1
        }
      }
    }
    expect(checked).toBeGreaterThan(1000)
  })

  it('holds at every position, not only the ones the sampler happens to pick', () => {
    for (const [id, rig] of Object.entries(RIGS)) {
      for (const position of spread(64, 7)) {
        assertBoneLengths(rig, resolvePose(rig, position), `${id}@${position.toFixed(4)}`)
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
      neck: { length: -0, angleDeg: { start: 0, end: 0 } },
      limbs: {
        armL: { kind: 'fk', root: 'shoulder', length: -50, angleDeg: { start: NaN, end: NaN } },
        armR: { kind: 'fk', root: 'hip', length: 0, angleDeg: { start: 0, end: 0 } },
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

  it('no rig smuggles a foreshorten back in', () => {
    // The field is gone from the types, so this guards the one way it could
    // return unseen: a cast. With it, bone length would be "declared times a
    // factor" again, and a squat drawn front-on would pass every test here.
    for (const [id, rig] of Object.entries(RIGS)) {
      const parts: object[] = [rig.torso, rig.neck, ...Object.values(rig.limbs)]
      for (const part of parts) expect('foreshorten' in part, id).toBe(false)
    }
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


// ─── The movement arrow is an annotation, not a body part ───────────────────

describe('the movement arrow stays clear of the body', () => {
  /** Closest approach of two segments, found by walking one of them. The arrow
   * is short and the budget generous, so 64 steps is far finer than it needs. */
  function segmentGap(a: Joint, b: Joint, c: Joint, d: Joint): number {
    let gap = Infinity
    for (let step = 0; step <= 64; step += 1) {
      const t = step / 64
      gap = Math.min(gap, distanceToSegment({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, c, d))
    }
    return gap
  }

  it('by a stroke and a half, at every stop and between stops, on every rung', () => {
    // Before the rig, four of the five arrows were drawn straight through the
    // figure — push's across the back, hinge's up the thigh, prone's inside the
    // head, plank's on the legs — and a crossfade hid it at a glance. A body
    // moving under a fixed arrow does not. 12 centre-to-centre is two half
    // strokes plus a clear stroke's width of daylight.
    let checked = 0
    for (const { label, rig, timeline } of CASES) {
      const definition = Object.values(figures).find((figure) => figure.rig === rig)
      expect(definition, label).toBeDefined()
      const { x, y1, y2 } = definition!.arrow
      const samples = sampleTimeline(rig, timeline)
      for (const [index, sample] of samples.entries()) {
        const next = samples[index + 1]
        const poses = next ? [sample.pose, blendPoses(sample.pose, next.pose, 0.5)] : [sample.pose]
        for (const pose of poses) {
          for (const [id, bone] of boneEntries(pose)) {
            const gap = segmentGap({ x, y: y1 }, { x, y: y2 }, bone.from, bone.to)
            expect(gap, `${label} ${id}`).toBeGreaterThanOrEqual(12)
          }
          const headGap = distanceToSegment(pose.head, { x, y: y1 }, { x, y: y2 }) - 14
          expect(headGap, `${label} head`).toBeGreaterThanOrEqual(12)
          checked += 1
        }
      }
    }
    expect(checked).toBeGreaterThan(1000)
  })
})
