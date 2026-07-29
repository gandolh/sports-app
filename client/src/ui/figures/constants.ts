/**
 * Shared numeric constants for the figure drawing system.
 *
 * Kept in their own module (not `index.ts`) to avoid an import cycle:
 * `primitives.tsx` and every pose component need these, and `index.ts` needs to
 * import the pose components to build the registry.
 */

/** Every figure is drawn to this exact viewBox. The crossfade in
 * `ExerciseFigure.tsx` stacks two frames absolutely, one per phase, so both
 * must agree on coordinates pixel-for-pixel. */
export const FIGURE_VIEWBOX = '0 0 200 200'

/** The one stroke weight used everywhere — body, ground line, and overlays
 * alike. Varying it is the difference between a design system and a sketch. */
export const STROKE_WIDTH = 6

export const HEAD_RADIUS = 14

export const GROUND_Y = 182
