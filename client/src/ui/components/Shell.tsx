import type { ReactNode } from 'react'

/**
 * The bands every screen is made of, rebuilt for the category standard.
 *
 * ── This replaces `Screen.tsx`, and one of its rules is reversed ────────────
 *
 * `Screen.tsx` said, at length, that there is deliberately **no bottom tab
 * bar** — "a named tell on a two-destination app, and it would occupy exactly
 * the band the primary needs". That was true of a two-destination app. The v3
 * direction round took the app to four destinations and chose the category
 * standard on purpose, and a four-item tab bar is how that category navigates.
 * The half of the old argument that survives is the second half, and it is why
 * `ShellFooter` and `TabBar` are two separate bands stacked rather than one
 * crowded strip: the primary action still gets its own full-width row, above
 * the bar, never beside it.
 *
 * `Screen.tsx` was the previous version of this band layout. It and `app.css`
 * were deleted on 2026-09-04 once `/account`, `/login` and the root 404 had been
 * ported here and `/week` had become `/plan`.
 *
 * ── The layout is still the accessibility model ─────────────────────────────
 *
 * Unchanged from the file this replaces, because the physics did not change: on
 * a phone flat on the floor the reaching arm occludes top-centre, so priority
 * runs bottom-centre → bottom edges → top-right → top-left → top-centre
 * (worst). `ShellRail` therefore never holds anything in the centre, and
 * `ShellFooter` is the only place a primary action is allowed to be.
 *
 * ── Why the shell is a fixed-height flex column ─────────────────────────────
 *
 * `h-[100dvh]` with the body as the only scroller, rather than letting the
 * document scroll. Two things depend on it: the footer's primary stays put while
 * the exercise list scrolls under it, and the tab bar does not need `position:
 * fixed` — which on iOS Safari would put it under the URL bar during momentum
 * scrolling and then snap it back. `dvh` rather than `vh` is the same fix from
 * the other side: `vh` on iOS is the tallest the viewport ever gets, so a `vh`
 * shell hides its own footer behind the browser chrome.
 */

export function Shell({ children }: { readonly children: ReactNode }) {
  return (
    // `max-w` + `mx-auto` rather than a full-bleed column. This is a phone app
    // and every measure below is tuned for one, so on a laptop — where the app
    // is rehearsed, screenshotted and reviewed — an unconstrained shell puts a
    // 16px cue at 1280px wide and a tab bar with a hand's width between its
    // items. The cap is above any phone in circulation, so it never engages on
    // the device the design is actually for.
    <div className="mx-auto flex h-[100dvh] w-full max-w-[30rem] flex-col overflow-hidden bg-bg text-tx">
      {children}
    </div>
  )
}

export interface ShellRailProps {
  /** Glanced at, never aimed at. The date, or the position in a session. */
  readonly children: ReactNode
  /** The right end: a status pill, or the one control that leaves the screen. */
  readonly trailing?: ReactNode
}

/**
 * The top strip. Nothing in the centre, ever — see the header.
 *
 * `pad-top-safe` pays back `viewport-fit=cover`: without it the rail's text sits
 * under the notch on a device that has one, and under the status bar on every
 * installed PWA.
 */
export function ShellRail({ children, trailing }: ShellRailProps) {
  return (
    <div className="pad-top-safe flex shrink-0 items-center justify-between gap-[var(--sp-2)] px-[var(--sp-4)] pb-[var(--sp-2)]">
      <span className="text-meta font-medium text-tx2 tabular-nums">{children}</span>
      {trailing === undefined ? null : <div className="flex items-center">{trailing}</div>}
    </div>
  )
}

export interface ShellTitleProps {
  readonly title: string
  readonly subtitle?: string
  /**
   * `day` is the Today screen's 40px title; `movement` is the player's 28px one.
   *
   * Two sizes rather than one, because they answer different questions from
   * different distances. "Push day" is read once, from arm's length, before you
   * are on the floor. "Full push-up, 3s lowering" is read mid-set, from further
   * away, and it is four times as long — set at 40px it wraps to three lines and
   * pushes the rep target under the fold.
   */
  readonly size?: 'day' | 'movement'
}

export function ShellTitle({ title, subtitle, size = 'day' }: ShellTitleProps) {
  return (
    <div className="shrink-0 px-[var(--sp-4)] pb-[var(--sp-2)]">
      <h1
        className={
          size === 'day'
            ? 'text-display leading-[var(--lh-display)] font-extrabold tracking-[var(--ls-display)] text-balance'
            : 'text-title leading-[var(--lh-title)] font-bold tracking-[var(--ls-title)] text-balance'
        }
      >
        {title}
      </h1>
      {subtitle === undefined ? null : (
        <p className="mt-[var(--sp-1)] text-meta text-tx2 tabular-nums">{subtitle}</p>
      )}
    </div>
  )
}

/**
 * The one scrolling region. Everything above and below it is chrome.
 *
 * `overscroll-contain` stops a flick at the end of the exercise list from
 * rubber-banding the whole page — on an installed PWA that reveals the OS
 * background, which reads as the app having come apart.
 */
export function ShellBody({ children }: { readonly children: ReactNode }) {
  return (
    <main className="flex-1 overflow-y-auto overscroll-contain px-[var(--sp-4)] pb-[var(--sp-4)]">
      {children}
    </main>
  )
}

/**
 * The primary band. The only place a primary action is allowed to be.
 *
 * `above` is for the secondary row and the one line of prose that explains it —
 * the only things permitted inside the primary's exclusion zone. It is a `grid`
 * with a gap rather than margins so that a screen with no secondary row (the
 * finish page) closes up on its own with no conditional spacing.
 */
export function ShellFooter({
  above,
  children,
}: {
  readonly above?: ReactNode
  readonly children: ReactNode
}) {
  return (
    <div className="grid shrink-0 gap-[var(--sp-2)] bg-bg px-[var(--sp-4)] pt-[var(--sp-2)] pb-[var(--sp-3)]">
      {above}
      {children}
    </div>
  )
}

/**
 * The uppercase micro-label: tile captions, disclosure headings, the unit under
 * a numeral.
 *
 * `--fs-label` is the ONLY size in the system that is allowed to be uppercase
 * (`tokens.css`), so this component is also the enforcement of that: there is
 * one `uppercase` in the components tree and it is here.
 */
export function Eyebrow({
  children,
  className,
}: {
  readonly children: ReactNode
  readonly className?: string
}) {
  return (
    <span
      className={`text-label font-bold uppercase tracking-[var(--ls-label)] ${className ?? 'text-tx3'}`}
    >
      {children}
    </span>
  )
}

/**
 * A section heading inside the body. `h2`, so the document outline stays a tree
 * — every screen's `h1` is its `ShellTitle`.
 */
export function SectionHeading({ children }: { readonly children: ReactNode }) {
  return (
    <h2 className="mt-[var(--sp-5)] mb-[var(--sp-1)] text-meta font-bold tracking-[var(--ls-title)]">
      {children}
    </h2>
  )
}
