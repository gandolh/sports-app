// Node environment: the player's state machine is four pure functions over a
// prescription and a position, which is the reason they are exported separately
// from the hook that renders them.
import { describe, expect, it } from 'vitest'
import { prescribe } from '../../domain/schedule.ts'
import { emptyDoc } from '../../persistence/codec.ts'
import type { StateDoc } from '@sports-app/shared/types.ts'
import { advance, clampPosition, dotsFor, timedSecondsFor } from '../useSession.ts'

const PUSH_DAY: StateDoc = emptyDoc('alice')
const CARDIO_DAY: StateDoc = { ...PUSH_DAY, cyclePosition: 2 }

const push = prescribe(PUSH_DAY, 'medium')
const cardio = prescribe(CARDIO_DAY, 'medium')

describe('dotsFor', () => {
  it('is three for a strength pattern, two for the daily block, five for cardio', () => {
    expect(push.items.map(dotsFor)).toEqual([3, 2, 2])
    expect(cardio.items.map(dotsFor)).toEqual([5, 2, 2])
  })
})

describe('timedSecondsFor', () => {
  it('is null on a rep exercise — there is no tempo to invent', () => {
    expect(timedSecondsFor(push.items[0]!)).toBeNull()
  })

  it('is the hold target on a timed exercise', () => {
    const core = push.items[1]!
    expect(core.type === 'exercise' ? core.targetValue : null).toBe(timedSecondsFor(core))
  })

  it('is the protocol’s hard interval on cardio, not the round count', () => {
    expect(timedSecondsFor(cardio.items[0]!)).toBe(60)
  })
})

describe('clampPosition', () => {
  it('passes a real position through unchanged', () => {
    expect(clampPosition(push, { itemIndex: 1, dotsFilled: 1 })).toEqual({
      itemIndex: 1,
      dotsFilled: 1,
    })
  })

  it('allows every dot filled, because that is a real momentary position', () => {
    expect(clampPosition(push, { itemIndex: 0, dotsFilled: 3 })).toEqual({
      itemIndex: 0,
      dotsFilled: 3,
    })
  })

  it('degrades a stale or hand-typed URL rather than breaking the screen', () => {
    expect(clampPosition(push, { itemIndex: 99, dotsFilled: 99 })).toEqual({
      itemIndex: 2,
      dotsFilled: 2,
    })
    expect(clampPosition(push, { itemIndex: -4, dotsFilled: -1 })).toEqual({
      itemIndex: 0,
      dotsFilled: 0,
    })
    expect(clampPosition(push, { itemIndex: Number.NaN, dotsFilled: 1.7 })).toEqual({
      itemIndex: 0,
      dotsFilled: 1,
    })
    expect(clampPosition(push, {})).toEqual({ itemIndex: 0, dotsFilled: 0 })
  })
})

describe('advance', () => {
  it('fills a dot', () => {
    expect(advance(push, { itemIndex: 0, dotsFilled: 0 })).toEqual({
      itemIndex: 0,
      dotsFilled: 1,
    })
  })

  it('moves to the next exercise on the item’s last dot', () => {
    expect(advance(push, { itemIndex: 0, dotsFilled: 2 })).toEqual({
      itemIndex: 1,
      dotsFilled: 0,
    })
  })

  it('finishes the session on the last dot of the last exercise', () => {
    expect(advance(push, { itemIndex: 2, dotsFilled: 1 })).toBe('finished')
  })

  it('walks a whole Push session in exactly seven taps', () => {
    let position: ReturnType<typeof advance> = { itemIndex: 0, dotsFilled: 0 }
    let taps = 0
    while (position !== 'finished') {
      position = advance(push, position)
      taps += 1
      expect(taps).toBeLessThan(20)
    }
    // 3 push sets + 2 core + 2 posture.
    expect(taps).toBe(7)
  })

  it('walks a whole Cardio session in exactly nine taps', () => {
    let position: ReturnType<typeof advance> = { itemIndex: 0, dotsFilled: 0 }
    let taps = 0
    while (position !== 'finished') {
      position = advance(cardio, position)
      taps += 1
      expect(taps).toBeLessThan(20)
    }
    // 5 rounds + 2 core + 2 posture.
    expect(taps).toBe(9)
  })
})
