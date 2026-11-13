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
  readonly value: string;
  readonly label: string;
  readonly note?: string;
  /** The tile as one sentence. Without it the row reads as "142 18 4,218". */
  readonly srLabel: string;
}

export function StatTiles({
  stats,
  layout = "rows",
}: {
  readonly stats: readonly Stat[];
  /** `rows`: thin tiles stacked beside the ring. `columns`: three totals in one card, divided. */
  readonly layout?: "rows" | "columns";
}) {
  if (layout === "columns") {
    return (
      <ul className="grid grid-cols-3">
        {stats.map((stat, index) => (
          <li
            key={stat.label}
            className={
              "grid content-start justify-items-center gap-[2px] px-[var(--sp-2)] pt-[var(--sp-4)] pb-[var(--sp-3)] text-center min-[840px]:px-[var(--sp-3)] min-[840px]:py-[var(--sp-5)] " +
              (index === 0 ? "" : "border-l border-line")
            }
          >
            <span className="sr-only">{stat.srLabel}</span>
            <span
              aria-hidden="true"
              className="text-[2rem] leading-[1.1] font-extrabold tabular-nums tracking-[-0.02em] min-[840px]:text-[2.5rem]"
            >
              {stat.value}
            </span>
            <span aria-hidden="true" className="text-label leading-[1.15] font-semibold text-tx2 min-[840px]:text-meta">
              {stat.label}
            </span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="grid min-w-0 flex-1 gap-[var(--sp-2)]">
      {stats.map((stat) => (
        <li
          key={stat.label}
          className="flex h-8 items-center justify-between gap-[var(--sp-2)] rounded-[10px] bg-s2 px-[var(--sp-3)]"
        >
          <span className="sr-only">{stat.srLabel}</span>
          <span aria-hidden="true" className="text-label leading-4 font-semibold text-tx2">
            {stat.label}
          </span>
          <span aria-hidden="true" className="text-[1.125rem] leading-[1.1] font-extrabold tabular-nums">
            {stat.value}
          </span>
        </li>
      ))}
    </ul>
  );
}
