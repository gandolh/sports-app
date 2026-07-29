/**
 * The player's state machine: which exercise, which set.
 *
 * ── There are only two numbers, and they live in the URL ────────────────────
 *
 * `itemIndex` and `dotsFilled`. That is the entire state of a live session,
 * because nothing is measured: a dot means "I tapped Next", not "a set was
 * completed to standard" (corpus/wiki/decisions.md, the governing decision).
 * There is no set duration, no rep count, no completion flag, and no place to
 * put one.
 *
 * Both numbers are owned by the route's search params rather than by a `useState`
 * in here, which is what makes a reload mid-plank resume on the same exercise and
 * the back button undo a mis-tap. This module is therefore deliberately almost
 * entirely **pure functions over a position** — `clampPosition` and `advance` are
 * the machine, and they are testable without rendering anything. The hook adds
 * exactly two things a function cannot: the screen lock, and a derived view.
 *
 * ── Why the position is clamped rather than validated ───────────────────────
 *
 * The position arrives from a URL, which a person can edit and a stale bookmark
 * can carry across a content change. `?i=99` is an expected input, not an attack
 * and not a bug: it degrades to the last exercise. Throwing, or rendering blank,
 * would break the only screen that matters over a typo.
 */
import type { IsoTimestamp } from '@sports-app/shared/types.ts'
import type { PrescribedItem, Prescription } from '../domain/schedule.ts'
import { useScreenAwake } from './wakeLock.ts'

export interface PlayerPosition {
  /** Index into `Prescription.items`. */
  readonly itemIndex: number
  /** How many of this item's dots are filled, `0 .. dotCount`. */
  readonly dotsFilled: number
}

export const SESSION_START: PlayerPosition = { itemIndex: 0, dotsFilled: 0 }

/**
 * How many dots an item shows: its sets, or its rounds on the cardio slot.
 *
 * Three for a strength pattern, two for the daily core and posture block, five
 * for the cardio round — all read off the prescription rather than hardcoded, so
 * a change to `SETS_PER_STRENGTH` cannot leave the player disagreeing with the
 * schedule about how much work there is.
 */
export function dotsFor(item: PrescribedItem): number {
  return item.type === 'cardio' ? item.rounds : item.sets
}

/**
 * Seconds the countdown ring should offer, or `null` when there is nothing to
 * time.
 *
 * A rep target has no clock — putting one there would invent a tempo the rung
 * did not ask for. A hold's clock is its own target; a cardio round's is the
 * protocol's hard interval, which is 60s and not the round count.
 */
export function timedSecondsFor(item: PrescribedItem): number | null {
  if (item.type === 'cardio') return item.protocol.hardSeconds
  return item.unit === 'seconds' ? item.targetValue : null
}

function clampInteger(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(Math.trunc(value), 0), max)
}

/** The nearest real position to whatever the URL said. Never throws. */
export function clampPosition(
  prescription: Prescription,
  position: Partial<PlayerPosition>,
): PlayerPosition {
  const lastItem = Math.max(prescription.items.length - 1, 0)
  const itemIndex = clampInteger(position.itemIndex ?? 0, lastItem)
  const item = prescription.items[itemIndex]
  // `dotCount` and not `dotCount - 1`: "every dot filled" is a real, momentary
  // position — it is what the last tap of an exercise produces before the tap
  // that moves on. Only `advance` collapses it.
  const dotCount = item === undefined ? 0 : dotsFor(item)
  return { itemIndex, dotsFilled: clampInteger(position.dotsFilled ?? 0, dotCount) }
}

/**
 * Where one tap of Next lands.
 *
 * Fill a dot; if that was the item's last dot, move to the next item with none
 * filled; if there is no next item, the session is over. Rest is whatever
 * happened before this call — there is no rest timer, because a rest timer would
 * be the app measuring something.
 */
export function advance(
  prescription: Prescription,
  position: PlayerPosition,
): PlayerPosition | 'finished' {
  const item = prescription.items[position.itemIndex]
  if (item === undefined) return 'finished'
  const filled = position.dotsFilled + 1
  if (filled < dotsFor(item)) return { itemIndex: position.itemIndex, dotsFilled: filled }
  const nextIndex = position.itemIndex + 1
  if (nextIndex >= prescription.items.length) return 'finished'
  return { itemIndex: nextIndex, dotsFilled: 0 }
}

/**
 * The wall clock, for the one field the domain refuses to read itself.
 *
 * It lives here rather than in `client/src/ui/` on purpose: **no file under `client/src/ui/`
 * may contain `new Date(`**, and a test greps for exactly that, because a
 * timestamp within reach of a component is how a "3 days ago" gets added later
 * (corpus/wiki/decisions.md, no dates anywhere). The player needs one string to
 * hand to `toSessionResult` and it gets it from here.
 */
export function nowIso(): IsoTimestamp {
  return new Date().toISOString()
}

export interface SessionView {
  readonly item: PrescribedItem
  readonly position: PlayerPosition
  readonly itemNumber: number
  readonly itemCount: number
  readonly dotCount: number
  readonly secondsOnTheClock: number | null
  readonly isLastItem: boolean
  /** Where the next tap lands. Precomputed so the route only navigates. */
  readonly nextPosition: PlayerPosition | 'finished'
}

/**
 * The current page of a live session, plus a screen lock for as long as one is
 * on screen.
 *
 * Returns `null` only for a prescription with no items, which no rotation slot
 * produces — handled rather than asserted because the alternative is a thrown
 * error on the training screen.
 */
export function useSession(
  prescription: Prescription,
  rawPosition: Partial<PlayerPosition>,
): SessionView | null {
  useScreenAwake(true)

  const position = clampPosition(prescription, rawPosition)
  const item = prescription.items[position.itemIndex]
  if (item === undefined) return null

  return {
    item,
    position,
    itemNumber: position.itemIndex + 1,
    itemCount: prescription.items.length,
    dotCount: dotsFor(item),
    secondsOnTheClock: timedSecondsFor(item),
    isLastItem: position.itemIndex === prescription.items.length - 1,
    nextPosition: advance(prescription, position),
  }
}
