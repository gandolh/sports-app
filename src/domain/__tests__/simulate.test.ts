/**
 * Aggregate assertions over simulated runs.
 *
 * These are the tests that can catch what unit tests cannot: an engine that makes
 * every individual transition correctly and still parks the user somewhere absurd
 * after six months. Every number below was **measured**, not chosen, and where a
 * measurement contradicts an expectation the test asserts the measurement and says
 * so in a comment. Adjusting a simulation until it agrees with a hoped-for number
 * is the one thing a harness must never be used for.
 *
 * ── Re-measured for v2: no effort input, 7-day cycle, mid-ladder starts ──────
 *
 * The harness lost its effort model, so every number here was taken again. Five
 * findings, in order of how much they matter:
 *
 *   1. **Descending calibration works, and it is path-independent.** A user
 *      planted at the *top rung of every ladder* converges to exactly the same
 *      steady band as the identical user starting from a fresh mid-ladder
 *      document — on every pattern and every seed. Descent is monotone and costs
 *      exactly 3 missed sessions per rung. `describe('descending calibration')`.
 *   2. **The engine never advances anyone onto a movement they cannot perform.**
 *      `advancesAboveCapability` is 0 and
 *      `sessionsAboveCapabilityAfterCalibration` is 0 across 9600 simulated
 *      sessions. The raw `sessionsAboveCapability` is 144, every one of them a
 *      calibration session for a user weaker than the starting rung — which is
 *      the design, not a defect.
 *   3. **A static-capability user no longer settles; it oscillates over exactly
 *      two adjacent rungs.** That is the price of deleting the "completed but
 *      rated hard → hold" row, which was the engine's only interior fixed point.
 *      The band is 2 rungs wide, identical across all 8 seeds, and 0–37.5% of
 *      tail sessions are missed. Measured, not asserted away.
 *   4. **Every rung now costs its full climb.** 9 completed sessions per rep
 *      rung, 7 per time rung, with no shortcut. Under the fast-track a capable
 *      user climbed a rung per session; that shortcut is gone along with the
 *      input it read.
 *   5. **The time-ladder over-advance did NOT improve.** 633 beyond-capability
 *      sessions per 2400, against 605 before. See `describe('the time-ladder
 *      over-advance')` for the number and the mechanism — the effort signal was
 *      never the cause, the *hold* it enabled was the only cure, and that hold
 *      was deliberately deleted.
 */
import { LADDERS, topRungIndex } from '../ladders.ts'
import { PATTERNS } from '../types.ts'
import type { Pattern } from '../types.ts'
import { deriveLadderStates, isLadderMaxed } from '../engine.ts'
import type { CapabilitySpec, SimRun } from './simulate.ts'
import {
  docAtRungs,
  firstSessionAtOrBelowRung,
  firstSessionAtRung,
  lcg,
  metricsFor,
  observationsFor,
  rungTrajectory,
  simulate,
  simulatedTimestamp,
  trueCapabilityRung,
  uniformUser,
  userWith,
} from './simulate.ts'

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8] as const

/**
 * A returning beginner who keeps getting stronger. Chosen because it produces no
 * deloads at all, which is what lets the strict monotonicity assertions below say
 * something about the engine rather than about the capability curve.
 */
const growingReps: CapabilitySpec = {
  base: 30,
  decay: 0.9,
  growth: 0.006,
  plateauAfter: 400,
  noise: 0.03,
}
const growingSecs: CapabilitySpec = { ...growingReps, base: 90 }
const growingUser = userWith(growingReps, { core: growingSecs, pull: growingSecs })

/** Someone strong from day one whose capability never changes. */
const staticStrongReps: CapabilitySpec = {
  base: 44,
  decay: 0.78,
  growth: 0,
  plateauAfter: 0,
  noise: 0.05,
}
const staticStrongSecs: CapabilitySpec = { ...staticStrongReps, base: 132, decay: 0.72 }
const staticStrongUser = userWith(staticStrongReps, {
  core: staticStrongSecs,
  pull: staticStrongSecs,
})

/**
 * The hold that improves for 20 sessions and then stops dead — the curve open
 * question 1 was measured on, carried over verbatim so the v1 and v2 figures are
 * comparable. Under v1 this user also *reported* effort abruptly; there is no
 * effort to report any more, so what is left is the capability curve alone.
 */
const abruptSecs: CapabilitySpec = {
  base: 40,
  decay: 0.7,
  growth: 0.02,
  plateauAfter: 20,
  noise: 0.06,
}

/** The same curve shape rendered in reps, for the rep-vs-time comparison. */
const abruptReps: CapabilitySpec = { ...abruptSecs, base: (40 * 12) / 45 }

/** The rungs the last quarter of a run visited, sorted. */
function tailBand(run: SimRun, pattern: Pattern): readonly number[] {
  const observations = observationsFor(run, pattern)
  const tail = observations.slice(-Math.max(1, Math.floor(observations.length / 4)))
  return [...new Set(tail.map((o) => o.rungIndex))].sort((a, b) => a - b)
}

// ─── The harness itself ─────────────────────────────────────────────────────

describe('the harness is deterministic', () => {
  it('produces the same sequence from the same seed and a different one otherwise', () => {
    const a = Array.from({ length: 5 }, lcg(42))
    const b = Array.from({ length: 5 }, lcg(42))
    const c = Array.from({ length: 5 }, lcg(43))
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
    expect(a.every((n) => n >= 0 && n < 1)).toBe(true)
  })

  it('replays a whole run identically', () => {
    const options = { sessions: 120, seed: 9, user: growingUser }
    expect(simulate(options).final).toEqual(simulate(options).final)
  })

  it('synthesises strictly increasing, well-formed timestamps without a clock', () => {
    const stamps = [0, 1, 59, 60, 3600, 86399].map(simulatedTimestamp)
    expect(stamps[0]).toBe('2026-01-01T00:00:00.000Z')
    expect(stamps[3]).toBe('2026-01-01T00:01:00.000Z')
    expect(stamps[4]).toBe('2026-01-01T01:00:00.000Z')
    for (let i = 1; i < stamps.length; i += 1) expect(stamps[i]! > stamps[i - 1]!).toBe(true)
    expect(() => simulatedTimestamp(86400)).toThrow(/out of range/)
  })

  it('starts from a document at the real starting rungs', () => {
    const run = simulate({ sessions: 1, seed: 1, user: growingUser })
    for (const pattern of PATTERNS) {
      expect(run.steps[0]!.before.ladders[pattern].rungIndex, pattern).toBe(
        LADDERS[pattern].startRungIndex,
      )
    }
  })
})

// ─── Invariants that must hold in every run ─────────────────────────────────

describe('invariants across every run', () => {
  const runs: SimRun[] = []
  // Deliberately includes the pathological users, not just the well-behaved one:
  // an invariant that only holds for a happy path is not an invariant.
  for (const seed of SEEDS) {
    runs.push({ ...simulate({ sessions: 300, seed, user: growingUser }) })
    runs.push({ ...simulate({ sessions: 300, seed, user: staticStrongUser }) })
    runs.push({
      ...simulate({
        sessions: 300,
        seed,
        user: userWith(staticStrongReps, { core: abruptSecs, pull: abruptSecs }),
      }),
    })
    runs.push({
      ...simulate({
        sessions: 300,
        seed,
        // Cannot complete the bottom target of anything. Exercises the floor
        // clamps AND descending calibration from a start rung that is too hard.
        user: uniformUser({ ...staticStrongReps, base: 3 }),
      }),
    })
  }

  it('covers a meaningful amount of simulated training', () => {
    const sessions = runs.reduce((n, run) => n + run.steps.length, 0)
    const deloads = runs.reduce(
      (n, run) => n + PATTERNS.reduce((k, p) => k + metricsFor(run, p).deloads, 0),
      0,
    )
    const advances = runs.reduce(
      (n, run) => n + PATTERNS.reduce((k, p) => k + metricsFor(run, p).advances, 0),
      0,
    )
    expect(runs).toHaveLength(32)
    expect(sessions).toBe(9600)
    // Pinned so the run set cannot quietly stop exercising the rules it is here
    // to cover: 806 rung advances and 686 deloads across the four user shapes.
    // Deloads are up 2.6× on v1's 268 — with no fast-track and no hold, the
    // deload is doing all the work the effort signal used to do.
    expect(advances).toBe(806)
    expect(deloads).toBe(686)
  })

  it('spends two sessions in seven on cardio, training nothing', () => {
    // 300 sessions is 42 full turns plus 6, so 85 cardio days per run.
    for (const run of runs) {
      const cardioSteps = run.steps.filter((step) => step.cardio)
      expect(cardioSteps).toHaveLength(85)
      for (const step of cardioSteps) {
        expect(step.result.exercises).toEqual([])
        expect(step.observations).toEqual([])
        expect(step.after.ladders).toEqual(step.before.ladders)
        expect(step.after.sessionsCompleted).toBe(step.before.sessionsCompleted + 1)
      }
    }
    const total = runs.reduce((n, run) => n + run.steps.filter((s) => s.cardio).length, 0)
    expect(total).toBe(2720)
  })

  it('never produces a rungIndex outside a ladder’s bounds', () => {
    for (const run of runs) {
      for (const step of run.steps) {
        for (const pattern of PATTERNS) {
          const state = step.after.ladders[pattern]
          expect(state.rungIndex).toBeGreaterThanOrEqual(0)
          expect(state.rungIndex).toBeLessThanOrEqual(topRungIndex(pattern))
        }
      }
    }
  })

  it('never produces a target outside a ladder’s range, or off-step', () => {
    for (const run of runs) {
      for (const pattern of PATTERNS) {
        const ladder = LADDERS[pattern]
        const step = ladder.unit === 'seconds' ? 5 : 1
        for (const simStep of run.steps) {
          const { target } = simStep.after.ladders[pattern]
          expect(target).toBeGreaterThanOrEqual(ladder.targetMin)
          expect(target).toBeLessThanOrEqual(ladder.targetMax)
          expect((target - ladder.targetMin) % step).toBe(0)
        }
      }
    }
  })

  it('never ADVANCES anyone onto a rung they could not perform at all', () => {
    // The "does not overshoot" property, stated as the thing the engine controls.
    // It holds because an advance requires completing `targetMax` at the rung
    // below, and `targetMax × decay > targetMin` for every plausible decay — so
    // the rung you are promoted onto is always one you can start.
    for (const run of runs) {
      for (const pattern of PATTERNS) {
        expect(metricsFor(run, pattern).advancesAboveCapability, pattern).toBe(0)
      }
    }
  })

  it('never over-prescribes once calibration has found the user', () => {
    for (const run of runs) {
      for (const pattern of PATTERNS) {
        expect(metricsFor(run, pattern).sessionsAboveCapabilityAfterCalibration, pattern).toBe(0)
      }
    }
  })

  it('over-prescribes ONLY while walking a too-weak user down, and only 144 times', () => {
    // The honest accounting of mid-ladder starts. Three of the four user shapes
    // never see a rung above their capability at all; the fourth cannot perform
    // the bottom of any ladder, so every session before it has been walked down
    // counts — 144 across 8 seeds, all of them calibration.
    const perShape = [0, 1, 2, 3].map((offset) => {
      let above = 0
      for (let i = offset; i < runs.length; i += 4) {
        for (const pattern of PATTERNS) above += metricsFor(runs[i]!, pattern).sessionsAboveCapability
      }
      return above
    })
    expect(perShape).toEqual([0, 0, 0, 144])
  })

  it('never lets the chart fall for a reason other than a real deload', () => {
    for (const run of runs) {
      for (const pattern of PATTERNS) {
        expect(metricsFor(run, pattern).unexplainedIndexDecreases).toBe(0)
      }
    }
  })

  it('advances cycle position and session count in lockstep, once per session', () => {
    // Including the cardio days, which advance both while changing nothing else.
    for (const run of runs) {
      run.steps.forEach((step, i) => {
        expect(step.after.sessionsCompleted).toBe(i + 1)
        expect(step.after.cyclePosition).toBe(i + 1)
        expect(step.after.history).toHaveLength(i + 1)
      })
    }
  })

  it('can be reconstructed from history by the repair tool', () => {
    // The strongest cross-check available: `applySession` walks forward from
    // `ladders`, `deriveLadderStates` replays the log, and after 300 sessions of
    // advances, deloads, clamps and cardio days they must still agree exactly. A
    // drift between them would mean the repair tool silently corrupts a state file.
    for (const run of runs) {
      expect(deriveLadderStates(run.final.history)).toEqual(run.final.ladders)
    }
  })

  it('holds at the top of a ladder rather than walking off the end', () => {
    // The strongest user tops out `push` and stays there with `ladderMaxed` set.
    const run = simulate({ sessions: 400, seed: 1, user: growingUser })
    const push = run.final.ladders.push
    expect(push.rungIndex).toBe(topRungIndex('push'))
    expect(isLadderMaxed('push', push)).toBe(true)
    expect(metricsFor(run, 'push').maxRungIndex).toBe(topRungIndex('push'))
  })
})

// ─── Climbing from the mid-ladder start ─────────────────────────────────────

describe('climbing from the new mid-ladder start', () => {
  const run = simulate({ sessions: 400, seed: 5, user: staticStrongUser })

  it('costs 9 sessions per rep rung and 7 per time rung, with no shortcut', () => {
    // THE COST OF DELETING THE FAST-TRACK, measured. Under wave-4 ruling 1 a
    // capable user climbed one rung per session and reached rung 5 in 6 sessions.
    // Now every rung costs its full climb: 7 target bumps plus two completed
    // sessions at the cap for reps, 5 plus two for seconds.
    const start = LADDERS.push.startRungIndex
    expect(firstSessionAtRung(run, 'push', start + 1)).toBe(10)
    expect(firstSessionAtRung(run, 'push', start + 2)).toBe(19)
    expect(firstSessionAtRung(run, 'push', start + 3)).toBe(28)
    expect(firstSessionAtRung(run, 'push', start + 4)).toBe(37)
    // Nine sessions apart, exactly, and the same on every rep ladder — it is a
    // property of the rule, not of push.
    expect(firstSessionAtRung(run, 'squat', LADDERS.squat.startRungIndex + 2)).toBe(19)
    expect(firstSessionAtRung(run, 'hinge', LADDERS.hinge.startRungIndex + 2)).toBe(19)
    // Time ladders: 7 apart.
    expect(firstSessionAtRung(run, 'core', LADDERS.core.startRungIndex + 1)).toBe(8)
    expect(firstSessionAtRung(run, 'core', LADDERS.core.startRungIndex + 2)).toBe(15)
    expect(firstSessionAtRung(run, 'core', LADDERS.core.startRungIndex + 3)).toBe(22)
    expect(firstSessionAtRung(run, 'pull', LADDERS.pull.startRungIndex + 2)).toBe(15)
  })

  it('starts a capable user 2 rungs up rather than making them earn those 18 sessions', () => {
    // What the mid-ladder start buys, in the currency the previous paragraph is
    // priced in: `push` starts at rung 2, so a capable user is spared the 18
    // sessions that climbing rungs 0 and 1 would have cost — about six weeks.
    expect(LADDERS.push.startRungIndex).toBe(2)
    expect(firstSessionAtRung(run, 'push', 2)).toBe(1)
  })

  it('does not run away up the ladder: it stops at the rung it can complete fully', () => {
    // This user could *start* the top rung of every ladder — but the engine only
    // promotes off a completed `targetMax`, so it settles where the whole rung is
    // within reach. Under-reaching by 2 rungs, and never over-reaching by any.
    expect(trueCapabilityRung(staticStrongReps, 'push', 0)).toBe(topRungIndex('push'))
    const metrics = metricsFor(run, 'push')
    expect(metrics.maxRungIndex).toBe(6)
    expect(metrics.sessionsAboveCapability).toBe(0)
    expect(tailBand(run, 'push')).toEqual([5, 6])
  })
})

// ─── Static capability: a bounded band, not a fixed point ───────────────────

describe('a static capability converges to a bounded band', () => {
  // The property most at risk from deleting the effort input, so it is checked on
  // every pattern and every seed. Static means static: no growth and no
  // day-to-day variation.
  const spec: CapabilitySpec = { ...staticStrongReps, noise: 0 }
  const secs: CapabilitySpec = { ...staticStrongSecs, noise: 0 }
  const user = userWith(spec, { core: secs, pull: secs })

  it('lands on the SAME two-rung band on every pattern and every seed', () => {
    // THE HEADLINE, AND THE HONEST COST OF v2. Under v1 this test asserted that
    // the ladder settled dead still and never revisited a rung, and it passed —
    // because "every rep done, rated hard" held the prescription forever. That
    // row is gone with the effort input, and a completed session now always either
    // bumps the target or counts toward an advance. So there is no interior fixed
    // point left, and a static user oscillates.
    //
    // What must still hold is that the oscillation is *tight and stable*: a band
    // exactly two rungs wide, in the same place on every seed.
    for (const seed of SEEDS) {
      const run = simulate({ sessions: 300, seed, user })
      expect(tailBand(run, 'push'), `push seed ${seed}`).toEqual([5, 6])
      expect(tailBand(run, 'squat'), `squat seed ${seed}`).toEqual([5, 6])
      expect(tailBand(run, 'core'), `core seed ${seed}`).toEqual([3, 4])
      expect(tailBand(run, 'pull'), `pull seed ${seed}`).toEqual([3, 4])
      // hinge's ladder is short enough that this user owns the top of it outright,
      // so it does settle dead still — a ladder that runs out is a real fixed point.
      expect(tailBand(run, 'hinge'), `hinge seed ${seed}`).toEqual([5])
    }
  })

  it('never widens the band beyond two rungs — it oscillates, it does not wander', () => {
    for (const seed of SEEDS) {
      const run = simulate({ sessions: 300, seed, user })
      for (const pattern of PATTERNS) {
        expect(metricsFor(run, pattern).tailBandWidth, `${pattern} seed ${seed}`).toBeLessThanOrEqual(
          2,
        )
      }
    }
  })

  it('costs at most 37.5% of tail sessions to hold the band', () => {
    // The price of the oscillation, stated as a number rather than a shrug: the
    // failed sessions are the three misses that trigger each deload. `pull` is the
    // worst at 0.375 and `hinge` the best at 0 (it maxed its ladder).
    const fractions: number[] = []
    for (const seed of SEEDS) {
      const run = simulate({ sessions: 300, seed, user })
      for (const pattern of PATTERNS) fractions.push(metricsFor(run, pattern).tailMissedFraction)
    }
    expect(Math.min(...fractions)).toBe(0)
    expect(Math.max(...fractions)).toBeCloseTo(0.375, 5)
  })

  it('is bounded from above as well: never a rung it cannot perform', () => {
    for (const seed of SEEDS) {
      const run = simulate({ sessions: 300, seed, user })
      for (const pattern of PATTERNS) {
        const metrics = metricsFor(run, pattern)
        expect(metrics.sessionsAboveCapability, `${pattern} seed ${seed}`).toBe(0)
        expect(metrics.advancesAboveCapability, `${pattern} seed ${seed}`).toBe(0)
      }
    }
  })
})

// ─── Descending calibration ─────────────────────────────────────────────────

/**
 * **The property mid-ladder starts exist to justify, and it had never been tested.**
 *
 * With no effort input there is no fast-track, so the only calibration mechanism
 * left is the 3-miss regress rule. The claim is that starting a user too high is
 * therefore safe: they will be walked down to where they belong, automatically,
 * with no question asked and no quiz. These tests try hard to break that.
 */
describe('descending calibration', () => {
  /**
   * Someone who can just about manage 7 reps of the easiest push-up, planted 4–6
   * rungs above where they belong. No noise, so the walk down is exact and the
   * arithmetic is checkable by hand.
   */
  const weakReps: CapabilitySpec = { base: 7, decay: 0.78, growth: 0, plateauAfter: 0, noise: 0 }
  const weakSecs: CapabilitySpec = { base: 26, decay: 0.72, growth: 0, plateauAfter: 0, noise: 0 }
  const weakUser = userWith(weakReps, { core: weakSecs, pull: weakSecs })

  /** Planted 4–6 rungs above their true capability rung on every pattern. */
  const plantedTooHigh = docAtRungs({ push: 7, squat: 6, hinge: 5, core: 5, pull: 5 })

  /** How far above their true rung each pattern was planted. */
  const OVERSHOT: Readonly<Record<Pattern, number>> = {
    push: 6,
    squat: 5,
    hinge: 4,
    core: 5,
    pull: 5,
  }

  it('is genuinely adversarial: the plant is 4–6 rungs above true capability', () => {
    for (const pattern of PATTERNS) {
      const spec = pattern === 'core' || pattern === 'pull' ? weakSecs : weakReps
      const trueRung = trueCapabilityRung(spec, pattern, 0)
      const planted = plantedTooHigh.ladders[pattern].rungIndex
      expect(planted - trueRung, `${pattern} plant`).toBe(OVERSHOT[pattern])
      expect(planted - trueRung, `${pattern} must be 3+ rungs too high`).toBeGreaterThanOrEqual(3)
    }
  })

  it('walks down monotonically, never climbing back up on the way', () => {
    for (const seed of SEEDS) {
      const run = simulate({ sessions: 400, seed, user: weakUser, start: plantedTooHigh })
      for (const pattern of PATTERNS) {
        const trajectory = rungTrajectory(run, pattern)
        for (let i = 1; i < trajectory.length; i += 1) {
          expect(trajectory[i], `${pattern} seed ${seed} climbed back up`).toBeLessThan(
            trajectory[i - 1]!,
          )
        }
        // Not one advance in 400 sessions: there is nothing here they can complete
        // at a rung's cap, so the engine only ever gives ground.
        expect(metricsFor(run, pattern).advances, `${pattern} seed ${seed}`).toBe(0)
      }
    }
  })

  it('costs exactly 3 missed sessions per rung, and nothing more', () => {
    // The rule is "3 consecutive misses regress", and a user who cannot complete
    // anything misses every session, so the descent is 3 sessions per rung with no
    // slack. That is the number to quote when asked what a bad starting rung costs.
    const run = simulate({ sessions: 400, seed: 1, user: weakUser, start: plantedTooHigh })
    for (const pattern of PATTERNS) {
      const spec = pattern === 'core' || pattern === 'pull' ? weakSecs : weakReps
      const trueRung = trueCapabilityRung(spec, pattern, 0)
      const expectedSessions = OVERSHOT[pattern] * 3
      expect(metricsFor(run, pattern).sessionsAboveCapability, pattern).toBe(expectedSessions)
      expect(firstSessionAtOrBelowRung(run, pattern, trueRung), pattern).toBe(expectedSessions + 1)
    }
    // In plain numbers: 19 push sessions, 16 squat, 13 hinge, 16 core, 16 pull.
    expect(
      PATTERNS.map((p) => firstSessionAtOrBelowRung(run, p, 0)),
    ).toEqual([22, 19, 16, 16, 16])
  })

  it('then settles: one rung, and stays there for the rest of the run', () => {
    for (const seed of SEEDS) {
      const run = simulate({ sessions: 400, seed, user: weakUser, start: plantedTooHigh })
      for (const pattern of PATTERNS) {
        const metrics = metricsFor(run, pattern)
        // Bottom of the ladder, because this user cannot complete the *cap* of any
        // rung and the cap is what an advance requires.
        expect(tailBand(run, pattern), `${pattern} seed ${seed}`).toEqual([0])
        expect(metrics.finalRungIndex, `${pattern} seed ${seed}`).toBe(0)
        expect(metrics.minRungIndex, `${pattern} seed ${seed}`).toBe(0)
      }
    }
  })

  it('walks the TARGET down too, once there is no rung left to drop', () => {
    // At the floor the deload steps the target instead of the rung, so calibration
    // keeps working after the rung has bottomed out: this user ends up prescribed
    // roughly what they can actually do, flickering across the step they cannot.
    const run = simulate({ sessions: 400, seed: 1, user: weakUser, start: plantedTooHigh })
    for (const pattern of PATTERNS) {
      const spec = pattern === 'core' || pattern === 'pull' ? weakSecs : weakReps
      const step = LADDERS[pattern].unit === 'seconds' ? 5 : 1
      const tail = observationsFor(run, pattern).slice(-10)
      for (const o of tail) {
        expect(o.target, `${pattern} target ran away from capability`).toBeLessThanOrEqual(
          spec.base + step,
        )
      }
      // And it never sank below what they can do minus one step.
      const targets = tail.map((o) => o.target)
      expect(Math.min(...targets), pattern).toBeGreaterThanOrEqual(
        Math.min(spec.base - step, LADDERS[pattern].targetMin),
      )
    }
  })

  it('never over-prescribes after the descent finishes', () => {
    for (const seed of SEEDS) {
      const run = simulate({ sessions: 400, seed, user: weakUser, start: plantedTooHigh })
      for (const pattern of PATTERNS) {
        expect(
          metricsFor(run, pattern).sessionsAboveCapabilityAfterCalibration,
          `${pattern} seed ${seed}`,
        ).toBe(0)
      }
    }
  })

  /**
   * ── The strongest statement available ───────────────────────────────────
   *
   * Descending calibration is only trustworthy if it lands in the same place
   * ascending calibration does. So: take one capability curve, run it twice —
   * once from a fresh mid-ladder document, once from a document planted at the
   * **top rung of every ladder** — and compare where the two end up.
   */
  describe('is path-independent', () => {
    const spec: CapabilitySpec = { ...staticStrongReps, noise: 0 }
    const secs: CapabilitySpec = { ...staticStrongSecs, noise: 0 }
    const user = userWith(spec, { core: secs, pull: secs })
    const atTheTop = docAtRungs(
      Object.fromEntries(PATTERNS.map((p) => [p, topRungIndex(p)])) as Record<Pattern, number>,
    )

    it('reaches the same steady band from the top of the ladder as from a fresh start', () => {
      for (const seed of [1, 3, 5, 8]) {
        const fresh = simulate({ sessions: 600, seed, user })
        const planted = simulate({ sessions: 600, seed, user, start: atTheTop })
        for (const pattern of PATTERNS) {
          expect(tailBand(planted, pattern), `${pattern} seed ${seed}`).toEqual(
            tailBand(fresh, pattern),
          )
        }
      }
      // And the band is the measured one, so this is not two runs agreeing on
      // something wrong.
      const fresh = simulate({ sessions: 600, seed: 1, user })
      expect(PATTERNS.map((p) => tailBand(fresh, p))).toEqual([[5, 6], [5, 6], [5], [3, 4], [3, 4]])
    })

    it('gets there in 6–9 sessions of the pattern', () => {
      // Cheap, because the plant is only 2–3 rungs above the band and each rung
      // costs 3 missed sessions. Six weeks of training at worst, with no question
      // asked of the user at any point.
      const planted = simulate({ sessions: 600, seed: 1, user, start: atTheTop })
      const fresh = simulate({ sessions: 600, seed: 1, user })
      const arrivals = PATTERNS.map((pattern) =>
        firstSessionAtOrBelowRung(planted, pattern, Math.max(...tailBand(fresh, pattern))),
      )
      expect(arrivals).toEqual([9, 7, 1, 6, 6])
    })

    it('does not put them on a movement they cannot perform while descending', () => {
      // This user *can* start every rung, including the top ones, so a plant at
      // the top is aggressive but not unsafe. It is the target, not the movement,
      // that they cannot manage — and three sessions later the engine knows.
      const planted = simulate({ sessions: 600, seed: 1, user, start: atTheTop })
      for (const pattern of PATTERNS) {
        const metrics = metricsFor(planted, pattern)
        expect(metrics.sessionsAboveCapability, pattern).toBe(0)
        expect(metrics.advancesAboveCapability, pattern).toBe(0)
      }
    })
  })
})

// ─── The chart is honest ────────────────────────────────────────────────────

describe('the chart is honest', () => {
  it('is non-decreasing for every pattern of a user who only gets stronger', () => {
    for (const seed of SEEDS) {
      const run = simulate({ sessions: 400, seed, user: growingUser })
      for (const pattern of PATTERNS) {
        const metrics = metricsFor(run, pattern)
        expect(metrics.regressions, `${pattern} seed ${seed}`).toBe(0)
        expect(metrics.stateIndexNonDecreasing, `${pattern} seed ${seed}`).toBe(true)
        expect(metrics.performedIndexNonDecreasing, `${pattern} seed ${seed}`).toBe(true)
      }
    }
  })

  it('rises across every rung advance, where a raw-value chart always falls', () => {
    const run = simulate({ sessions: 400, seed: 2, user: growingUser })
    let advances = 0
    let rawTargetFell = 0
    for (const pattern of PATTERNS) {
      const observations = observationsFor(run, pattern)
      observations.forEach((o, i) => {
        const previous = observations[i - 1]
        if (!previous || o.rungIndex === previous.rungIndex) return
        advances += 1
        expect(o.progressIndex).toBeGreaterThan(previous.progressIndex)
        expect(o.target).toBeLessThan(previous.target)
        rawTargetFell += 1
      })
    }
    // Sharper than under v1, where the fast-track could advance from a sub-max
    // target and most advances left the raw target flat. Every advance now happens
    // off `targetMax` and resets to `targetMin`, so a raw-value chart shows a
    // collapse at EVERY single milestone — 24 of 24 here.
    expect(advances).toBe(24)
    expect(rawTargetFell).toBe(24)
  })

  it('falls on a rep-ladder deload by 6 or 7 steps, and only on a deload', () => {
    const drops: number[] = []
    for (const seed of SEEDS) {
      const run = simulate({ sessions: 400, seed, user: staticStrongUser })
      for (const pattern of ['push', 'squat', 'hinge'] as const) {
        const observations = observationsFor(run, pattern)
        observations.forEach((o, i) => {
          const previous = observations[i - 1]
          if (previous && o.progressIndexAfter < previous.progressIndexAfter) {
            drops.push(previous.progressIndexAfter - o.progressIndexAfter)
            expect(o.deloaded).toBe(true)
          }
        })
      }
    }
    // 6 or 7, never 2: without the fast-track a user only ever fails near the TOP
    // of a rung, having climbed there one step at a time, so the drop to the cap of
    // the rung below is always most of a rung's width. v1 measured [2, 8] because
    // the fast-track could also drop them straight after an advance.
    expect(drops).toHaveLength(109)
    expect([...new Set(drops)].sort((a, b) => a - b)).toEqual([6, 7])
  })

  it('re-climbs in two sessions after a deload', () => {
    // The deload lands on the top of the rung below, which the user has already
    // completed, so two completed sessions there put them straight back — the
    // minimum an advance can cost now that the fast-track is gone.
    const run = simulate({ sessions: 400, seed: 5, user: staticStrongUser })
    const observations = observationsFor(run, 'push')
    const firstDeload = observations.findIndex((o) => o.deloaded)
    expect(firstDeload).toBeGreaterThan(0)
    const after = observations[firstDeload]!
    expect(after.targetAfter).toBe(LADDERS.push.targetMax)
    expect(after.rungIndexAfter).toBe(after.rungIndex - 1)
    // Two completed sessions at that cap and they are back.
    expect(observations[firstDeload + 1]?.target).toBe(LADDERS.push.targetMax)
    expect(observations[firstDeload + 2]?.rungIndexAfter).toBe(after.rungIndex)
  })

  it('deloads at the bottom of a ladder by one step, since the rung cannot drop', () => {
    // Still live: the index falls with NO rung change, so a chart annotation keyed
    // on "rungIndex changed" misses it entirely. Brief 09 must key its deload
    // marker on the target as well as the rung.
    const floorDeloads: { drop: number; rung: number }[] = []
    for (const seed of SEEDS) {
      const run = simulate({
        sessions: 300,
        seed,
        user: userWith(staticStrongReps, { core: abruptSecs, pull: abruptSecs }),
      })
      for (const pattern of PATTERNS) {
        const observations = observationsFor(run, pattern)
        observations.forEach((o, i) => {
          const previous = observations[i - 1]
          if (o.deloaded && o.rungIndexAfter === o.rungIndex && previous) {
            floorDeloads.push({
              drop: previous.progressIndexAfter - o.progressIndexAfter,
              rung: o.rungIndex,
            })
          }
        })
      }
    }
    expect(floorDeloads).toHaveLength(10)
    for (const { drop, rung } of floorDeloads) {
      expect(rung).toBe(0)
      expect(drop).toBe(1)
    }
  })
})

// ─── Open question 1, re-measured and answered ──────────────────────────────

/**
 * Does removing the effort input fix the time-ladder over-advance?
 *
 * **No. It is essentially unchanged, and slightly worse in absolute terms.**
 * Same capability curve as the v1 measurement — abrupt plateau, 40s at rung 0
 * growing 2%/session for 20 sessions then flat, 0.7 decay per rung, eight seeds —
 * and the same 2400 pattern-sessions per cell. The cycle now gives core+pull four
 * exercises per seven positions rather than three per three, so the run length is
 * 525 sessions per seed instead of 300 to keep the denominator comparable.
 *
 *   engine                                  advances  regressions  missed  beyond capability
 *   ── v1 ──
 *   fast-track on, deep deload                   161          153     583        457  (19.0%)
 *   fast-track off, deep deload                  153          142     547        413  (17.2%)
 *   ruling 2 + ruling 3 (v1 shipped)             225          213     783        605  (25.2%)
 *   same, driven by a signal with a warning band  97           82     749         16  ( 0.7%)
 *   ── v2, no effort input at all ──
 *   this engine                                  228          229     826        633  (26.4%)
 *
 * ANSWER, and it is worth being blunt about it: **the effort signal was never the
 * cause of the over-advance, so deleting it did not fix it.** The 0.7% row above
 * is what made it look like the lever, but what that row actually bought was the
 * *hold* — "every rep done, rated hard → repeat the same prescription" — which
 * stopped the climb one step before failure. v2 deletes that hold along with its
 * input, by decision, so the climb runs into the wall every time.
 *
 * Two things did change, and they are the reason this is an acceptable trade:
 *
 *   - **The over-prescription is now only ever a duration, never a movement.**
 *     `advancesAboveCapability` and `sessionsAboveCapabilityAfterCalibration` are
 *     both 0. The user is asked to hold a plank five seconds longer than they can,
 *     not to attempt a rung they have no business on, and three sessions later the
 *     engine backs off on its own.
 *   - **It is no longer a time-ladder pathology.** The same curve on the rep
 *     ladders gives 502 of 3600 (13.9%). Time ladders are still ~2× worse, but the
 *     residual gap is arithmetic — a 5-second step across a 20→45s range overshoots
 *     by proportionally more than a 1-rep step across 5→12 — and not a property of
 *     any signal. There is no signal left for it to be a property of.
 */
describe('the time-ladder over-advance, re-measured', () => {
  function aggregate(patterns: readonly Pattern[], user: ReturnType<typeof userWith>) {
    let advances = 0
    let regressions = 0
    let missed = 0
    let beyond = 0
    let sessions = 0
    for (const seed of SEEDS) {
      const run = simulate({ sessions: 525, seed, user })
      for (const pattern of patterns) {
        const metrics = metricsFor(run, pattern)
        advances += metrics.advances
        regressions += metrics.regressions
        missed += metrics.missed
        beyond += metrics.sessionsBeyondTarget
        sessions += metrics.sessions
      }
    }
    return { sessions, advances, regressions, missed, beyond }
  }

  const time = aggregate(
    ['core', 'pull'],
    userWith(staticStrongReps, { core: abruptSecs, pull: abruptSecs }),
  )
  const reps = aggregate(['push', 'squat', 'hinge'], userWith(abruptReps, {}))

  it('reproduces the measured table exactly', () => {
    // Pinned so a change to the engine, the ladders or the cycle shows up as a diff
    // in these numbers rather than as silent drift.
    expect(time).toEqual({
      sessions: 2400,
      advances: 228,
      regressions: 229,
      missed: 826,
      beyond: 633,
    })
    expect(reps).toEqual({
      sessions: 3600,
      advances: 294,
      regressions: 308,
      missed: 1091,
      beyond: 502,
    })
  })

  it('is not better than v1 — 605 → 633 of 2400', () => {
    // Stated as a failed expectation, because that is what it is. The brief for
    // this change expected the figure to improve substantially once the unreliable
    // signal was gone; it did not move.
    const V1_SHIPPED = 605
    expect(time.beyond).toBeGreaterThan(V1_SHIPPED)
    expect(time.beyond / time.sessions).toBeGreaterThan(0.25)
    expect(time.beyond / time.sessions).toBeLessThan(0.27)
  })

  it('still cycles two adjacent rungs instead of settling', () => {
    const run = simulate({
      sessions: 525,
      seed: 3,
      user: userWith(staticStrongReps, { core: abruptSecs, pull: abruptSecs }),
    })
    const trajectory = rungTrajectory(run, 'core')
    expect(trajectory.length).toBeGreaterThan(10)
    expect(new Set(trajectory).size).toBe(2)
    expect(tailBand(run, 'core')).toEqual([0, 1])
    expect(metricsFor(run, 'core').regressions).toBeGreaterThan(5)
  })

  it('over-prescribes a duration, never a movement — the part that DID improve', () => {
    for (const seed of SEEDS) {
      const run = simulate({
        sessions: 525,
        seed,
        user: userWith(staticStrongReps, { core: abruptSecs, pull: abruptSecs }),
      })
      for (const pattern of ['core', 'pull'] as const) {
        const metrics = metricsFor(run, pattern)
        expect(metrics.advancesAboveCapability, `${pattern} seed ${seed}`).toBe(0)
        expect(
          metrics.sessionsAboveCapabilityAfterCalibration,
          `${pattern} seed ${seed}`,
        ).toBe(0)
      }
    }
  })

  it('is no longer specific to time ladders, only worse on them', () => {
    // 26.4% vs 13.9% on the identical curve shape. A real gap, and an arithmetic
    // one: the 5-second step is coarser relative to its range than the 1-rep step.
    const timeRate = time.beyond / time.sessions
    const repRate = reps.beyond / reps.sessions
    expect(repRate).toBeGreaterThan(0.13)
    expect(timeRate / repRate).toBeGreaterThan(1.5)
    expect(timeRate / repRate).toBeLessThan(2.5)
  })

  it('leaves a capable user’s rep ladders alone, as before', () => {
    const run = simulate({
      sessions: 525,
      seed: 3,
      user: userWith(staticStrongReps, { core: abruptSecs, pull: abruptSecs }),
    })
    expect(metricsFor(run, 'hinge').deloads).toBe(0)
    expect(metricsFor(run, 'core').deloads).toBeGreaterThan(5)
    expect(metricsFor(run, 'pull').deloads).toBeGreaterThan(5)
  })
})
