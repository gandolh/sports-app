// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExerciseFigure } from '../../ExerciseFigure.tsx'
import { figures } from '../index.ts'

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
    it(`renders "${figureId}" (both start and end frames) without throwing`, () => {
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

describe('ExerciseFigure — crossfade and prefers-reduced-motion', () => {
  it('animates the crossfade by default', () => {
    mockPrefersReducedMotion(false)
    const { container } = render(<ExerciseFigure rung={{ name: 'Push-up', figureId: 'push' }} />)
    const endFrame = container.querySelector('.exercise-figure__frame--end')
    expect(endFrame?.classList.contains('exercise-figure__frame--animated')).toBe(true)
  })

  it('holds the start frame and disables the crossfade under prefers-reduced-motion', () => {
    mockPrefersReducedMotion(true)
    const { container } = render(<ExerciseFigure rung={{ name: 'Push-up', figureId: 'push' }} />)
    const endFrame = container.querySelector('.exercise-figure__frame--end')
    const startFrame = container.querySelector('.exercise-figure__frame--start')
    expect(endFrame?.classList.contains('exercise-figure__frame--animated')).toBe(false)
    expect(startFrame?.classList.contains('exercise-figure__frame--start')).toBe(true)
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
  it('binds both frames to a generated keyframe animation', () => {
    mockPrefersReducedMotion(false)
    const { container } = render(
      <ExerciseFigure rung={{ name: 'Full push-up', figureId: 'push' }} />,
    )
    const css = injectedCss(container)
    for (const phase of ['start', 'end'] as const) {
      const frame = container.querySelector(`.exercise-figure__frame--${phase}`)
      const clockClass = Array.from(frame?.classList ?? []).find((name) =>
        name.startsWith('exercise-figure-clock-'),
      )
      expect(clockClass, `${phase} frame has no clock class`).toBeDefined()
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

    const clockOf = (container: HTMLElement) =>
      Array.from(container.querySelector('.exercise-figure__frame--end')?.classList ?? []).find(
        (name) => name.startsWith('exercise-figure-clock-'),
      )

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
    // …and the still frame it settles on is the `end` pose, per the design system.
    expect(container.firstElementChild?.classList.contains('exercise-figure--static')).toBe(true)
    expect(injectedCss(container)).toContain(
      '.exercise-figure--static .exercise-figure__frame--end { opacity: 1; }',
    )
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
