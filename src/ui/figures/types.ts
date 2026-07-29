import type { ComponentType } from 'react'

/** A figure never knows which rung it is drawing — only which half of the
 * movement it is showing. See `figures/index.ts` for the full contract. */
export type FigurePhase = 'start' | 'end'

export interface FigureProps {
  readonly phase: FigurePhase
}

/** Every registered figure is a plain function component of this shape. */
export type FigureComponent = ComponentType<FigureProps>

/** A point in the 200×200 figure coordinate space. */
export interface Joint {
  readonly x: number
  readonly y: number
}
