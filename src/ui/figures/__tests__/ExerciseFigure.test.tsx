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
