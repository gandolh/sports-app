import { MovementArrow, StickFigure } from './primitives.tsx'
import type { StickFigureProps } from './primitives.tsx'
import type { FigureProps } from './types.ts'

const START: StickFigureProps = {
  head: { x: 100, y: 40 },
  shoulder: { x: 100, y: 58 },
  hip: { x: 100, y: 100 },
  handL: { x: 90, y: 128 },
  handR: { x: 110, y: 128 },
  footL: { x: 90, y: 178 },
  footR: { x: 110, y: 178 },
}

const END: StickFigureProps = {
  head: { x: 100, y: 92 },
  shoulder: { x: 100, y: 108 },
  hip: { x: 100, y: 142 },
  handL: { x: 68, y: 108 },
  handR: { x: 132, y: 108 },
  kneeL: { x: 80, y: 152 },
  kneeR: { x: 120, y: 152 },
  footL: { x: 88, y: 178 },
  footR: { x: 112, y: 178 },
}

/**
 * Squat: standing to bottom (hips back and down, knees bent, arms forward for
 * balance). Every squat rung — assisted, bodyweight, tempo/pause variants,
 * heels elevated, split, single-leg, pistol progression — shares this pose.
 */
export function SquatFigure({ phase }: FigureProps) {
  const pose = phase === 'start' ? START : END
  return (
    <>
      <StickFigure {...pose} />
      <MovementArrow x={150} y1={50} y2={96} />
    </>
  )
}
