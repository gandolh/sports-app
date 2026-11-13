import type { ReactNode } from "react";
import { useWide } from "./useMedia.ts";

/**
 * The bands every screen is made of.
 *
 * ── A fixed-height column, with the body as the only scroller ───────────────
 *
 * `h-[100dvh]` with `ShellBody` the one scrolling region, rather than letting the
 * document scroll. Two things depend on it: the footer's primary stays put while
 * the exercise list scrolls under it, and the tab bar does not need `position:
 * fixed` — which on iOS Safari would put it under the URL bar during momentum
 * scrolling and then snap it back. `dvh` rather than `vh` is the same fix from
 * the other side: `vh` on iOS is the tallest the viewport ever gets, so a `vh`
 * shell hides its own footer behind the browser chrome.
 *
 * ── Two layouts, one tree ───────────────────────────────────────────────────
 *
 * Phones keep the bottom bar: the footer over the tab bar, the date and the
 * streak in a thin rail. From 840px the four places move to a 64px bar across the
 * top (`TabBar` carries it, and `order-first` puts it there), the date and the
 * streak move into that bar, and the body holds a centred 1168px column. A
 * thumb's reach model still decides the phone: the primary action is bottom-centre,
 * nothing is aimed at the top-centre, and the rail only ever holds what is glanced at.
 */

export function Shell({ children }: { readonly children: ReactNode }) {
  return <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-bg text-tx">{children}</div>;
}

export interface ShellRailProps {
  /** Glanced at, never aimed at. The date, or the position in a session. */
  readonly children: ReactNode;
  /** The right end: a status pill, or the one control that leaves the screen. */
  readonly trailing?: ReactNode;
  /**
   * The screen carries the tab bar, so from 840px its date and streak are in the
   * top bar and the rail is not drawn.
   */
  readonly topBar?: boolean;
}

/**
 * The top strip on a phone. Nothing in the centre, ever.
 *
 * `pad-top-safe` pays back `viewport-fit=cover`: without it the rail's text sits
 * under the notch on a device that has one, and under the status bar on every
 * installed PWA.
 */
export function ShellRail({ children, trailing, topBar = false }: ShellRailProps) {
  const wide = useWide();
  if (wide && topBar) return null;
  return (
    <div className="shrink-0 pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex min-h-[var(--tap-min)] w-full max-w-[1168px] items-center justify-between gap-[var(--sp-3)] px-[var(--sp-4)] pt-[var(--sp-2)] max-[389px]:min-h-9 max-[389px]:px-[var(--sp-3)] max-[389px]:pt-[var(--sp-1)] min-[840px]:px-6">
        <span className="text-meta font-medium text-tx2 tabular-nums">{children}</span>
        {trailing === undefined ? null : <div className="flex items-center">{trailing}</div>}
      </div>
    </div>
  );
}

export interface ShellTitleProps {
  readonly title: string;
  readonly subtitle?: string;
  /**
   * `day` is the screen's big title (40px on a phone; from 840px a head band of
   * its own, 48px, with the facts beside it); `movement` is the 28px one for a
   * long sentence.
   *
   * Two sizes rather than one, because they answer different questions from
   * different distances. "Legs day" is read once, from arm's length, before you
   * are on the floor. "There is already a training history on this browser" is a
   * sentence, and at 40px it wraps to four lines.
   */
  readonly size?: "day" | "movement";
}

/** The facts line, split on its separators for the head band's dividers. */
function facts(subtitle: string): readonly string[] {
  return subtitle.split(" · ");
}

export function ShellTitle({ title, subtitle, size = "day" }: ShellTitleProps) {
  const wide = useWide();
  if (size === "movement") {
    return (
      <div className="pt-[var(--sp-2)] pb-[var(--sp-2)]">
        <h1 className="text-title leading-[var(--lh-title)] font-bold tracking-[var(--ls-title)] text-balance">
          {title}
        </h1>
        {subtitle === undefined ? null : <p className="mt-[var(--sp-1)] text-meta text-tx2 tabular-nums">{subtitle}</p>}
      </div>
    );
  }
  return (
    <div className="pt-[2px] pb-[var(--sp-2)] min-[840px]:mb-[var(--sp-4)] min-[840px]:flex min-[840px]:flex-wrap min-[840px]:items-center min-[840px]:justify-between min-[840px]:gap-x-8 min-[840px]:gap-y-2 min-[840px]:rounded-lg min-[840px]:border min-[840px]:border-line min-[840px]:bg-s1 min-[840px]:px-7 min-[840px]:py-4 min-[840px]:shadow-1">
      <h1 className="text-display leading-[1.1] font-extrabold tracking-[var(--ls-display)] text-balance max-[370px]:text-[2.25rem] min-[840px]:text-display-l min-[840px]:leading-[var(--lh-display-l)]">
        {title}
      </h1>
      {subtitle === undefined ? null : wide ? (
        <p className="flex text-body text-tx2 tabular-nums">
          {facts(subtitle).map((fact, index) => (
            <span key={fact} className={index === 0 ? "" : "ml-4 border-l border-line2 pl-4"}>
              {fact}
            </span>
          ))}
        </p>
      ) : (
        <p className="mt-[var(--sp-1)] text-meta text-tx2 tabular-nums">{subtitle}</p>
      )}
    </div>
  );
}

export interface ShellBodyProps {
  readonly children: ReactNode;
  /** One column, 40rem: for the screens that are a single stack of cards. */
  readonly narrow?: boolean;
}

/**
 * The one scrolling region. Everything above and below it is chrome.
 *
 * `overscroll-contain` stops a flick at the end of the exercise list from
 * rubber-banding the whole page — on an installed PWA that reveals the OS
 * background, which reads as the app having come apart.
 */
export function ShellBody({ children, narrow = false }: ShellBodyProps) {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div
        className={
          "mx-auto w-full px-[var(--sp-4)] pb-[var(--sp-6)] max-[389px]:px-[var(--sp-3)] " +
          "min-[840px]:px-[var(--sp-6)] min-[840px]:pt-[var(--sp-4)] min-[840px]:pb-[var(--sp-10)] " +
          (narrow ? "max-w-[40rem]" : "max-w-[1168px]")
        }
      >
        {children}
      </div>
    </main>
  );
}

/**
 * The primary band. The only place a primary action is allowed to be on a phone.
 *
 * `above` is for the secondary row and the one line of prose that explains it.
 * It is a `grid` with a gap rather than margins so that a screen with no
 * secondary row (the finish page) closes up on its own with no conditional
 * spacing. The band is solid `--s1` with a hairline and `--sh-2` above the tab bar.
 */
export function ShellFooter({ above, children }: { readonly above?: ReactNode; readonly children: ReactNode }) {
  return (
    <div className="shrink-0 border-t border-line bg-s1 shadow-2">
      <div className="mx-auto grid w-full max-w-[30rem] gap-[var(--sp-2)] px-[var(--sp-4)] py-[var(--sp-2)] max-[389px]:px-[var(--sp-3)]">
        {above}
        {children}
      </div>
    </div>
  );
}

/**
 * The micro-label: tile captions, disclosure headings, the unit under a numeral.
 * Sentence case at `--fs-label`, weight 600; nothing in the app is set in
 * tracked capitals.
 */
export function Eyebrow({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return <span className={`text-label font-semibold whitespace-nowrap ${className ?? "text-tx2"}`}>{children}</span>;
}

/**
 * A section heading inside the body. `h2`, so the document outline stays a tree
 * — every screen's `h1` is its `ShellTitle`.
 */
export function SectionHeading({ children }: { readonly children: ReactNode }) {
  return (
    <h2 className="mt-[var(--sp-6)] mb-[var(--sp-2)] text-body font-bold tracking-[var(--ls-title)]">{children}</h2>
  );
}
