/**
 * Keep the screen on for the length of a session, where the browser lets us.
 *
 * The phone is on the floor and the user's hands are on the floor too, so the
 * screen dimming between sets means wiping a hand on a shirt to see the next
 * cue. `navigator.wakeLock` fixes that on Chromium; Safari has no
 * implementation. So this is **capability-checked with a silent no-op
 * fallback** — a missing API is the ordinary case, not a failure, and there is
 * nothing to tell the user that they could act on.
 *
 * Two behaviours that look like defensiveness and are not:
 *
 *   - **A sentinel is released by the browser whenever the page hides**, and it
 *     is not restored on return. So a lock has to be re-requested on
 *     `visibilitychange`, or it silently stops working the first time the user
 *     takes a call mid-session.
 *   - **`request()` rejects**, not just resolves false — a hidden document, a
 *     denied permission policy, a browser that removed the API mid-session.
 *     Every path is caught, because a rejected screen lock must never surface as
 *     an error on top of a workout.
 */
import { useEffect } from 'react'

interface WakeLockSentinelLike {
  readonly released: boolean
  release(): Promise<void>
}

interface WakeLockLike {
  request(type: 'screen'): Promise<WakeLockSentinelLike>
}

function readWakeLock(): WakeLockLike | null {
  try {
    const nav = globalThis.navigator as (Navigator & { wakeLock?: WakeLockLike }) | undefined
    const lock = nav?.wakeLock
    return lock && typeof lock.request === 'function' ? lock : null
  } catch {
    return null
  }
}

/** Whether this browser can hold a screen lock at all. Safari cannot. */
export function isScreenLockSupported(): boolean {
  return readWakeLock() !== null
}

/**
 * Hold a screen wake lock while `active`. Does nothing where unsupported.
 *
 * Deliberately fire-and-forget in both directions: acquiring is async and
 * nothing waits for it, and the release on unmount is not awaited either,
 * because the component is already gone and a pending promise cannot report
 * anything useful.
 */
export function useScreenAwake(active: boolean): void {
  useEffect(() => {
    const wakeLock = readWakeLock()
    if (!wakeLock || !active) return

    let cancelled = false
    let sentinel: WakeLockSentinelLike | null = null

    const acquire = async (): Promise<void> => {
      // Requesting while hidden always rejects, so don't.
      if (document.visibilityState !== 'visible') return
      if (sentinel !== null && !sentinel.released) return
      try {
        const next = await wakeLock.request('screen')
        if (cancelled) {
          void next.release().catch(() => {})
          return
        }
        sentinel = next
      } catch {
        // Unsupported, denied, or the document went hidden mid-request. The
        // session is unaffected; there is nothing to report.
      }
    }

    void acquire()
    // The browser drops the lock on hide and does not give it back.
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') void acquire()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      if (sentinel !== null && !sentinel.released) void sentinel.release().catch(() => {})
    }
  }, [active])
}
