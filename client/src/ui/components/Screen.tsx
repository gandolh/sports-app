import type { ReactNode } from 'react'

/**
 * The three bands every screen is made of, and the reason they are a component
 * rather than a convention.
 *
 * The layout *is* the accessibility model. On a phone flat on the floor the
 * reaching arm occludes top-centre, so priority runs bottom-centre → bottom
 * edges → top-right → top-left → top-centre (worst). `Rail` therefore never
 * holds anything in the centre, and `Footer` is the only place a primary action
 * is allowed to be. Four screens each re-deriving that would produce four
 * different answers.
 *
 * There is deliberately **no bottom tab bar**: it is a named tell on a
 * two-destination app, and it would occupy exactly the band the primary needs.
 * The two secondary destinations live at the right end of the rail instead.
 */

export function Screen({ children }: { readonly children: ReactNode }) {
  return <div className="screen">{children}</div>
}

export interface RailProps {
  /** Glanced at, never aimed at. Kept to a few tabular characters. */
  readonly status: string
  /** Navigation and the one destructive control, at the right end. */
  readonly children?: ReactNode
}

export function Rail({ status, children }: RailProps) {
  return (
    <div className="rail">
      <div className="rail__inner">
        <span className="rail__status">{status}</span>
        <nav className="rail__links">{children}</nav>
      </div>
    </div>
  )
}

export function Body({ children }: { readonly children: ReactNode }) {
  return <main className="screen__body">{children}</main>
}

/**
 * Sticky, bottom-centre, and the only home for a primary action.
 *
 * `above` is the secondary row — the one thing permitted inside the primary's
 * 120px exclusion zone. Anything else interactive goes in `Body`.
 */
export function Footer({
  above,
  children,
}: {
  readonly above?: ReactNode
  readonly children: ReactNode
}) {
  return (
    <div className="footer">
      <div className="footer__inner">
        {above}
        {children}
      </div>
    </div>
  )
}
