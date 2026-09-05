import { FlameIcon } from './icons.tsx'

/**
 * Days in a row, in the `warn` hue, with a **drawn** flame.
 *
 * ── This is the exact place an emoji would have crept in ────────────────────
 *
 * 🔥 is one keystroke, needs no file, and is what every fitness app ships. It is
 * also a different typeface on every platform, unstyleable, immune to the
 * accent and to both themes, and the single loudest "assembled from defaults"
 * signal this interface could emit — on the one element a user looks at every
 * single day. `FlameIcon` is four path commands in `icons.tsx` and it is the
 * whole reason that file exists.
 *
 * ── Why `warn` and not the accent ───────────────────────────────────────────
 *
 * A streak is warm rather than semantic, and it must not compete with the ring
 * directly below it, which *is* the accent. `--warn` is a fixed hue that never
 * follows the accent (`tokens.css`), so the pill looks the same under all eight
 * and the ring stays the only accent-coloured thing in the top third of the
 * screen. It is not a warning and it does not read as one at this size, in a
 * pill, next to a number.
 *
 * ── Zero renders nothing ────────────────────────────────────────────────────
 *
 * A "0 day streak" badge is the app pointing at an absence. Somebody opening
 * this after a fortnight away is looking at the screen that most needs to feel
 * easy, and the honest render of no streak is no pill.
 */
export function StreakPill({ days }: { readonly days: number }) {
  if (days <= 0) return null
  return (
    // `role="img"` is not decoration: both children are aria-hidden — the icon
    // by default, the digit explicitly — so the label is the only accessible
    // content, and a bare span resolves to the generic role, which does not
    // reliably carry an author-supplied name. Ring and Heatmap already set it
    // on the same shape; this was the one place it was dropped, and the streak
    // is the element looked at most often. Testing-library's `getByText` reads
    // text content rather than the computed name, so no existing test caught it.
    <span
      role="img"
      className="inline-flex items-center gap-[var(--sp-1)] rounded-full bg-warn-bg py-[2px] pr-[var(--sp-2)] pl-[var(--sp-1)] text-meta font-bold text-warn tabular-nums"
      aria-label={`${days} ${days === 1 ? 'day' : 'days'} in a row.`}
    >
      <FlameIcon size={16} />
      <span aria-hidden="true">{days}</span>
    </span>
  )
}
