// Node environment: `remainingSeconds` is the whole of the countdown's logic and
// it is a pure function of three numbers, which is the reason it is exported
// separately from the hook.
import { describe, expect, it } from 'vitest'
import { remainingSeconds } from '../timer.ts'

const T0 = 1_700_000_000_000

describe('remainingSeconds', () => {
  it('reads the full duration at the instant of starting', () => {
    // Not 29. `Math.floor` here would drop a second before the first paint,
    // which reads as the app losing count.
    expect(remainingSeconds(T0, 30, T0)).toBe(30)
  })

  it('counts down one second at a time', () => {
    expect(remainingSeconds(T0, 30, T0 + 1)).toBe(30)
    expect(remainingSeconds(T0, 30, T0 + 1_000)).toBe(29)
    expect(remainingSeconds(T0, 30, T0 + 1_500)).toBe(29)
    expect(remainingSeconds(T0, 30, T0 + 29_999)).toBe(1)
    expect(remainingSeconds(T0, 30, T0 + 30_000)).toBe(0)
  })

  it('is correct after a long gap rather than merely eventually correct', () => {
    // The whole reason nothing counts ticks: a tab throttled for ten minutes
    // must come back showing zero, not showing wherever the ticks got to.
    expect(remainingSeconds(T0, 60, T0 + 600_000)).toBe(0)
  })

  it('never returns a negative or an over-long value', () => {
    expect(remainingSeconds(T0, 20, T0 + 10_000_000)).toBe(0)
    // A clock that jumped backwards — a system time correction mid-hold.
    expect(remainingSeconds(T0, 20, T0 - 10_000)).toBe(20)
  })

  it('handles a zero duration, which is what a rep exercise passes', () => {
    expect(remainingSeconds(T0, 0, T0)).toBe(0)
    expect(remainingSeconds(T0, 0, T0 + 5_000)).toBe(0)
  })
})
