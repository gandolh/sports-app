/**
 * The countdown behind the ring. **Timestamp-based, never accumulating.**
 *
 * ── Why it never trusts `setInterval` ───────────────────────────────────────
 *
 * A phone lying on the floor mid-plank is the worst case for a timer: the tab is
 * backgrounded when the screen dims, throttled to once a minute, and intervals
 * are coalesced. A counter that does `remaining -= 1` on every tick drifts by
 * however long the app was throttled and then finishes late by that much. So
 * nothing here counts ticks. One timestamp is recorded when the user starts, and
 * every render computes `duration − elapsed` from the wall clock; the interval
 * exists only to provoke a re-render, and losing or duplicating a tick changes
 * nothing. Coming back from a backgrounded tab therefore shows the right number
 * immediately rather than the number the ticks got to.
 *
 * ── It gates nothing ────────────────────────────────────────────────────────
 *
 * This is orientative and it is the *only* thing in the app that reads a clock on
 * the user's behalf. It does not record, it is not consulted by anything that
 * advances state, and abandoning it costs nothing (corpus/wiki/decisions.md, the
 * governing decision). `finished` exists so the ring can settle on zero and one
 * announcement can fire — not so anything can be unlocked.
 */
import { useCallback, useEffect, useState } from 'react'

/** Coarse on purpose: the ring steps once per second, so four polls per second
 *  is already three more than the display can show. Cheaper than 60fps and still
 *  lands each step within ~250ms of the true second boundary. */
const POLL_MS = 250

/**
 * Seconds left, from a start instant. Pure — the whole of the timer's logic,
 * exported so it can be tested without a fake clock or a rendered component.
 *
 * `Math.ceil` rather than `floor`, so the display reads the full duration for the
 * first instant and only shows `0` when the time is genuinely up. With `floor` a
 * 30-second hold would show `29` immediately, which reads as a dropped second.
 */
export function remainingSeconds(
  startedAtMs: number,
  durationSeconds: number,
  nowMs: number,
): number {
  const left = durationSeconds - (nowMs - startedAtMs) / 1000
  return Math.min(Math.max(Math.ceil(left), 0), durationSeconds)
}

export interface Countdown {
  /** Seconds left. Equal to the duration while idle. */
  readonly remaining: number
  readonly running: boolean
  /** Started and reached zero. Stays true until `start` or `reset`. */
  readonly finished: boolean
  readonly start: () => void
  /** Abandon it. Next stays live either way — see the module header. */
  readonly reset: () => void
}

/**
 * A countdown of `durationSeconds`, idle until `start`.
 *
 * The hook holds a start timestamp, not a remaining count, which is what makes
 * the drift argument above hold.
 *
 * `resetKey` is what puts the clock back to idle when the *same* duration comes
 * round again: three sets of a 30-second hold are three separate clocks, and
 * `durationSeconds` alone cannot tell them apart. The player passes the set
 * position. Without it, set two would open showing set one's finished zero.
 *
 * The reset is derived during render from that key rather than done in an effect,
 * so there is no frame in which the previous set's clock is still on screen.
 */
export function useCountdown(durationSeconds: number, resetKey: string = ''): Countdown {
  const clockKey = `${durationSeconds}|${resetKey}`
  const [run, setRun] = useState<{ readonly key: string; readonly startedAtMs: number } | null>(null)
  const [nowMs, setNowMs] = useState<number>(() => Date.now())

  // A run belonging to a different key is a run of a different clock, so it does
  // not exist as far as this render is concerned.
  const startedAtMs = run !== null && run.key === clockKey ? run.startedAtMs : null
  const remaining =
    startedAtMs === null ? durationSeconds : remainingSeconds(startedAtMs, durationSeconds, nowMs)
  const running = startedAtMs !== null && remaining > 0

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNowMs(Date.now()), POLL_MS)
    // A backgrounded tab stops painting and the interval is throttled, so the
    // number is stale the instant the phone comes back. Recomputing on the
    // visibility change is what makes it correct rather than merely eventual.
    const onVisible = (): void => setNowMs(Date.now())
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [running])

  const start = useCallback(() => {
    const now = Date.now()
    setNowMs(now)
    setRun({ key: clockKey, startedAtMs: now })
  }, [clockKey])

  const reset = useCallback(() => setRun(null), [])

  return { remaining, running, finished: startedAtMs !== null && remaining === 0, start, reset }
}
