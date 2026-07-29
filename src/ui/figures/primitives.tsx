import { GROUND_Y, HEAD_RADIUS, STROKE_WIDTH } from './constants.ts'
import type { Joint } from './types.ts'

export interface StickFigureProps {
  readonly head: Joint
  readonly shoulder: Joint
  readonly hip: Joint
  readonly handL: Joint
  readonly handR: Joint
  readonly footL: Joint
  readonly footR: Joint
  /** Present only when the limb bends in this phase (e.g. a bent elbow at the
   * bottom of a push-up). Absent means a straight line shoulder/hip → hand/foot. */
  readonly elbowL?: Joint
  readonly elbowR?: Joint
  readonly kneeL?: Joint
  readonly kneeR?: Joint
  readonly showGround?: boolean
}

function limbPath(from: Joint, mid: Joint | undefined, to: Joint): string {
  return mid
    ? `M${from.x},${from.y} L${mid.x},${mid.y} L${to.x},${to.y}`
    : `M${from.x},${from.y} L${to.x},${to.y}`
}

/**
 * The one drawing primitive every pose is built from: a head circle, a torso
 * line, two arms, two legs, and an optional ground line — the exact list the
 * brief calls for. Resist the temptation to add anything else here; the
 * system's consistency is what reads as intentional, not per-figure detail.
 */
export function StickFigure({
  head,
  shoulder,
  hip,
  handL,
  handR,
  footL,
  footR,
  elbowL,
  elbowR,
  kneeL,
  kneeR,
  showGround = true,
}: StickFigureProps) {
  return (
    <g
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {showGround ? <line x1={16} y1={GROUND_Y} x2={184} y2={GROUND_Y} opacity={0.35} /> : null}
      <path d={`M${shoulder.x},${shoulder.y} L${hip.x},${hip.y}`} />
      <path d={limbPath(shoulder, elbowL, handL)} />
      <path d={limbPath(shoulder, elbowR, handR)} />
      <path d={limbPath(hip, kneeL, footL)} />
      <path d={limbPath(hip, kneeR, footR)} />
      <circle cx={head.x} cy={head.y} r={HEAD_RADIUS} />
    </g>
  )
}

export interface MovementArrowProps {
  readonly x: number
  readonly y1: number
  readonly y2: number
}

/**
 * The single permitted accent-colour element on any figure: a small arrow
 * marking the direction of the movement's main phase (e.g. the descent of a
 * squat). Its coordinates are constant across `start`/`end` so only the body
 * animates during the crossfade — the arrow is an annotation, not a frame.
 */
export function MovementArrow({ x, y1, y2 }: MovementArrowProps) {
  const dir = y2 > y1 ? 1 : -1
  const headLen = 9
  const shaftEndY = y2 - dir * headLen
  return (
    <g stroke="var(--accent)" strokeWidth={STROKE_WIDTH} strokeLinecap="round">
      <line x1={x} y1={y1} x2={x} y2={shaftEndY} />
      <path
        d={`M${x - 7},${shaftEndY} L${x},${y2} L${x + 7},${shaftEndY} Z`}
        fill="var(--accent)"
        stroke="none"
      />
    </g>
  )
}
