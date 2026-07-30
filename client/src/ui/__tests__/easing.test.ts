// Runs in the default `node` environment — these are pure functions of numbers,
// which is the whole point of the module. Before it existed, the count-up's curve
// was an inline expression inside a component that needed `requestAnimationFrame`
// and a `matchMedia` mock to reach, so it had no test at all.
import { easeInCubic, easeOutCubic, linear, progress, tween } from '../easing.ts'

describe('the curves', () => {
  for (const [name, ease] of [
    ['linear', linear],
    ['easeOutCubic', easeOutCubic],
    ['easeInCubic', easeInCubic],
  ] as const) {
    it(`${name} maps the unit interval onto itself, endpoints exact`, () => {
      expect(ease(0)).toBe(0)
      expect(ease(1)).toBe(1)
      for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
        expect(ease(t)).toBeGreaterThanOrEqual(0)
        expect(ease(t)).toBeLessThanOrEqual(1)
      }
    })

    it(`${name} is monotonically increasing`, () => {
      let previous = -Infinity
      for (let t = 0; t <= 1.0001; t += 0.05) {
        const current = ease(Math.min(t, 1))
        expect(current).toBeGreaterThanOrEqual(previous)
        previous = current
      }
    })
  }

  // The shape claim, not just the range claim: "fast out, settling in" means the
  // first half of the time buys more than half the distance. A curve that passed
  // the endpoint tests while easing the wrong way would be invisible otherwise.
  it('easeOutCubic front-loads the distance and easeInCubic back-loads it', () => {
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5)
    expect(easeInCubic(0.5)).toBeLessThan(0.5)
    expect(linear(0.5)).toBe(0.5)
  })
})

describe('progress', () => {
  it('is the clamped fraction of the duration', () => {
    expect(progress(0, 500)).toBe(0)
    expect(progress(250, 500)).toBe(0.5)
    expect(progress(500, 500)).toBe(1)
  })

  it('clamps rather than extrapolating — a late frame must not overshoot', () => {
    expect(progress(900, 500)).toBe(1)
    expect(progress(-40, 500)).toBe(0)
  })

  // A caller with no time to animate in should show the finished value, not NaN.
  it('treats a zero or negative duration as finished', () => {
    expect(progress(0, 0)).toBe(1)
    expect(progress(10, -5)).toBe(1)
  })
})

describe('tween', () => {
  it('starts at `from` and ends exactly at `to`', () => {
    expect(tween(0, 42, 0, 500, easeOutCubic)).toBe(0)
    expect(tween(0, 42, 500, 500, easeOutCubic)).toBe(42)
  })

  /**
   * The reason `tween` special-cases a finished sweep instead of trusting the
   * arithmetic. The count-up's value is how many sessions the user has completed;
   * landing on 41.999999 and rendering "41" would be a wrong number on the one
   * screen that exists to state it.
   */
  it('is exactly `to` past the duration, never a hair short', () => {
    expect(tween(0, 42, 501, 500, easeOutCubic)).toBe(42)
    expect(tween(0, 42, 100_000, 500, easeOutCubic)).toBe(42)
    expect(Number.isInteger(tween(0, 42, 500, 500, easeOutCubic))).toBe(true)
  })

  it('defaults to linear when no curve is given', () => {
    expect(tween(0, 100, 250, 500)).toBe(50)
  })

  it('interpolates from a non-zero start and downward too', () => {
    expect(tween(10, 20, 250, 500)).toBe(15)
    expect(tween(20, 10, 250, 500)).toBe(15)
  })

  // The count-up's actual call, sampled across the sweep: monotonic, in range,
  // and never above the target — an overshoot would show a number the user has
  // not reached.
  it('never exceeds the target across a full 520ms sweep', () => {
    const target = 137
    let previous = -Infinity
    for (let ms = 0; ms <= 520; ms += 20) {
      const v = tween(0, target, ms, 520, easeOutCubic)
      expect(v).toBeGreaterThanOrEqual(previous)
      expect(v).toBeLessThanOrEqual(target)
      previous = v
    }
    expect(tween(0, target, 520, 520, easeOutCubic)).toBe(target)
  })
})
