import { MovementArrow, StickFigure } from './primitives.tsx'
import type { StickFigureProps } from './primitives.tsx'
import type { FigureProps } from './types.ts'

const START: StickFigureProps = {
  head: { x: 38, y: 150 },
  shoulder: { x: 58, y: 150 },
  hip: { x: 110, y: 156 },
  handL: { x: 54, y: 170 },
  handR: { x: 60, y: 174 },
  kneeL: { x: 138, y: 132 },
  kneeR: { x: 144, y: 136 },
  footL: { x: 160, y: 170 },
  footR: { x: 166, y: 176 },
}

const END: StickFigureProps = {
  head: { x: 38, y: 150 },
  shoulder: { x: 58, y: 150 },
  hip: { x: 112, y: 112 },
  handL: { x: 54, y: 170 },
  handR: { x: 60, y: 174 },
  kneeL: { x: 138, y: 132 },
  kneeR: { x: 144, y: 136 },
  footL: { x: 160, y: 170 },
  footR: { x: 166, y: 176 },
}

/**
 * Hinge: lying, hips down, to bridge (hips raised, shoulders and feet
 * planted). Covers glute bridge, its pause/single-leg/elevated variants, and
 * the nordic negative — the eccentric-only rungs distinguish themselves via
 * the tempo overlay, not a new drawing.
 */
export function HingeFigure({ phase }: FigureProps) {
  const pose = phase === 'start' ? START : END
  return (
    <>
      <StickFigure {...pose} />
      <MovementArrow x={122} y1={156} y2={112} />
    </>
  )
}
