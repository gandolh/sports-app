import { useEffect, useState } from 'react'
import { groupDigits } from './format.ts'
import { easeOutCubic, tween } from '../easing.ts'

/**
 * **The entire celebration budget of this app**: one count-up of the sessions
 * number on the finish screen. No confetti, no badge, no personal-record toast —
 * the app measures nothing, so it has nothing to award, and a trophy over a
 * prescription the user may or may not have completed would be a lie with an
 * animation on it.
 *
 * It is chrome motion confirming a state change, which is the only thing chrome
 * motion is for, so `prefers-reduced-motion` collapses it to the final value
 * rather than slowing it down. That decision is made in the initial state rather
 * than in the effect, so a reduced-motion user never sees a zero frame.
 */

const DURATION_MS = 520 // --dur-slow

/**
 * Whether to animate at all, answered once, before the first paint. `false` also
 * covers a test renderer with no `requestAnimationFrame`, where an effect that
 * never runs would otherwise leave the number stuck at zero.
 */
function shouldAnimate(value: number): boolean {
  if (value <= 0) return false
  if (typeof requestAnimationFrame !== 'function') return false
  try {
    return !(
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
  } catch {
    return false
  }
}

export function CountUp({
  value,
  className,
}: {
  readonly value: number
  readonly className?: string
}) {
  /**
   * Elapsed milliseconds, not normalised progress — the curve and the clamping
   * both live in `easing.tween` now, so this holds the one thing only the
   * component can know. Starts *finished* when there is nothing to animate, so a
   * reduced-motion user never sees a zero frame.
   */
  const [elapsedMs, setElapsedMs] = useState(() => (shouldAnimate(value) ? 0 : DURATION_MS))

  useEffect(() => {
    if (!shouldAnimate(value)) return
    let frame = 0
    const startedAt = performance.now()
    const step = (now: number): void => {
      const elapsed = now - startedAt
      setElapsedMs(elapsed)
      if (elapsed < DURATION_MS) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [value])

  // `easing.ts` owns the curve, the clamp, and the guarantee that the last frame
  // is exactly `value` rather than a hair short of it. Reading the clock is the
  // only part that has to happen here.
  return (
    <span className={className} aria-label={`${value}`}>
      {groupDigits(tween(0, value, elapsedMs, DURATION_MS, easeOutCubic))}
    </span>
  )
}
