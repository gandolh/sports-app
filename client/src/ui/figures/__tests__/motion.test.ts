// Runs in the default `node` environment: the timeline is pure data derived from
// a `Modifier`, and keeping it testable with no DOM is the reason `motion.ts`
// emits CSS *text* rather than touching a stylesheet.
import { LADDERS } from '../../../domain/ladders.ts'
import { PATTERNS } from '@sports-app/shared/types.ts'
import type { Modifier } from '../../../domain/types.ts'
import {
  BASE_PHASE_SECONDS,
  MOTION_SCALE,
  buildTimeline,
  motionAnimationNames,
  motionStyles,
} from '../motion.ts'
import type { MotionTimeline } from '../motion.ts'

/** Real seconds a modifier prescribes, undoing the display compression. */
function realSeconds(ms: number): number {
  return ms / 1000 / MOTION_SCALE
}

function segment(timeline: MotionTimeline, phase: 'eccentric' | 'concentric' | 'hold') {
  return timeline.segments.filter((s) => s.phase === phase)
}

function totalFor(timeline: MotionTimeline, phase: 'eccentric' | 'concentric' | 'hold'): number {
  return segment(timeline, phase).reduce((sum, s) => sum + s.durationMs, 0)
}

// ─── The reason this module exists ──────────────────────────────────────────
//
// `push-05-full-3s-down` and `push-06-full-3s-down-2s-bottom-hold` are the same
// ladder, the same pose, the same drawing and the same overlay set. Before the
// clock existed, only the cue text could tell them apart. If these assertions
// ever pass vacuously — identical timelines — the figure system has silently
// stopped distinguishing adjacent rungs and the brief that added it is undone.

describe('the timeline is what distinguishes adjacent rungs', () => {
  const rung5: Modifier = { eccentricSeconds: 3 }
  const rung6: Modifier = { eccentricSeconds: 3, pauseSeconds: 2, pauseAt: 'bottom' }

  it('a 3s lowering and a 3s lowering + 2s bottom hold do not produce the same timeline', () => {
    const five = buildTimeline('push', rung5)
    const six = buildTimeline('push', rung6)
    expect(six.segments).not.toEqual(five.segments)
    expect(six.totalMs).not.toBe(five.totalMs)
    // And they must not merely differ — they must differ *as CSS*, or the DOM
    // ends up identical however different the data was.
    expect(motionStyles(six)).not.toBe(motionStyles(five))
    expect(motionAnimationNames(six).end).not.toBe(motionAnimationNames(five).end)
  })

  it('they differ by exactly the hold: same lowering, same lift, one extra still segment', () => {
    const five = buildTimeline('push', rung5)
    const six = buildTimeline('push', rung6)

    expect(totalFor(five, 'eccentric')).toBe(totalFor(six, 'eccentric'))
    expect(totalFor(five, 'concentric')).toBe(totalFor(six, 'concentric'))

    expect(segment(five, 'hold')).toHaveLength(0)
    expect(segment(six, 'hold')).toHaveLength(1)
    expect(six.totalMs - five.totalMs).toBe(totalFor(six, 'hold'))
  })

  it('the lowering takes 3s of prescription and the return stays at the base 1s', () => {
    const five = buildTimeline('push', rung5)
    expect(realSeconds(totalFor(five, 'eccentric'))).toBeCloseTo(3, 5)
    expect(realSeconds(totalFor(five, 'concentric'))).toBeCloseTo(BASE_PHASE_SECONDS, 5)
  })

  it('an unmodified rung is symmetric: one base phase out, one base phase back', () => {
    const plain = buildTimeline('push', undefined)
    expect(plain.segments).toHaveLength(2)
    expect(realSeconds(totalFor(plain, 'eccentric'))).toBeCloseTo(BASE_PHASE_SECONDS, 5)
    expect(realSeconds(totalFor(plain, 'concentric'))).toBeCloseTo(BASE_PHASE_SECONDS, 5)
  })

  it('compression preserves the ratios that carry the difference', () => {
    // The eccentric:concentric ratio is 3:1 whatever MOTION_SCALE is, which is
    // what makes compressing safe. A non-proportional speed-up would flatten it.
    const five = buildTimeline('push', rung5)
    expect(totalFor(five, 'eccentric') / totalFor(five, 'concentric')).toBeCloseTo(3, 5)
  })
})

// ─── Pauses are still, and still at the right pose ─────────────────────────

describe('a pause segment does not move, and holds the correct pose', () => {
  it('has zero displacement', () => {
    for (const pauseAt of ['bottom', 'top', 'mid'] as const) {
      for (const figureId of ['push', 'hinge', 'prone'] as const) {
        const timeline = buildTimeline(figureId, { pauseSeconds: 2, pauseAt })
        const holds = segment(timeline, 'hold')
        expect(holds).toHaveLength(1)
        for (const hold of holds) {
          expect(hold.to).toBe(hold.from)
          expect(hold.durationMs).toBe(Math.round(2000 * MOTION_SCALE))
        }
      }
    }
  })

  it("'bottom' holds the lowered pose and 'top' the other one — per pattern", () => {
    // push: `end` is the bottom of the push-up.
    expect(buildTimeline('push', { pauseSeconds: 2, pauseAt: 'bottom' }).holdAt).toBe(1)
    expect(buildTimeline('push', { pauseSeconds: 2, pauseAt: 'top' }).holdAt).toBe(0)
    // hinge: `end` is the TOP of the bridge, so the mapping inverts. This is the
    // assertion that would fail if `LOWERED_PHASE` were flattened to one value.
    expect(buildTimeline('hinge', { pauseSeconds: 2, pauseAt: 'top' }).holdAt).toBe(1)
    expect(buildTimeline('hinge', { pauseSeconds: 2, pauseAt: 'bottom' }).holdAt).toBe(0)
    // prone: `end` is arms overhead; `pull-05`'s "bottom of the pull" is the
    // drawn `start` (elbows down past the ribs).
    expect(buildTimeline('prone', { pauseSeconds: 2, pauseAt: 'bottom' }).holdAt).toBe(0)
  })

  it("'mid' holds halfway and splits the eccentric, not the return", () => {
    for (const figureId of ['push', 'hinge'] as const) {
      const timeline = buildTimeline(figureId, { eccentricSeconds: 3, pauseSeconds: 2, pauseAt: 'mid' })
      expect(timeline.holdAt).toBe(0.5)
      expect(segment(timeline, 'eccentric')).toHaveLength(2)
      expect(segment(timeline, 'concentric')).toHaveLength(1)
      expect(realSeconds(totalFor(timeline, 'eccentric'))).toBeCloseTo(3, 1)
    }
  })

  it('a pauseSeconds with no pauseAt still stops the figure, at the loaded end', () => {
    // Content always names a location, but dropping a prescribed hold from the
    // clock because one field is missing would be the worse failure.
    const timeline = buildTimeline('push', { pauseSeconds: 2 })
    expect(segment(timeline, 'hold')).toHaveLength(1)
    expect(timeline.holdAt).toBe(1)
  })
})

// ─── Direction: the highest-risk decision in the module ────────────────────

describe('the eccentric runs toward the lowered pose, which differs per pattern', () => {
  it('push and squat lower from the drawn start to the drawn end', () => {
    for (const figureId of ['push', 'squat'] as const) {
      const timeline = buildTimeline(figureId, { eccentricSeconds: 3 })
      expect(timeline.loweredPhase).toBe('end')
      const [eccentric] = segment(timeline, 'eccentric')
      expect(eccentric).toMatchObject({ from: 0, to: 1 })
    }
  })

  it('hinge, prone and plank lower from the drawn end back to the drawn start', () => {
    for (const figureId of ['hinge', 'prone', 'plank'] as const) {
      const timeline = buildTimeline(figureId, { eccentricSeconds: 5 })
      expect(timeline.loweredPhase).toBe('start')
      const [eccentric] = segment(timeline, 'eccentric')
      expect(eccentric).toMatchObject({ from: 1, to: 0 })
    }
  })

  it("hinge-06's five-second slide is the slow segment, not the return", () => {
    // The concrete failure this guards: a glute-bridge-family eccentric animated
    // start → end would render a 5-second *lift*, which the cue text explicitly
    // is not ("stretch the slide out to five full seconds… then let your hips
    // down"). Well-formed either way, so only this assertion catches it.
    const timeline = buildTimeline('hinge', { eccentricSeconds: 5 })
    const [eccentric] = segment(timeline, 'eccentric')
    const [concentric] = segment(timeline, 'concentric')
    expect(eccentric?.durationMs).toBeGreaterThan(concentric?.durationMs ?? 0)
    expect(eccentric?.from).toBe(1)
  })

  it('an unregistered figureId still yields a usable timeline', () => {
    // A content typo renders the placeholder, which never animates — but the
    // timeline is built before that is known, so it must not throw.
    const timeline = buildTimeline('not-a-pose', { eccentricSeconds: 3, pauseSeconds: 2, pauseAt: 'top' })
    expect(timeline.totalMs).toBeGreaterThan(0)
    expect(() => motionStyles(timeline)).not.toThrow()
  })
})

// ─── Every rung, and the shape of the output ───────────────────────────────

describe('all 35 rungs', () => {
  const allRungs = PATTERNS.flatMap((pattern) => LADDERS[pattern].rungs)

  it('there are 35 of them (push 8, squat 8, hinge 7, core 6, pull 6)', () => {
    expect(allRungs).toHaveLength(35)
  })

  for (const rung of allRungs) {
    it(`${rung.id} builds a well-formed timeline`, () => {
      const timeline = buildTimeline(rung.figureId, rung.modifier)
      expect(timeline.segments.length).toBeGreaterThanOrEqual(2)
      expect(timeline.totalMs).toBe(
        timeline.segments.reduce((sum, s) => sum + s.durationMs, 0),
      )
      // Contiguous and cyclic: every segment starts where the last one ended,
      // and the loop returns to its own first position. A gap would show as a
      // jump-cut in the middle of a rep.
      for (const [index, s] of timeline.segments.entries()) {
        expect(s.durationMs).toBeGreaterThan(0)
        expect(s.from).toBeGreaterThanOrEqual(0)
        expect(s.to).toBeLessThanOrEqual(1)
        if (index > 0) expect(s.from).toBe(timeline.segments[index - 1]?.to)
      }
      expect(timeline.segments.at(-1)?.to).toBe(timeline.segments[0]?.from)
      expect(() => motionStyles(timeline)).not.toThrow()
    })
  }

  it('rungs differing only in modifier get different timelines', () => {
    // Every pair the content actually relies on. Each pair shares a ladder, a
    // pose and a drawing; the clock is the only thing left to separate them.
    const pairs: readonly [string, string][] = [
      ['push-04-full', 'push-05-full-3s-down'],
      ['push-05-full-3s-down', 'push-06-full-3s-down-2s-bottom-hold'],
      ['squat-02-bodyweight', 'squat-03-3s-down'],
      ['squat-03-3s-down', 'squat-04-3s-down-2s-bottom-hold'],
      ['squat-05-heels-elevated', 'squat-06-split'],
      ['hinge-01-glute-bridge', 'hinge-02-glute-bridge-2s-top-hold'],
      ['hinge-05-sliding-leg-curl', 'hinge-06-sliding-curl-eccentric'],
      ['hinge-06-sliding-curl-eccentric', 'hinge-07-single-leg-slide'],
      ['pull-04-reverse-snow-angel', 'pull-05-prone-lat-slide'],
    ]

    for (const [aId, bId] of pairs) {
      const a = allRungs.find((rung) => rung.id === aId)
      const b = allRungs.find((rung) => rung.id === bId)
      expect(a, `no rung ${aId}`).toBeDefined()
      expect(b, `no rung ${bId}`).toBeDefined()
      const timelineA = buildTimeline(a?.figureId, a?.modifier)
      const timelineB = buildTimeline(b?.figureId, b?.modifier)
      expect(timelineA.segments, `${aId} vs ${bId}`).not.toEqual(timelineB.segments)
    }
  })

  it('unilateral and elevation alone never change the clock', () => {
    // They are leverage, not tempo. Two rungs differing only in leverage must
    // animate at the same speed or the figure contradicts the cue text.
    const plain = buildTimeline('squat', undefined)
    expect(buildTimeline('squat', { unilateral: true }).segments).toEqual(plain.segments)
    expect(buildTimeline('squat', { elevation: 'heels' }).segments).toEqual(plain.segments)
    expect(buildTimeline('squat', { unilateral: true, elevation: 'feet' }).segments).toEqual(
      plain.segments,
    )
  })

  it('the worst-case loop stays inside a glance', () => {
    // The reason MOTION_SCALE exists. push-06 / squat-05 are the longest clocks
    // in the content at 3s + 2s + 1s of prescription.
    const longest = Math.max(
      ...allRungs.map((rung) => buildTimeline(rung.figureId, rung.modifier).totalMs),
    )
    expect(longest).toBeLessThanOrEqual(4000)
  })
})

describe('generated CSS', () => {
  const timeline = buildTimeline('push', { eccentricSeconds: 3, pauseSeconds: 2, pauseAt: 'bottom' })
  const css = motionStyles(timeline)
  const names = motionAnimationNames(timeline)

  it('emits one @keyframes per frame, bound to the animation duration', () => {
    expect(css).toContain(`@keyframes ${names.end} {`)
    expect(css).toContain(`@keyframes ${names.start} {`)
    expect(css).toContain(`animation: ${names.end} ${timeline.totalMs}ms linear infinite`)
    expect(css).toContain(`animation: ${names.start} ${timeline.totalMs}ms linear infinite`)
  })

  it('carries a reduced-motion guard for environments with no matchMedia', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('animation: none')
  })

  it('is linear — any easing into the turnaround would fake a hold', () => {
    expect(css).not.toMatch(/ease|cubic-bezier/)
  })

  it('holds the same opacity across the pause, and the two frames are complements', () => {
    // 3s down + 2s hold + 1s up, scaled: the hold spans 3/6 → 5/6 of the loop.
    const stops = [...css.matchAll(/([\d.]+)% \{ opacity: ([\d.]+); \}/g)].map(([, at, opacity]) => ({
      at: Number(at),
      opacity: Number(opacity),
    }))
    // The `end` frame's keyframes come first; it must reach 1 and stay there.
    const endStops = stops.slice(0, timeline.segments.length + 1)
    const full = endStops.filter((stop) => stop.opacity === 1)
    expect(full).toHaveLength(2)
    expect(full[1]!.at - full[0]!.at).toBeCloseTo(
      (Math.round(2000 * MOTION_SCALE) / timeline.totalMs) * 100,
      3,
    )
    // Complementary: the `start` frame's stops mirror the `end` frame's.
    const startStops = stops.slice(timeline.segments.length + 1)
    expect(startStops).toHaveLength(endStops.length)
    for (const [index, stop] of startStops.entries()) {
      expect(stop.at).toBeCloseTo(endStops[index]!.at, 5)
      expect(stop.opacity).toBeCloseTo(1 - endStops[index]!.opacity, 5)
    }
  })

  it('produces a CSS-safe identifier', () => {
    expect(names.end).toMatch(/^[A-Za-z][A-Za-z0-9_-]*$/)
    expect(names.start).toMatch(/^[A-Za-z][A-Za-z0-9_-]*$/)
  })
})
