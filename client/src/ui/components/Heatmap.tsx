import type { GridCell, GridWeek, HeatCell } from "./history.ts";
import { formatShortDate } from "./format.ts";

/**
 * The last six weeks, a row to a week, Monday first.
 *
 * ── What this costs, stated once ────────────────────────────────────────────
 *
 * "No streak, no heatmap, no red squares, no debt" was a locked decision until
 * 2026-09-04, and the property it bought was that **returning after two weeks
 * looked identical to returning after one day** — the app's worst moment,
 * answered by construction. This grid is the single most literal reversal of
 * that (corpus/wiki/reversals.md), and the cost is now owed a design answer
 * rather than avoided.
 *
 * The answer is in what the empty cell is: `--grid0`, the same quiet fill as the
 * unstarted part of the progress ring, deliberately below the 3:1 floor.
 * **There is no missed state and no red.** A fortnight of not training renders
 * as quiet squares, which is what not training looks like — not as accusations.
 * The days still to come are outlines, so the rectangle is whole and nothing
 * pretends they have happened.
 *
 * ── Three levels, not a gradient ────────────────────────────────────────────
 *
 * Nothing, one session, two or more: the accent, then the accent's second hue.
 * That is every state this programme can produce.
 *
 * ── One image, not 42 ───────────────────────────────────────────────────────
 *
 * The grid is one `role="img"` with a count, because 42 unlabelled squares are
 * 42 stops of nothing for a screen reader. The count comes from the 42-day
 * window (`heatmap()`), not from the cells drawn, so no number is invented. The
 * cells are capped at 28 by 14 px: a wider card does not stretch the grid.
 */

const FILL: Readonly<Record<GridCell["level"], string>> = {
  0: "bg-grid0",
  1: "bg-accent",
  2: "bg-accent-2",
};

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

const COLUMNS = "grid grid-cols-[44px_repeat(7,28px)] gap-[var(--sp-1)]";

export function Heatmap({
  last42,
  weeks,
}: {
  readonly last42: readonly HeatCell[];
  readonly weeks: readonly GridWeek[];
}) {
  const trained = last42.filter((cell) => cell.level > 0).length;

  return (
    <div className="mt-[var(--sp-4)]">
      <div aria-hidden="true" className={COLUMNS}>
        <span />
        {DAYS.map((day, index) => (
          <span key={index} className="pb-[var(--sp-1)] text-center text-label leading-4 font-semibold text-tx2">
            {day}
          </span>
        ))}
      </div>
      <div
        role="img"
        aria-label={`Trained on ${trained} of the last ${last42.length} days.`}
        className="grid gap-[var(--sp-1)]"
      >
        {weeks.map((week) => (
          <div key={week.monday.getTime()} className={COLUMNS}>
            <span aria-hidden="true" className="self-center text-label leading-4 font-medium text-tx2 tabular-nums">
              {formatShortDate(week.monday)}
            </span>
            {week.cells.map((cell) => (
              <span
                key={cell.key}
                className={
                  "block h-[14px] rounded-[4px] " +
                  (cell.future ? "shadow-[inset_0_0_0_1px_var(--line)]" : FILL[cell.level])
                }
              />
            ))}
          </div>
        ))}
      </div>
      {/* The key is `aria-hidden` because the grid's own label already says what
          the grid says. It exists for the eye: shades of the accent are not
          self-explanatory, and "less → more" is the shortest sentence that makes
          them so. */}
      <div
        aria-hidden="true"
        className="mt-[var(--sp-3)] flex items-center justify-between text-label leading-4 font-semibold text-tx2"
      >
        <span className="tabular-nums">Last {last42.length} days</span>
        <span className="flex items-center gap-[var(--sp-2)]">
          Less
          <span className={`block size-[14px] rounded-[4px] ${FILL[0]}`} />
          <span className={`block size-[14px] rounded-[4px] ${FILL[1]}`} />
          <span className={`block size-[14px] rounded-[4px] ${FILL[2]}`} />
          More
        </span>
      </div>
    </div>
  );
}
