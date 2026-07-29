import { STROKE_WIDTH } from './constants.ts'

/**
 * The four composable overlays. Each is driven purely by `Rung.modifier`
 * data (see `ExerciseFigure.tsx`, which decides *whether* to render one) —
 * never by which pose it sits on top of. That is what lets a new rung reuse
 * an existing drawing: it opts into an overlay by data, not by a new SVG.
 *
 * Positions are fixed, generic spots on the 200×200 canvas (a corner, an
 * edge) rather than anatomically precise anchors. That is deliberate — these
 * are iconographic badges, not literal joint annotations, and precision here
 * would need per-pose knowledge these components intentionally don't have.
 */

type ElevationSite = 'hands' | 'feet' | 'heels'

/** A raised block under the working hands/feet — `modifier.elevation`. */
export function ElevationMarker({ at }: { readonly at: ElevationSite }) {
  const onLeft = at === 'hands'
  const width = at === 'heels' ? 22 : 40
  const height = at === 'heels' ? 9 : 16
  const x = onLeft ? 24 : 176 - width
  const y = 182 - height
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      rx={2}
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE_WIDTH}
      opacity={0.6}
    />
  )
}

/** One loaded dot, one faded dot — marks asymmetric single-limb work,
 * `modifier.unilateral` (e.g. an archer push-up or a single-leg bridge). */
export function HandPositionDots() {
  return (
    <g strokeWidth={STROKE_WIDTH} strokeLinecap="round">
      <circle cx={70} cy={190} r={4} fill="currentColor" stroke="none" />
      <circle cx={96} cy={190} r={4} fill="none" stroke="currentColor" opacity={0.4} />
    </g>
  )
}

const ANGLE_ARC_Y: Record<'top' | 'mid' | 'bottom', number> = { top: 26, mid: 100, bottom: 174 }

/** A small held arc — marks where in the rep the pause happens,
 * `modifier.pauseAt`. Safety-relevant per SPEC: "3s down + 2s pause" is only
 * clear once the card, and this marker, say *where*. */
export function AngleArc({ at }: { readonly at: 'top' | 'mid' | 'bottom' }) {
  const y = ANGLE_ARC_Y[at]
  return (
    <g stroke="var(--accent)" fill="none" strokeWidth={STROKE_WIDTH} strokeLinecap="round">
      <path d={`M${190 - 14},${y - 10} A14,14 0 0 1 190,${y + 4}`} />
      <circle cx={190} cy={y} r={3} fill="var(--accent)" stroke="none" />
    </g>
  )
}

/** A small clock-hand glyph, fixed in the top-left corner — marks a slow
 * eccentric, `modifier.eccentricSeconds`. */
export function TempoDot() {
  return (
    <g stroke="var(--accent)" strokeWidth={STROKE_WIDTH} strokeLinecap="round">
      <circle cx={18} cy={18} r={4} fill="var(--accent)" stroke="none" />
      <line x1={18} y1={18} x2={18} y2={9} />
      <line x1={18} y1={18} x2={26} y2={18} />
    </g>
  )
}
