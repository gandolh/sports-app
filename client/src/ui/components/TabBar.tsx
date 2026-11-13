import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useWide } from "./useMedia.ts";
import { formatLongDate } from "./format.ts";
import { PlanIcon, ProgressIcon, TodayIcon, YouIcon } from "./icons.tsx";
import type { IconProps } from "./icons.tsx";

/**
 * The four-item bottom bar: Today · Plan · Progress · You.
 *
 * ── It is not on every screen, and that is the point ────────────────────────
 *
 * The player has no tab bar. A session is a mode, not a destination, and putting
 * three ways out of it along the bottom edge — directly under the thumb that is
 * about to press Next — is how a mis-tap ends a set. The four screens that get
 * one are the four you navigate *between*; the player is the one you navigate
 * *into*, and it leaves through a single control in the rail.
 *
 * ── Active state ────────────────────────────────────────────────────────────
 *
 * The `active` prop, passed by the screen. Not derived from the router's
 * location, deliberately: `/` is Today and `/account` is You, but the player
 * also lives at `/` with search params and must not light a tab, and a screen
 * that knows which of the four it is cannot get it wrong. `aria-current="page"`
 * is the announced half; the accent colour is the seen half; the two are set
 * from the same value.
 *
 * ── All four routes exist now ───────────────────────────────────────────────
 *
 * The 2026-09-04 rebuild was split: its first half built Today and the player against the new shell and
 * left Plan and Progress as inert, `aria-disabled` cells pointing nowhere — the
 * route tree could not yet type-check a `to="/progress"` that did not exist.
 * The second half added both routes (`routes/plan.tsx`, `routes/progress.tsx`) and this file
 * lost its `Pending` branch along with it: every tab is now a real `Link`.
 */

export type TabKey = "today" | "plan" | "progress" | "you";

type TabTarget = "/" | "/plan" | "/progress" | "/account";

interface Tab {
  readonly key: TabKey;
  readonly label: string;
  readonly Icon: (props: IconProps) => ReactNode;
  readonly to: TabTarget;
}

const TABS: readonly Tab[] = [
  { key: "today", label: "Today", Icon: TodayIcon, to: "/" },
  { key: "plan", label: "Plan", Icon: PlanIcon, to: "/plan" },
  { key: "progress", label: "Progress", Icon: ProgressIcon, to: "/progress" },
  { key: "you", label: "You", Icon: YouIcon, to: "/account" },
];

/**
 * A cell on a phone: a 24px icon over a 13px label, 56px tall.
 */
const CELL = "grid min-h-[56px] place-items-center content-center gap-[2px] text-label leading-4 font-semibold";

function Inner({ tab }: { readonly tab: Tab }) {
  const { Icon, label } = tab;
  return (
    <>
      <Icon size={24} />
      {label}
    </>
  );
}

export interface TabBarProps {
  readonly active: TabKey;
  /**
   * The right end of the top bar from 840px: the date and the streak. Left out,
   * the bar shows the date alone.
   */
  readonly trailing?: ReactNode;
}

/**
 * The four places. On a phone the bar sits at the foot, `--s1` with a `--line2`
 * head; from 840px the same links become a 64px bar across the top (`order-first`
 * in the shell's column), the current place underlined in the accent, and the date
 * and streak at its right end.
 */
export function TabBar({ active, trailing }: TabBarProps) {
  const wide = useWide();
  const links = TABS.map((tab) => {
    const current = tab.key === active;
    const mark = current ? { "aria-current": "page" as const } : {};
    if (wide) {
      return (
        <Link
          key={tab.key}
          to={tab.to}
          {...mark}
          className={
            "-mb-px flex items-center gap-[var(--sp-2)] border-b-[3px] px-[var(--sp-4)] text-meta font-semibold " +
            (current ? "border-accent text-accent" : "border-transparent text-tx2")
          }
        >
          <tab.Icon size={22} />
          <span>{tab.label}</span>
        </Link>
      );
    }
    return (
      <Link key={tab.key} to={tab.to} {...mark} className={`${CELL} ${current ? "text-accent" : "text-tx2"}`}>
        <Inner tab={tab} />
      </Link>
    );
  });

  if (wide) {
    return (
      <header className="sticky top-0 z-[var(--z-rail)] order-first flex h-16 shrink-0 items-stretch justify-between border-b border-line2 bg-s1 px-[max(24px,calc((100%-1120px)/2))]">
        <nav aria-label="Sections" className="-ml-4 flex gap-[var(--sp-1)]">
          {links}
        </nav>
        <div className="flex items-center gap-[var(--sp-4)] text-meta font-medium text-tx2 tabular-nums">
          {trailing ?? formatLongDate(new Date())}
        </div>
      </header>
    );
  }
  return (
    <nav aria-label="Sections" className="pad-bottom-safe grid shrink-0 grid-cols-4 border-t border-line2 bg-s1">
      {links}
    </nav>
  );
}
