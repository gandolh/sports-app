import { Eyebrow } from './Shell.tsx'

/**
 * Three numbers in a row, and the rule that keeps them from becoming six.
 *
 * A tile is for a number a person would otherwise have to count. Sessions
 * completed, days in a row, reps ever — each one is a fact about what has
 * happened, and none of them is a judgement about it. Nothing derived from a
 * target belongs here ("83% of plan"), and nothing that changes what the app
 * does belongs here either: **no tile value reaches `prescribe()`**, which is
 * the governing invariant (corpus/CLAUDE.md) and the reason a wall of stats is
 * safe to show at all.
 *
 * `tabular-nums` on every value, unconditionally. These are the numbers that
 * change, they sit in a three-column grid, and proportional digits make the row
 * visibly jitter between a `1` week and a `4` week.
 *
 * `note` is the small accent line under a value — a delta, or "of 9". It is
 * optional and usually absent: on Today all three tiles are bare counts, because
 * a delta on "sessions completed" would be comparing you to yourself.
 */

export interface Stat {
  /** Already formatted. `4,218`, `18`, `R5`. */
  readonly value: string
  readonly label: string
  readonly note?: string
  /** The tile as one sentence. Without it the row reads as "142 18 4,218". */
  readonly srLabel: string
}

export function StatTiles({ stats }: { readonly stats: readonly Stat[] }) {
  return (
    <ul className="mt-[var(--sp-3)] grid grid-cols-3 gap-[var(--sp-2)]">
      {stats.map((stat) => (
        <li
          key={stat.label}
          className="rounded border border-line bg-s1 px-[var(--sp-2)] py-[var(--sp-2)] text-center shadow-1"
        >
          <span className="sr-only">{stat.srLabel}</span>
          <span
            aria-hidden="true"
            className="block text-h leading-none font-bold tracking-[-0.03em] tabular-nums"
          >
            {stat.value}
          </span>
          <span aria-hidden="true" className="mt-[var(--sp-1)] block">
            <Eyebrow>{stat.label}</Eyebrow>
          </span>
          {stat.note === undefined ? null : (
            <span
              aria-hidden="true"
              className="mt-[1px] block text-label font-semibold text-accent tabular-nums"
            >
              {stat.note}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}
