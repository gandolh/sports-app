import { FlameIcon } from "./icons.tsx";

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
  if (days <= 0) return null;
  return (
    <span
      role="img"
      className="inline-flex h-9 items-center gap-[var(--sp-1)] rounded-full border border-warn-line bg-warn-bg px-[var(--sp-3)] text-warn tabular-nums"
      aria-label={`${days} ${days === 1 ? "day" : "days"} in a row.`}
    >
      <FlameIcon size={16} />
      <span aria-hidden="true" className="text-[1rem] leading-none font-extrabold">
        {days}
      </span>
    </span>
  );
}
