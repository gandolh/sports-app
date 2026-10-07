/**
 * Figure drawing contract — read this before adding or touching a figure.
 *
 * A figure is **data**: a `FigureDefinition` (`types.ts`) holding a `Rig` — one
 * skeleton with a length per bone and an angle per bone per phase — and its
 * movement arrow. One generic renderer (`RigFigure`, `primitives.tsx`) draws
 * every figure into a caller-provided `<svg viewBox="0 0 200 200">`
 * (`FIGURE_VIEWBOX`). The rules below are the whole design system, and each is
 * load-bearing:
 *
 *   - **Fixed 200×200 viewBox**, always, and legible at 132px, the size
 *     `Player.tsx` shows a figure at.
 *   - **Every stroke is `stroke="currentColor"`.** A hardcoded hex colour is
 *     invisible (or wrong) against an inverted palette. This isn't just a
 *     comment: `__tests__/noHexColors.test.ts` greps every file in this
 *     directory and fails the build on one hex literal.
 *   - **One stroke width** (`STROKE_WIDTH`) everywhere, including the ground
 *     line and the overlays. Varying it is the difference between a design
 *     system and a sketch.
 *   - **`stroke-linecap="round"`, no shading, no faces.** Two monochrome
 *     structural cues and nothing else: a hair spike (an orientation landmark
 *     on the head) and a trouser flare (marks the hip). Both are strokes, not
 *     decoration — see `primitives.tsx` for what each one is for.
 *   - **`fill` is reserved for one accent element per figure**: the movement
 *     arrow (`MovementArrow`), coloured `var(--accent)` — never a literal
 *     colour. It sits clear of the body at every point of the loop.
 *   - **A bone has one length.** A rig declares lengths once and poses as
 *     rotations, so no pose can stretch a limb (`rig.ts`). There is no
 *     foreshortening: every figure is a side view, every limb in the picture
 *     plane.
 *   - **A figure draws a rung's *pose*, not its identity.** Five rigs cover
 *     38 rungs because every rung within a ladder is the same movement plus a
 *     modifier (see `corpus/wiki/decisions.md`). What actually differs
 *     between adjacent rungs — tempo, pause location, elevation, unilateral
 *     load — is the clock (`motion.ts`) and the overlays (`overlays.tsx`),
 *     composed from `Rung.modifier` by `ExerciseFigure.tsx`. A new rung
 *     therefore never needs a new drawing, only new modifier data.
 *
 * ## Motion
 *
 * The rig moves on a **timeline derived from `Rung.modifier`** (`motion.ts`).
 * Three rules follow, and they are as load-bearing as the drawing rules above:
 *
 *   - **A figure never animates itself.** A rig is two poses; the clock is one
 *     module, so adding a rung cannot require touching a drawing and two rungs
 *     sharing a pose cannot accidentally share a tempo.
 *   - **CSS animation only, never a JS loop.** This renders beside a live
 *     countdown on a phone; a rAF driver competing for those frames is a
 *     regression. `motion.ts` solves the rig once per rung and emits
 *     `@keyframes` text — one block per bone — and nothing else.
 *   - **A new pose needs an entry in `motion.ts`'s `LOWERED_PHASE`**, because
 *     which drawn phase is the *lowered* one differs per pattern — a push-up's
 *     `end` is the bottom, a glute bridge's `end` is the top. An eccentric
 *     animated in the wrong direction is worse than no animation, and no test
 *     can catch it.
 *
 * ## Registration
 *
 * Figures are registered here, keyed by the string on `Rung.figureId`. An id
 * with **no** entry is not an error: `ExerciseFigure` falls back to a
 * labelled placeholder rather than throwing. A typo in content data must
 * never break a workout — see `getFigure` below.
 */
import { HINGE_FIGURE } from './Hinge.tsx'
import { PLANK_FIGURE } from './Plank.tsx'
import { PRONE_FIGURE } from './Prone.tsx'
import { PUSH_FIGURE } from './Push.tsx'
import { SQUAT_FIGURE } from './Squat.tsx'
import type { FigureDefinition } from './types.ts'

export { FIGURE_VIEWBOX, STROKE_WIDTH } from './constants.ts'
export type {
  FigureDefinition,
  FigurePhase,
  Joint,
  MovementArrowSpec,
  Rig,
} from './types.ts'
export { ElevationMarker, AngleArc, HandPositionDots, TempoDot } from './overlays.tsx'
export { MovementArrow, RigFigure } from './primitives.tsx'
export type { RigFigureProps, RigPartId } from './primitives.tsx'
export {
  BASE_PHASE_SECONDS,
  LOWERED_PHASE,
  MOTION_SCALE,
  buildTimeline,
  motionClassNames,
  motionStyles,
} from './motion.ts'
export type { MotionSegment, MotionSegmentPhase, MotionTimeline } from './motion.ts'

/**
 * The five base rigs, keyed by `figureId`. This is the full registry; an
 * unregistered key is expected and handled, not a bug.
 */
export const figures: Readonly<Record<string, FigureDefinition>> = {
  push: PUSH_FIGURE,
  squat: SQUAT_FIGURE,
  hinge: HINGE_FIGURE,
  prone: PRONE_FIGURE,
  plank: PLANK_FIGURE,
}

/**
 * Look up a figure by id. Never throws: an unregistered or missing id
 * resolves to `undefined`, which is `ExerciseFigure`'s signal to render the
 * placeholder instead of drawing anything.
 */
export function getFigure(figureId: string | undefined): FigureDefinition | undefined {
  if (!figureId) return undefined
  return Object.hasOwn(figures, figureId) ? figures[figureId] : undefined
}
