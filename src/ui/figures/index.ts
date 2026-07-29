/**
 * Figure drawing contract — read this before adding or touching a figure.
 *
 * Every figure is a plain React function component taking `{ phase: 'start' |
 * 'end' }` (`FigureProps`, `types.ts`) and drawing into a caller-provided
 * `<svg viewBox="0 0 200 200">` (`FIGURE_VIEWBOX`). The rules below are the
 * whole design system, and each is load-bearing:
 *
 *   - **Fixed 200×200 viewBox**, always. `ExerciseFigure.tsx` stacks the
 *     `start` and `end` frames absolutely, one atop the other, for the
 *     crossfade — that only lines up if both use identical coordinates.
 *   - **Every stroke is `stroke="currentColor"`.** A hardcoded hex colour is
 *     invisible (or wrong) against dark mode's inverted palette. This isn't
 *     just a comment: `__tests__/noHexColors.test.ts` greps every file in
 *     this directory and fails the build on one hex literal.
 *   - **One stroke width** (`STROKE_WIDTH`) everywhere, including the ground
 *     line and the overlays. Varying it is the difference between a design
 *     system and a sketch.
 *   - **`stroke-linecap="round"`, no shading, no faces.** A push-up and a
 *     squat read as different poses from five paths each; more anatomical
 *     detail buys legibility nothing at ~120px and costs consistency.
 *   - **`fill` is reserved for one accent element per figure**: the movement
 *     arrow (`MovementArrow`, `primitives.tsx`), coloured `var(--accent)` —
 *     never a literal colour, for the same dark-mode reason as above.
 *   - **A figure draws a rung's *pose*, not its identity.** Ten drawings cover
 *     five patterns because every rung within a ladder is the same movement
 *     plus a modifier (see `corpus/wiki/decisions.md`). What actually differs
 *     between adjacent rungs — tempo, pause location, elevation, unilateral
 *     load — is drawn separately as an overlay (`overlays.tsx`), composed on
 *     top from `Rung.modifier` by `ExerciseFigure.tsx`. A new rung therefore
 *     never needs a new drawing, only new modifier data.
 *
 * ## Registration
 *
 * Figures are registered here, keyed by the string on `Rung.figureId`. An id
 * with **no** entry is not an error: `ExerciseFigure` falls back to a
 * labelled placeholder rather than throwing. A typo in content data must
 * never break a workout — see `getFigure` below.
 */
import { HingeFigure } from './Hinge.tsx'
import { PlankFigure } from './Plank.tsx'
import { ProneFigure } from './Prone.tsx'
import { PushFigure } from './Push.tsx'
import { SquatFigure } from './Squat.tsx'
import type { FigureComponent } from './types.ts'

export { FIGURE_VIEWBOX, STROKE_WIDTH } from './constants.ts'
export type { FigureComponent, FigurePhase, FigureProps, Joint } from './types.ts'
export { ElevationMarker, AngleArc, HandPositionDots, TempoDot } from './overlays.tsx'

/**
 * The five base pose pairs, keyed by `figureId`. This is the full registry —
 * see the brief report for which of the five were drawn in this pass; an
 * unregistered key is expected and handled, not a bug.
 */
export const figures: Readonly<Record<string, FigureComponent>> = {
  push: PushFigure,
  squat: SquatFigure,
  hinge: HingeFigure,
  prone: ProneFigure,
  plank: PlankFigure,
}

/**
 * Look up a figure by id. Never throws: an unregistered or missing id
 * resolves to `undefined`, which is `ExerciseFigure`'s signal to render the
 * placeholder instead of drawing anything.
 */
export function getFigure(figureId: string | undefined): FigureComponent | undefined {
  if (!figureId) return undefined
  return figures[figureId]
}
