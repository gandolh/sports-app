import type { ReactNode } from 'react'

/**
 * The countdown ring. **Orientative, and it gates nothing.**
 *
 * This is one of exactly two things in the app that animate as *content* rather
 * than to confirm a state change, and the design system spells out why: a smooth
 * 60fps sweep reads as a loading spinner, a ring that steps once per second
 * reads as a clock. The stepping comes from `useCountdown`, which recomputes
 * from a timestamp; this component only draws whatever number it is handed and
 * eases each step over `--dur-fast`. Under `prefers-reduced-motion` that
 * duration collapses to 1ms and the ring stays — it is information, not
 * decoration, and it is the one thing on this screen a reduced-motion user still
 * needs to see move.
 *
 * ── Two accessibility decisions that are not negotiable ─────────────────────
 *
 *   - **The numeral is `aria-hidden` and there is no `aria-live` on it.** A
 *     per-second value in a live region announces sixty times per minute, which
 *     makes the app unusable with a screen reader on precisely the screen that
 *     matters most. The container carries `role="timer"`, and one polite region
 *     fires at ten seconds and at zero, and nowhere else. The third
 *     announcement the design calls for — the set transition — is the player's,
 *     because it happens on rep exercises too where there is no clock at all.
 *   - **The track is intentionally below 3:1** against the canvas. It is
 *     decorative; the numeral inside carries the value. Brightening it into a
 *     competing grey ring is a documented regression, not a fix.
 */

// A 100×100 user-space box, so the ring scales with its CSS width and the
// geometry below stays readable as plain numbers.
const RADIUS = 45
const STROKE = 6
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export interface CountdownRingProps {
  readonly total: number
  readonly remaining: number
  /** False before the first tap of start. The ring is then empty, not full. */
  readonly started: boolean
  /** The `role="timer"` label, e.g. `30 second hold`. */
  readonly label: string
  /** The numeral, and its unit. Rendered inside the ring. */
  readonly children: ReactNode
}

export function CountdownRing({ total, remaining, started, label, children }: CountdownRingProps) {
  const announcement = announcementFor(started, remaining)
  const fraction = total > 0 ? Math.min(Math.max(remaining / total, 0), 1) : 0
  // Idle draws nothing, so the first tap of start winds the ring up to full and
  // it drains from there. A full accent ring while idle reads as "finished".
  const offset = started ? CIRCUMFERENCE * (1 - fraction) : CIRCUMFERENCE

  return (
    <>
      <div
        className="relative mt-[var(--sp-3)] grid place-items-center"
        role="timer"
        aria-label={label}
      >
        <svg
          viewBox="0 0 100 100"
          className="block h-[13rem] w-[13rem]"
          aria-hidden="true"
          focusable="false"
        >
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            stroke="var(--grid0)"
            strokeWidth={STROKE}
          />
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={STROKE}
            strokeLinecap="round"
            transform="rotate(-90 50 50)"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            style={{
              transition: 'stroke-dashoffset var(--dur-fast) var(--ease-out)',
            }}
          />
        </svg>
        <div className="absolute text-center" aria-hidden="true">
          {children}
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </>
  )
}

/**
 * Exactly two announcements per run, and **no state at all**.
 *
 * A live region announces when its content *changes*, so mapping every second
 * onto one of three strings gives each announcement exactly once for free: the
 * text is `''` from the top down to eleven, `Ten seconds left.` for every second
 * from ten to one — unchanged, therefore silent — and `Time.` at zero. A version
 * of this that tracked "have I announced yet" in a ref was doing the live
 * region's own job in worse handwriting.
 *
 * Banding on `<= 10` rather than `=== 10` also means a throttled tab that jumps
 * from twelve to eight still announces.
 */
function announcementFor(started: boolean, remaining: number): string {
  if (!started) return ''
  if (remaining === 0) return 'Time.'
  if (remaining <= 10) return 'Ten seconds left.'
  return ''
}
