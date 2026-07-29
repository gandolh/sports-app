import { MovementArrow, StickFigure } from './primitives.tsx'
import type { StickFigureProps } from './primitives.tsx'
import type { FigureProps } from './types.ts'

const START: StickFigureProps = {
  head: { x: 44, y: 80 },
  shoulder: { x: 62, y: 92 },
  hip: { x: 130, y: 96 },
  handL: { x: 58, y: 140 },
  handR: { x: 64, y: 146 },
  footL: { x: 170, y: 130 },
  footR: { x: 176, y: 136 },
}

const END: StickFigureProps = {
  head: { x: 50, y: 70 },
  shoulder: { x: 66, y: 82 },
  hip: { x: 126, y: 82 },
  handL: { x: 60, y: 135 },
  handR: { x: 66, y: 140 },
  footL: { x: 168, y: 120 },
  footR: { x: 174, y: 126 },
}

/**
 * Plank/core: a flat plank hold to a hollow, hips-lifted position — a subtle
 * rock rather than a big displacement, since the whole core ladder (dead bug,
 * plank, side plank, hollow hold, hollow rock, tuck L-sit) is time-based
 * isometric work, not reps through a large range.
 */
export function PlankFigure({ phase }: FigureProps) {
  const pose = phase === 'start' ? START : END
  return (
    <>
      <StickFigure {...pose} />
      <MovementArrow x={142} y1={96} y2={82} />
    </>
  )
}
