import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { PlanIcon, ProgressIcon, TodayIcon, YouIcon } from './icons.tsx'
import type { IconProps } from './icons.tsx'

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
 * Brief 27 was split: 27a built Today and the player against the new shell and
 * left Plan and Progress as inert, `aria-disabled` cells pointing nowhere — the
 * route tree could not yet type-check a `to="/progress"` that did not exist.
 * 27b added both routes (`routes/plan.tsx`, `routes/progress.tsx`) and this file
 * lost its `Pending` branch along with it: every tab is now a real `Link`.
 */

export type TabKey = 'today' | 'plan' | 'progress' | 'you'

type TabTarget = '/' | '/plan' | '/progress' | '/account'

interface Tab {
  readonly key: TabKey
  readonly label: string
  readonly Icon: (props: IconProps) => ReactNode
  readonly to: TabTarget
}

const TABS: readonly Tab[] = [
  { key: 'today', label: 'Today', Icon: TodayIcon, to: '/' },
  { key: 'plan', label: 'Plan', Icon: PlanIcon, to: '/plan' },
  { key: 'progress', label: 'Progress', Icon: ProgressIcon, to: '/progress' },
  { key: 'you', label: 'You', Icon: YouIcon, to: '/account' },
]

/**
 * A cell. `min-h-[var(--tap-min)]` and `min-w` are not decoration: a 10px label
 * with a 24px icon is about 38px of content, and the floor is 44.
 */
const CELL =
  'grid min-h-[var(--tap-min)] place-items-center gap-[2px] py-[var(--sp-1)] ' +
  'text-label font-semibold tracking-[0.02em]'

function Inner({ tab }: { readonly tab: Tab }) {
  const { Icon, label } = tab
  return (
    <>
      <Icon size={24} />
      {label}
    </>
  )
}

export function TabBar({ active }: { readonly active: TabKey }) {
  return (
    <nav
      aria-label="Sections"
      className="pad-bottom-safe grid shrink-0 grid-cols-4 border-t border-line bg-s1 pt-[var(--sp-1)]"
    >
      {TABS.map((tab) => {
        const current = tab.key === active
        const tone = current ? 'text-accent' : 'text-tx3'
        return (
          <Link
            key={tab.key}
            to={tab.to}
            className={`${CELL} ${tone}`}
            {...(current ? { 'aria-current': 'page' as const } : {})}
          >
            <Inner tab={tab} />
          </Link>
        )
      })}
    </nav>
  )
}
