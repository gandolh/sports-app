import { useEffect, useId, useRef } from 'react'
import { animate } from 'animejs'
import { Eyebrow } from './Shell.tsx'

/**
 * The weekly-goal ring, and **the one authored moment in the whole app**.
 *
 * ── One moment per screen, and this is Today's ──────────────────────────────
 *
 * The motion rule for this build is one authored moment per screen, not
 * scattered effects: no staggered entrance on every card, no card that fades up
 * on scroll, no counting number on every tile. The ring winding from empty to
 * its value on arrival is that moment for Today, and the budget is spent. It
 * earns it because the sweep *is* the information — you see how much of the week
 * is done in the length of the arc before you have read the numeral.
 *
 * ── Why anime.js for this one thing ─────────────────────────────────────────
 *
 * `stroke-dashoffset` on an SVG attribute, eased over 1.2s. A CSS transition
 * would do it, and is the fallback below, but the value has to start at "empty"
 * and land on a number React computed — which in CSS means rendering the empty
 * state, waiting a frame, and then rendering the real one. That is a two-render
 * dance whose failure mode is a ring that silently never fills. anime.js drives
 * the element directly and the React-rendered attribute is already the final
 * value, so the animation is purely additive: if it never runs, the ring is
 * simply correct.
 *
 * That property is what makes the `try`/`catch` honest rather than defensive.
 * A test renderer, a browser with no `requestAnimationFrame`, an exception
 * inside the library — every one of them leaves a correct, static ring.
 *
 * ── Reduced motion ──────────────────────────────────────────────────────────
 *
 * Stopped entirely, not shortened. The countdown survives `prefers-reduced-
 * motion` because it is information changing over time; this is the same
 * information arriving all at once, and there is nothing lost by having it
 * already be there.
 *
 * ── The track is meant to be quiet ──────────────────────────────────────────
 *
 * `--grid0` is deliberately below the 3:1 floor against the canvas and
 * `contrast.test.ts` asserts that as a **ceiling**. It is decorative; the numeral
 * inside carries the value. Brightening it into a competing grey ring is a
 * documented regression, not a fix.
 */

// A 120-unit box. `r` and the stroke are in those units, so the ring scales
// with its CSS width and the geometry below stays readable as plain numbers.
const RADIUS = 50
const STROKE = 11
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const DURATION_MS = 1200

function prefersReducedMotion(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
  } catch {
    // A matchMedia that throws is a matchMedia that cannot be asked. Assume the
    // user did not opt out, which is the state the vast majority are in.
    return false
  }
}

export interface RingProps {
  /** `0 .. 1`. Clamped here as well as at the source; a ring past full reads as broken. */
  readonly fraction: number
  /** The numeral inside, already formatted: `62%`, or `4/7`. */
  readonly value: string
  /** The uppercase caption under it. Two or three words. */
  readonly caption: string
  /** The whole ring as one sentence, for a screen reader. */
  readonly label: string
}

export function Ring({ fraction, value, caption, label }: RingProps) {
  const progress = useRef<SVGCircleElement>(null)
  // One gradient per instance. Two rings on a page sharing a `<defs>` id is the
  // classic SVG bug where the second one silently paints with the first one's
  // stops — or with nothing, if the first unmounts.
  const gradientId = useId()

  const clamped = Math.min(Math.max(fraction, 0), 1)
  const offset = CIRCUMFERENCE * (1 - clamped)

  useEffect(() => {
    const element = progress.current
    if (element === null || prefersReducedMotion()) return
    try {
      animate(element, {
        strokeDashoffset: [CIRCUMFERENCE, offset],
        duration: DURATION_MS,
        ease: 'outExpo',
      })
    } catch {
      /* The attribute below already holds the final value. Nothing is lost. */
    }
  }, [offset])

  return (
    <div
      className="relative grid place-items-center py-[var(--sp-2)]"
      role="img"
      aria-label={label}
    >
      <svg viewBox="0 0 120 120" className="block h-[172px] w-[172px]" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="var(--accent-2)" />
            <stop offset="1" stopColor="var(--accent)" />
          </linearGradient>
        </defs>
        <circle
          cx="60"
          cy="60"
          r={RADIUS}
          fill="none"
          stroke="var(--grid0)"
          strokeWidth={STROKE}
        />
        <circle
          ref={progress}
          cx="60"
          cy="60"
          r={RADIUS}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={STROKE}
          strokeLinecap="round"
          // 12 o'clock, not 3 o'clock. A ring that fills from the right reads as
          // a dial; one that fills from the top reads as a proportion.
          transform="rotate(-90 60 60)"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute text-center" aria-hidden="true">
        <span className="block text-display leading-none font-extrabold tracking-[-0.04em] tabular-nums">
          {value}
        </span>
        <Eyebrow>{caption}</Eyebrow>
      </div>
    </div>
  )
}
