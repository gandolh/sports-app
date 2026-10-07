import { GROUND_Y, HEAD_RADIUS, STROKE_WIDTH } from './constants.ts'
import { LIMB_IDS, localAngles, resolvePhasePose } from './rig.ts'
import type { RigPose } from './rig.ts'
import type { MovementArrowSpec, Rig, RigBoneId, RigLimbId } from './types.ts'

/** Everything `motion.ts` can animate: the shoulder anchor (a translation) and
 * every bone (a rotation). */
export type RigPartId = 'anchor' | RigBoneId

/**
 * How far the hair spike stands off the head, and at what angle to the neck
 * axis. A fixed landmark on the head, so the eye has something stationary to
 * read a rotation against — `prone` sweeps an arm 150° past it.
 */
const HAIR_SPIKE_LENGTH = 7
const HAIR_SPIKE_ANGLE_DEG = -35

/** Half the trouser flare: a short stroke across the hip, square to the spine.
 * The hip was an invisible vertex where three lines met, and it is the joint
 * carrying the most information in `hinge` (rises 46 units) and `plank`. */
const FLARE_HALF_WIDTH = 7

/** Coordinates and angles to three decimals: well under anything visible at any
 * size, and short enough that 38 rungs of attributes stay readable. */
function fmt(value: number): string {
  return String(Math.round(value * 1000) / 1000)
}

export interface RigFigureProps {
  readonly rig: Rig
  readonly arrow: MovementArrowSpec
  /**
   * The animation class for each moving part, from `motionClassNames`. Absent
   * means a still figure, and the still figure is the `end` pose: the static
   * `transform` attributes below always describe `end`, and a running CSS
   * animation overrides them. So the reduced-motion branch needs no pose logic
   * of its own — it just omits this.
   */
  readonly motion?: ReadonlyMap<RigPartId, string> | undefined
}

/**
 * Draws any rig: ground line, torso, two arms, two legs, head, the two
 * structural cues and the movement arrow — the full drawing system, for every
 * figure. A figure file is pure data (`FigureDefinition`), so no figure can
 * drift from the drawing rules in `figures/index.ts`.
 *
 * The skeleton is drawn as **nested groups**, one per bone, each holding one
 * line along its own +x axis: the shoulder anchor translates, every bone
 * rotates by its angle relative to its parent (`localAngles`), and a child
 * group sits at its parent's tip. Lengths live in the static geometry and only
 * rotations move, so CSS interpolating between keyframe stops can turn a bone
 * but never stretch it or pull a joint apart — the property the whole rig
 * exists for, carried through to the pixels.
 */
export function RigFigure({ rig, arrow, motion }: RigFigureProps) {
  const pose = resolvePhasePose(rig, 'end')
  const local = localAngles(pose)
  const part = (id: RigPartId) => motion?.get(id)
  const rotate = (id: RigBoneId) => `rotate(${fmt(local.get(id) ?? 0)})`

  const limb = (id: RigLimbId) => <Limb key={id} id={id} pose={pose} part={part} rotate={rotate} />
  const hipLimbs = LIMB_IDS.filter((id) => pose.limbs[id].rootId === 'hip').map(limb)
  const shoulderLimbs = LIMB_IDS.filter((id) => pose.limbs[id].rootId === 'shoulder').map(limb)
  const spike = (HAIR_SPIKE_ANGLE_DEG * Math.PI) / 180

  return (
    <>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1={16} y1={GROUND_Y} x2={184} y2={GROUND_Y} opacity={0.35} />
        <g
          className={part('anchor')}
          transform={`translate(${fmt(pose.shoulder.x)} ${fmt(pose.shoulder.y)})`}
        >
          <g className={part('torso')} transform={rotate('torso')}>
            <line x2={fmt(pose.torso.length)} />
            <g transform={`translate(${fmt(pose.torso.length)} 0)`}>
              <line y1={-FLARE_HALF_WIDTH} y2={FLARE_HALF_WIDTH} />
              {hipLimbs}
            </g>
          </g>
          {shoulderLimbs}
          <g className={part('neck')} transform={rotate('neck')}>
            <circle cx={fmt(pose.neck.length)} r={HEAD_RADIUS} />
            <line
              x1={fmt(pose.neck.length + HEAD_RADIUS * Math.cos(spike))}
              y1={fmt(HEAD_RADIUS * Math.sin(spike))}
              x2={fmt(pose.neck.length + (HEAD_RADIUS + HAIR_SPIKE_LENGTH) * Math.cos(spike))}
              y2={fmt((HEAD_RADIUS + HAIR_SPIKE_LENGTH) * Math.sin(spike))}
            />
          </g>
        </g>
      </g>
      <MovementArrow {...arrow} />
    </>
  )
}

interface LimbProps {
  readonly id: RigLimbId
  readonly pose: RigPose
  readonly part: (id: RigPartId) => string | undefined
  readonly rotate: (id: RigBoneId) => string
}

/** One limb: a single rotating bone, or an upper bone carrying a lower one at
 * its tip. Ids follow `boneEntries`, which is what `motion.ts` names its
 * keyframes after. */
function Limb({ id, pose, part, rotate }: LimbProps) {
  const [upper, lower] = pose.limbs[id].bones
  if (!upper) return null
  if (!lower) {
    return (
      <g className={part(id)} transform={rotate(id)}>
        <line x2={fmt(upper.length)} />
      </g>
    )
  }
  return (
    <g className={part(`${id}-upper`)} transform={rotate(`${id}-upper`)}>
      <line x2={fmt(upper.length)} />
      <g transform={`translate(${fmt(upper.length)} 0)`}>
        <g className={part(`${id}-lower`)} transform={rotate(`${id}-lower`)}>
          <line x2={fmt(lower.length)} />
        </g>
      </g>
    </g>
  )
}

/**
 * The single permitted accent-colour element on any figure: a small arrow
 * marking the direction of the movement's main phase (e.g. the descent of a
 * squat). Fixed coordinates, outside the animated skeleton, so only the body
 * moves — the arrow is an annotation, not a frame.
 */
export function MovementArrow({ x, y1, y2 }: MovementArrowSpec) {
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
