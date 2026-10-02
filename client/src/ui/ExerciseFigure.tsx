import { useEffect, useMemo, useState } from 'react'
import type { Modifier, Rung } from '../domain/types.ts'
import { AngleArc, ElevationMarker, HandPositionDots, TempoDot } from './figures/overlays.tsx'
import { FIGURE_VIEWBOX, getFigure } from './figures/index.ts'
import { buildTimeline, motionClassNames, motionStyles } from './figures/motion.ts'
import { RigFigure } from './figures/primitives.tsx'

export interface ExerciseFigureProps {
  /** Only the fields the figure system needs — callers can pass a full
   * `Rung` straight through. */
  readonly rung: Pick<Rung, 'name' | 'figureId' | 'modifier'>
  /** Rendered size in px (square). Figures must stay legible around ~120,
   * the smallest size an exercise card is expected to show one at. */
  readonly size?: number
  readonly className?: string
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  )

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handleChange = () => setReduced(mql.matches)
    handleChange()
    mql.addEventListener('change', handleChange)
    return () => mql.removeEventListener('change', handleChange)
  }, [])

  return reduced
}

/**
 * Overlays are driven entirely by `Rung.modifier` data — this is the piece
 * that lets a new rung reuse an existing drawing (see `figures/index.ts`).
 * Nothing here knows or cares which pose it is stacked on top of.
 *
 * They render **once**, in their own static layer, outside the animated
 * skeleton. An annotation that moved or pulsed with the body would be noise,
 * and the accent-coloured ones are the brightest thing on the drawing.
 */
function renderOverlays(modifier: Modifier | undefined) {
  if (!modifier) return null
  return (
    <>
      {modifier.elevation && modifier.elevation !== 'none' ? (
        <ElevationMarker at={modifier.elevation} />
      ) : null}
      {modifier.unilateral ? <HandPositionDots /> : null}
      {modifier.pauseAt && modifier.pauseSeconds ? <AngleArc at={modifier.pauseAt} /> : null}
      {modifier.eccentricSeconds ? <TempoDot /> : null}
    </>
  )
}

// One shared, static stylesheet. Duplicated per instance if several figures
// are on screen at once (a handful of exercise cards) — inert, identical
// <style> tags cost negligible parse time and keep this component free of a
// CSS-module/build-tool dependency it doesn't otherwise need. The per-rung
// clock is a *second*, generated stylesheet — see `figures/motion.ts`.
const STYLES = `
.exercise-figure {
  position: relative;
  display: inline-flex;
  color: inherit;
  overflow: hidden;
  border-radius: 12px;
}
.exercise-figure__frame,
.exercise-figure__overlays,
.exercise-figure__placeholder-art {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
/* Every bone group rotates about its own origin, which is the joint it hangs
   from: the renderer puts each bone's root at (0,0) of its group. This is the
   SVG default already; it is stated so a global transform-origin rule cannot
   swing a limb about the middle of the canvas. */
.exercise-figure__frame g {
  transform-box: view-box;
  transform-origin: 0 0;
}
.exercise-figure--placeholder {
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  text-align: center;
}
.exercise-figure__label {
  position: relative;
  z-index: 1;
  font-size: 0.7rem;
  line-height: 1.2;
  opacity: 0.8;
  padding: 0 6px 8px;
  overflow-wrap: anywhere;
}
`

/**
 * Renders a rung's figure by its `figureId`, moving the rig between its `start`
 * and `end` poses **on a clock derived from `Rung.modifier`** (`figures/motion.ts`).
 * That derivation is the whole point: five drawings cover 35 rungs, and what
 * separates two rungs sharing a pose is when the figure moves and when it stops.
 * A 3-second lowering takes three (scaled) seconds; a 2-second bottom hold
 * visibly stops at the bottom. Nothing here is per-rung — this component reads
 * data and emits CSS.
 *
 * An unregistered or missing `figureId` — including a typo in content data —
 * renders a labelled placeholder instead of throwing. This is the fallback the
 * whole app is expected to live behind for a while (see
 * `corpus/briefs/todo/10-svg-figures.md`), so it is deliberately presentable on
 * its own rather than an obvious "TODO" box.
 */
export function ExerciseFigure({ rung, size = 120, className }: ExerciseFigureProps) {
  const reducedMotion = usePrefersReducedMotion()
  const figure = getFigure(rung.figureId)
  // A real branch, not a slowed animation: under reduced motion no keyframes are
  // generated, no animation class is applied, and the figure's static `end` pose
  // is what shows.
  const animated = !reducedMotion && figure !== undefined
  // Solving the rig and writing ~300 keyframe stops is cheap but not free, and
  // this re-renders on every tick of the countdown beside it. Keyed on what the
  // CSS actually depends on.
  const motion = useMemo(() => {
    if (!animated || !figure) return undefined
    const timeline = buildTimeline(rung.figureId, rung.modifier)
    return { classes: motionClassNames(timeline, figure.rig), css: motionStyles(timeline, figure.rig) }
  }, [animated, figure, rung.figureId, rung.modifier])

  const rootClassName = [
    'exercise-figure',
    figure ? null : 'exercise-figure--placeholder',
    animated ? null : 'exercise-figure--static',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={rootClassName} role="img" aria-label={rung.name} style={{ width: size, height: size }}>
      <style>{STYLES}</style>
      {motion ? <style>{motion.css}</style> : null}
      {figure ? (
        <>
          <svg
            className="exercise-figure__frame"
            viewBox={FIGURE_VIEWBOX}
            aria-hidden="true"
            focusable="false"
          >
            <RigFigure rig={figure.rig} arrow={figure.arrow} motion={motion?.classes} />
          </svg>
          <svg
            className="exercise-figure__overlays"
            viewBox={FIGURE_VIEWBOX}
            aria-hidden="true"
            focusable="false"
          >
            {renderOverlays(rung.modifier)}
          </svg>
        </>
      ) : (
        <>
          <svg
            className="exercise-figure__placeholder-art"
            viewBox={FIGURE_VIEWBOX}
            aria-hidden="true"
            focusable="false"
          >
            <rect
              x="4"
              y="4"
              width="192"
              height="192"
              rx="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray="6 8"
              opacity="0.35"
            />
            <circle
              cx="100"
              cy="72"
              r="22"
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              strokeLinecap="round"
              opacity="0.55"
            />
            <path
              d="M64 150 Q100 104 136 150"
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              strokeLinecap="round"
              opacity="0.55"
            />
          </svg>
          <span className="exercise-figure__label">{rung.name}</span>
        </>
      )}
    </div>
  )
}
