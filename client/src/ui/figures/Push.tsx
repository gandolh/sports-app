import { MovementArrow, StickFigure } from './primitives.tsx'
import type { StickFigureProps } from './primitives.tsx'
import type { FigureProps } from './types.ts'

// Facing right: head/hands toward the left, feet toward the right. Every pose
// in this module keeps that orientation, which is what lets `overlays.tsx`
// place elevation markers at a fixed side without knowing the pose.

const START: StickFigureProps = {
  head: { x: 46, y: 70 },
  shoulder: { x: 62, y: 82 },
  hip: { x: 132, y: 96 },
  handL: { x: 58, y: 176 },
  handR: { x: 66, y: 176 },
  footL: { x: 172, y: 150 },
  footR: { x: 177, y: 158 },
}

const END: StickFigureProps = {
  head: { x: 46, y: 116 },
  shoulder: { x: 62, y: 126 },
  hip: { x: 130, y: 108 },
  elbowL: { x: 52, y: 150 },
  elbowR: { x: 58, y: 152 },
  handL: { x: 56, y: 176 },
  handR: { x: 64, y: 176 },
  footL: { x: 172, y: 150 },
  footR: { x: 177, y: 158 },
}

/**
 * Push-up: top (arms extended) to bottom (chest low, arms bent). Every push
 * rung — hands-high counter, chair, knees, full, tempo/pause variants,
 * elevated, diamond, archer — shares this one pose; what differs between them
 * is drawn by the overlays composed on top in `ExerciseFigure.tsx`.
 */
export function PushFigure({ phase }: FigureProps) {
  const pose = phase === 'start' ? START : END
  return (
    <>
      <StickFigure {...pose} />
      <MovementArrow x={100} y1={78} y2={122} />
    </>
  )
}
