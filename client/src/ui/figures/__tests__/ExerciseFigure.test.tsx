// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExerciseFigure } from '../../ExerciseFigure.tsx'
import { figures } from '../index.ts'
import { PUSH_RIG } from '../Push.tsx'
import { resolvePhasePose } from '../rig.ts'

function mockPrefersReducedMotion(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ExerciseFigure — placeholder fallback', () => {
  it('renders a labelled placeholder for an unknown figureId, without throwing', () => {
    mockPrefersReducedMotion(false)
    expect(() =>
      render(<ExerciseFigure rung={{ name: 'Mystery Move', figureId: 'not-a-real-id' }} />),
    ).not.toThrow()
  })

  it('placeholder shows the exercise name and exposes it as the accessible name', () => {
    mockPrefersReducedMotion(false)
    const { getByRole, getByText } = render(
      <ExerciseFigure rung={{ name: 'Mystery Move', figureId: 'nope' }} />,
    )
    expect(getByRole('img', { name: 'Mystery Move' })).toBeTruthy()
    expect(getByText('Mystery Move')).toBeTruthy()
  })

  it('renders the placeholder when figureId is absent entirely (not just unknown)', () => {
    mockPrefersReducedMotion(false)
    expect(() => render(<ExerciseFigure rung={{ name: 'No Figure Yet' }} />)).not.toThrow()
  })

  it('every figure unregistered still looks intentional: no raw "undefined"/error text leaks through', () => {
    mockPrefersReducedMotion(false)
    const { container, getByText } = render(
      <ExerciseFigure rung={{ name: 'Archer Push-up', figureId: 'archer' }} />,
    )
    expect(getByText('Archer Push-up')).toBeTruthy()
    // Exclude the injected <style> tag's own text when checking for leaked
    // error/placeholder noise in the rendered content.
    const visibleText = Array.from(container.querySelectorAll(':scope > div > *:not(style)'))
      .map((el) => el.textContent)
      .join(' ')
    expect(visibleText).not.toMatch(/undefined|null|error/i)
  })
})

describe('ExerciseFigure — registered figures', () => {
  it('registers the five base pose pairs', () => {
    expect(Object.keys(figures).sort()).toEqual(['hinge', 'plank', 'prone', 'push', 'squat'])
  })

  for (const figureId of Object.keys(figures)) {
    it(`renders "${figureId}" as one figure without throwing`, () => {
      mockPrefersReducedMotion(false)
      expect(() =>
        render(<ExerciseFigure rung={{ name: figureId, figureId }} />),
      ).not.toThrow()
    })
  }

  it('composes overlay markers from modifier data with no figure-specific code', () => {
    mockPrefersReducedMotion(false)
    const { container } = render(
      <ExerciseFigure
        rung={{
          name: 'Feet-elevated, tempo push-up',
          figureId: 'push',
          modifier: {
            elevation: 'feet',
            eccentricSeconds: 3,
            pauseSeconds: 2,
            pauseAt: 'bottom',
            unilateral: true,
          },
        }}
      />,
    )
    // elevation -> rect, tempo dot + angle arc -> extra circles, unilateral -> dots.
    expect(container.querySelectorAll('rect').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('circle').length).toBeGreaterThan(2)
  })

  it('renders no overlay markers when the rung has no modifier', () => {
    mockPrefersReducedMotion(false)
    const { container } = render(<ExerciseFigure rung={{ name: 'Push-up', figureId: 'push' }} />)
    expect(container.querySelectorAll('rect').length).toBe(0)
  })
})

/** The animation class on the shoulder anchor, if any — every animated part
 * carries one, and the anchor is the one every rig has. */
function clockOf(container: HTMLElement): string | undefined {
  return Array.from(container.querySelectorAll('[class*="exercise-figure-clock-"]'))
    .flatMap((element) => Array.from(element.classList))
    .find((name) => name.startsWith('exercise-figure-clock-') && name.endsWith('-anchor'))
}

describe('ExerciseFigure — one figure, and prefers-reduced-motion', () => {
  it('draws the body once, in one svg — not two stacked frames', () => {
    mockPrefersReducedMotion(false)
    const { container } = render(<ExerciseFigure rung={{ name: 'Push-up', figureId: 'push' }} />)
    expect(container.querySelectorAll('.exercise-figure__frame')).toHaveLength(1)
    // One head: a duplicated figure would draw two.
    expect(container.querySelector('.exercise-figure__frame')?.querySelectorAll('circle')).toHaveLength(1)
  })

  it('animates the rig by default', () => {
    mockPrefersReducedMotion(false)
    const { container } = render(<ExerciseFigure rung={{ name: 'Push-up', figureId: 'push' }} />)
    expect(clockOf(container)).toBeDefined()
    expect(container.firstElementChild?.classList.contains('exercise-figure--static')).toBe(false)
  })

  it('holds the END pose, unanimated, under prefers-reduced-motion', () => {
    // This used to be "holds the start frame", and asserted it by checking that
    // the element it had found *by* the class `--start` had the class `--start`
    // — green whatever the figure showed, and contradicting the CSS, which held
    // `end`. Here the claim is checked against the geometry: the anchor the DOM
    // paints is the rig's `end` shoulder, and not its `start` one.
    mockPrefersReducedMotion(true)
    const { container } = render(<ExerciseFigure rung={{ name: 'Push-up', figureId: 'push' }} />)
    expect(clockOf(container)).toBeUndefined()
    const anchor = container.querySelector('.exercise-figure__frame g g[transform^="translate"]')
    expect(anchor, 'no anchor group rendered').not.toBeNull()
    const [x, y] = (anchor!.getAttribute('transform') ?? '')
      .replace(/^translate\(|\)$/g, '')
      .split(' ')
      .map(Number)
    const end = resolvePhasePose(PUSH_RIG, 'end').shoulder
    const start = resolvePhasePose(PUSH_RIG, 'start').shoulder
    expect(x).toBeCloseTo(end.x, 2)
    expect(y).toBeCloseTo(end.y, 2)
    // The two poses must differ, or the assertion above could not tell them apart.
    expect(Math.hypot(end.x - start.x, end.y - start.y)).toBeGreaterThan(10)
  })
})

// ─── The clock ──────────────────────────────────────────────────────────────

/** Every rule text this instance injected, joined. */
function injectedCss(container: HTMLElement): string {
  return Array.from(container.querySelectorAll('style'))
    .map((style) => style.textContent ?? '')
    .join('\n')
}

const PUSH_05 = { eccentricSeconds: 3 } as const
const PUSH_06 = { eccentricSeconds: 3, pauseSeconds: 2, pauseAt: 'bottom' } as const

describe('ExerciseFigure — the modifier drives the animation clock', () => {
  it('binds every moving part to a generated keyframe animation', () => {
    mockPrefersReducedMotion(false)
    const { container } = render(
      <ExerciseFigure rung={{ name: 'Full push-up', figureId: 'push' }} />,
    )
    const css = injectedCss(container)
    const parts = Array.from(container.querySelectorAll('[class*="exercise-figure-clock-"]'))
    // The anchor, the neck, the torso and push's four two-bone limbs.
    expect(parts).toHaveLength(11)
    for (const part of parts) {
      const clockClass = Array.from(part.classList).find((name) =>
        name.startsWith('exercise-figure-clock-'),
      )!
      // The class is only meaningful if the stylesheet that drives it shipped too.
      expect(css).toContain(`@keyframes ${clockClass}`)
      expect(css).toContain(`.${clockClass} { animation: ${clockClass}`)
    }
  })

  it('rung 5 and rung 6 of the push ladder animate differently in the DOM', () => {
    // The whole reason the clock exists: same pose, same drawing, same overlays.
    // If this passes vacuously the two rungs are indistinguishable again.
    mockPrefersReducedMotion(false)
    const five = render(<ExerciseFigure rung={{ name: '5', figureId: 'push', modifier: PUSH_05 }} />)
    const six = render(<ExerciseFigure rung={{ name: '6', figureId: 'push', modifier: PUSH_06 }} />)

    expect(clockOf(five.container)).toBeDefined()
    expect(clockOf(six.container)).not.toBe(clockOf(five.container))
    expect(injectedCss(six.container)).not.toBe(injectedCss(five.container))
  })

  it('emits no animation at all under prefers-reduced-motion — a branch, not a slowdown', () => {
    mockPrefersReducedMotion(true)
    const { container } = render(
      <ExerciseFigure rung={{ name: '6', figureId: 'push', modifier: PUSH_06 }} />,
    )
    expect(injectedCss(container)).not.toContain('@keyframes exercise-figure-clock-')
    expect(container.querySelector('[class*="exercise-figure-clock-"]')).toBeNull()
    // …and it is marked static. Which pose it holds is asserted against the
    // geometry in the reduced-motion test above.
    expect(container.firstElementChild?.classList.contains('exercise-figure--static')).toBe(true)
  })

  it('draws overlays once, in their own layer, so annotations do not pulse with the body', () => {
    mockPrefersReducedMotion(false)
    const { container } = render(
      <ExerciseFigure
        rung={{ name: 'Heels-elevated squat', figureId: 'squat', modifier: { elevation: 'heels' } }}
      />,
    )
    expect(container.querySelectorAll('rect')).toHaveLength(1)
    const overlayLayer = container.querySelector('.exercise-figure__overlays')
    expect(overlayLayer?.querySelector('rect')).toBeTruthy()
    // The overlay layer must not be one of the animated frames.
    expect(overlayLayer?.classList.contains('exercise-figure__frame')).toBe(false)
  })
})
