import { MovementArrow, StickFigure } from './primitives.tsx'
import type { StickFigureProps } from './primitives.tsx'
import type { FigureProps } from './types.ts'

const START: StickFigureProps = {
  head: { x: 38, y: 100 },
  shoulder: { x: 58, y: 104 },
  hip: { x: 130, y: 110 },
  handL: { x: 70, y: 138 },
  handR: { x: 76, y: 144 },
  footL: { x: 170, y: 118 },
  footR: { x: 176, y: 124 },
}

const END: StickFigureProps = {
  head: { x: 38, y: 100 },
  shoulder: { x: 58, y: 104 },
  hip: { x: 130, y: 110 },
  handL: { x: 20, y: 72 },
  handR: { x: 26, y: 62 },
  footL: { x: 170, y: 118 },
  footR: { x: 176, y: 124 },
}

/**
 * Prone: face-down, arms at sides, to arms raised overhead in a Y/T shape.
 * Covers the postural pull work — Y raise, T raise, Y-T-W combo, reverse
 * snow angels, lat slides, end-range holds. Labelled "postural," never "pull,"
 * per the locked equipment decision (corpus/wiki/decisions.md).
 */
export function ProneFigure({ phase }: FigureProps) {
  const pose = phase === 'start' ? START : END
  return (
    <>
      <StickFigure {...pose} />
      <MovementArrow x={48} y1={138} y2={80} />
    </>
  )
}
