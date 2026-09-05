/**
 * The set dots: three for a strength pattern, two for the daily core and posture
 * block, five for the cardio round.
 *
 * ── Still not a progress bar, even now that they are bars ───────────────────
 *
 * They are drawn as short capsules rather than circles, in the category
 * standard's shape language, and that is the only thing about them brief 27
 * changed. What they mean did not: a filled dot means **"I tapped Next once"**,
 * which is the only thing the app knows for certain. It does not mean a set was
 * completed to standard, and it does not mean anything was logged — logging is
 * optional and skipping it is the default path through the player.
 *
 * A single continuous bar would imply a measured quantity and would blur the
 * boundary between three sets and one long one. Three separate capsules with a
 * gap cannot: you can count them, and the count is the whole claim.
 *
 * The fill transitions on `--ease-spring`, the app's one use of that curve. It
 * is chrome motion confirming a state change — the whole of the feedback for a
 * tap whose only other consequence is a number in the URL — and it collapses to
 * 1ms under `prefers-reduced-motion` along with every other `--dur-*`.
 */

export interface DotsProps {
  readonly filled: number
  readonly total: number
  /** What the dots are counting, for the screen-reader sentence: `sets`, `rounds`. */
  readonly noun: string
}

export function Dots({ filled, total, noun }: DotsProps) {
  return (
    <div
      className="flex justify-center gap-[var(--sp-1)]"
      // One sentence rather than N list items: a screen reader reading
      // "dot, filled, dot, filled, dot" mid-set is noise, and the count is the
      // only thing anybody wants from it.
      role="img"
      aria-label={`${filled} of ${total} ${noun} marked`}
    >
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          data-filled={index < filled}
          className={
            'block h-[6px] w-[2.1rem] rounded-full transition-colors ' +
            'duration-[var(--dur-base)] ease-[var(--ease-spring)] ' +
            (index < filled ? 'bg-accent' : 'bg-s3')
          }
        />
      ))}
    </div>
  )
}
