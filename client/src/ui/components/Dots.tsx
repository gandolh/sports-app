/**
 * The dots: three for a strength pattern, two for the daily core and posture
 * block, five for the cardio round.
 *
 * They are the app's only progress display and they are deliberately not a
 * progress bar. A bar implies a measured quantity; a dot means "I tapped Next
 * once", which is the only thing the app knows (corpus/wiki/decisions.md, the
 * governing decision).
 *
 * The fill scales in on `--ease-spring` — the single use of that curve in the
 * app. It is chrome motion confirming a state change, which is the one thing
 * chrome motion is for, and it is the whole of the feedback for a tap that has
 * no other consequence.
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
      className="dots"
      // One sentence rather than N list items: a screen reader reading
      // "dot, filled, dot, filled, dot" mid-set is noise, and the count is the
      // only thing anybody wants from it.
      role="img"
      aria-label={`${filled} of ${total} ${noun} marked`}
    >
      {Array.from({ length: total }, (_, index) => (
        <span key={index} className="dot" data-filled={index < filled}>
          <span className="dot__fill" />
        </span>
      ))}
    </div>
  )
}
