import type { HeatCell } from './history.ts'

/**
 * Forty-two days, fourteen to a row.
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
 * as fourteen quiet squares, which is what not training looks like — not as
 * fourteen accusations. The one place a missed day is ever marked is the plan
 * calendar, and it ships with an `<HonestNote>` next to it saying, in words,
 * that it costs nothing.
 *
 * ── Three levels, not a gradient ────────────────────────────────────────────
 *
 * Nothing, one session, two or more. That is every state this programme can
 * produce, and a five-step ramp over a three-valued dataset is a chart implying
 * precision it does not have. The middle step is a `color-mix` toward the accent
 * rather than a third token, so it follows all eight accents for free.
 *
 * ── One image, not 42 ───────────────────────────────────────────────────────
 *
 * `role="img"` on the grid with a one-sentence label. A screen reader walking 42
 * unlabelled cells is 42 seconds of nothing, and the sentence is the only thing
 * anyone wants from it.
 */

const FILL: Readonly<Record<HeatCell['level'], string>> = {
  0: 'bg-grid0',
  1: 'bg-[color-mix(in_srgb,var(--accent)_38%,var(--grid0))]',
  2: 'bg-accent',
}

export function Heatmap({ cells }: { readonly cells: readonly HeatCell[] }) {
  const trained = cells.filter((cell) => cell.level > 0).length

  return (
    <div className="mt-[var(--sp-4)]">
      <div
        role="img"
        aria-label={`Trained on ${trained} of the last ${cells.length} days.`}
        className="grid grid-cols-14 gap-[4px]"
      >
        {cells.map((cell) => (
          <span
            key={cell.key}
            className={`block aspect-square rounded-[3px] ${FILL[cell.level]}`}
          />
        ))}
      </div>
      {/* The key is `aria-hidden` because the grid's own label already says what
          the grid says. It exists for the eye: three unlabelled shades of the
          accent are not self-explanatory, and "less → more" is the shortest
          sentence that makes them so. */}
      <div
        aria-hidden="true"
        className="mt-[var(--sp-2)] flex items-center gap-[var(--sp-1)] text-label text-tx3"
      >
        <span className="mr-auto">Last {cells.length} days</span>
        <span>Less</span>
        <span className={`block h-[10px] w-[10px] rounded-[2px] ${FILL[0]}`} />
        <span className={`block h-[10px] w-[10px] rounded-[2px] ${FILL[1]}`} />
        <span className={`block h-[10px] w-[10px] rounded-[2px] ${FILL[2]}`} />
        <span>More</span>
      </div>
    </div>
  )
}
