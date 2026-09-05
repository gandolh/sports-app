import type { ExerciseRecord, Pattern, SessionResult } from '@sports-app/shared/types.ts'

/**
 * Everything the interface derives from `history` — the streak, the heatmap,
 * the week's progress, and what happened last time.
 *
 * ── This file exists because of a reversal, and it is the reversal's cost ────
 *
 * "No dates anywhere in the app" was a locked decision until 2026-09-04
 * (corpus/wiki/reversals.md). It bought one property by construction:
 * **returning after two weeks looked identical to returning after one day**,
 * which is the app's worst moment and was previously answered for free. That
 * property is now gone, deliberately, and everything in here is the thing that
 * took it away. The design owes the debt back in words instead — see
 * `<HonestNote>` and the missed-day line on the plan screen — and the rule that
 * survived intact is the one below.
 *
 * ── Reading a date is not scheduling on one ─────────────────────────────────
 *
 * **Nothing here reaches `prescribe()`, and nothing here may.** The rotation
 * advances on training and never on the calendar, so a fortnight's gap and a
 * night's sleep prescribe the same next session; a streak of nineteen and a
 * streak of zero prescribe the same next session too. These functions produce
 * numbers to *show* a person. The governing invariant (corpus/CLAUDE.md) is that
 * no captured or derived value feeds the schedule, and the calendar is captured
 * data like any other.
 *
 * ── Pure, and the clock is a parameter ──────────────────────────────────────
 *
 * Every function that needs "now" takes a `Date`. That is a straight copy of the
 * rule `client/src/domain/` is held to by eslint: it is what makes a streak
 * testable without a fake clock, and it is why the one real `new Date()` on the
 * Today screen happens once, in the route, and is threaded down.
 *
 * ── Local days, not UTC days ────────────────────────────────────────────────
 *
 * `completedAt` is a UTC instant; a calendar square is a local day. A session
 * finished at 23:30 on the 4th in Bucharest is stored as 20:30Z and *is* the
 * 4th — bucketing by the ISO string's date part would file it under the 4th by
 * luck and a 01:30 session under the wrong day outright. So every bucket here
 * goes through the local calendar fields.
 */

/** Sessions a week the programme assumes. Seven, and the number is derived.
 *
 *  `DAILY_BLOCK` is trained in every session, and its ladders declare
 *  `sessionsPerRung: 42` against a law of "a rung takes about six weeks"
 *  (`domain/types.ts`). 42 / 6 = 7. So the weekly goal is not a target somebody
 *  picked to make a ring look good — it is the cadence the whole progression
 *  arithmetic is already built on, read back out. */
export const WEEKLY_GOAL = 7

/**
 * A local calendar day as `YYYY-MM-DD`.
 *
 * Hand-assembled rather than sliced off an ISO string, which would be the UTC
 * day — see the header. The zero-padding is manual for the same reason
 * `format.groupDigits` is: four lines beats reaching for a formatter whose next
 * option along produces a locale-dependent string.
 */
export function dayKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** Midnight local, `offset` days from `from`. Negative goes back. */
export function addDays(from: Date, offset: number): Date {
  // Constructed from the calendar fields rather than by adding milliseconds:
  // a day is not always 86,400,000ms across a DST boundary, and a heatmap that
  // skips or repeats a square twice a year is a bug nobody reproduces.
  return new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset)
}

/**
 * How many sessions were completed on each local day.
 *
 * A count rather than a boolean because two sessions in a day is a real thing a
 * person does and the heatmap has a darker square for it. An unparseable
 * timestamp is skipped rather than thrown on: the document is hand-editable, so
 * a mistyped date is an expected input and losing one square beats losing the
 * screen.
 */
export function sessionsByDay(history: readonly SessionResult[]): ReadonlyMap<string, number> {
  const byDay = new Map<string, number>()
  for (const session of history) {
    const at = new Date(session.completedAt)
    if (Number.isNaN(at.getTime())) continue
    const key = dayKey(at)
    byDay.set(key, (byDay.get(key) ?? 0) + 1)
  }
  return byDay
}

/**
 * Consecutive days trained, counting back from today.
 *
 * **Today not being trained yet does not break it.** The streak walks from
 * today if today has a session and from yesterday otherwise, so opening the app
 * at 7am on day nineteen shows nineteen rather than zero. Anything else would
 * make the number mean "days trained ending yesterday" for most of every waking
 * day, and a streak that reads zero while you are standing on the mat about to
 * train is worse than no streak at all.
 */
export function currentStreak(byDay: ReadonlyMap<string, number>, now: Date): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let cursor = (byDay.get(dayKey(today)) ?? 0) > 0 ? today : addDays(today, -1)
  let streak = 0
  // Bounded rather than `while (true)`: history is finite, but the loop's
  // termination should not depend on the data being well-formed.
  for (let step = 0; step < 3650; step += 1) {
    if ((byDay.get(dayKey(cursor)) ?? 0) === 0) break
    streak += 1
    cursor = addDays(cursor, -1)
  }
  return streak
}

export interface HeatCell {
  /** The local day, `YYYY-MM-DD`. Stable, so it doubles as the React key. */
  readonly key: string
  /** 0 nothing · 1 one session · 2 two or more. Three steps, not a gradient. */
  readonly level: 0 | 1 | 2
}

/**
 * The last `days` local days, oldest first, ending today.
 *
 * Three levels rather than a continuous scale because there are only three
 * distinguishable states in this programme: you did not train, you trained, you
 * trained twice. A five-step green ramp over a two-valued dataset is a chart
 * implying precision it does not have.
 */
export function heatmap(
  byDay: ReadonlyMap<string, number>,
  now: Date,
  days: number = 42,
): readonly HeatCell[] {
  const cells: HeatCell[] = []
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const key = dayKey(addDays(now, -offset))
    const count = byDay.get(key) ?? 0
    cells.push({ key, level: count === 0 ? 0 : count === 1 ? 1 : 2 })
  }
  return cells
}

export interface WeekProgress {
  readonly done: number
  readonly goal: number
  /** `0 .. 1`, clamped. Past the goal it stays at 1 — see below. */
  readonly fraction: number
}

/**
 * This week's sessions against `WEEKLY_GOAL`, Monday to Sunday.
 *
 * Monday because the rest of the app's week is the rotation's, not the
 * calendar's, and Monday-start is what a plan grid reads as everywhere the
 * category ships. The fraction clamps at 1: an eight-session week is a good week
 * and there is nothing above the goal to display, but a ring drawn past full
 * reads as an error rather than as a bonus.
 */
export function weekProgress(byDay: ReadonlyMap<string, number>, now: Date): WeekProgress {
  // `getDay()` is 0 for Sunday, so Monday is 1 and Sunday has to wrap to 6.
  const backToMonday = (now.getDay() + 6) % 7
  let done = 0
  for (let offset = 0; offset <= backToMonday; offset += 1) {
    done += byDay.get(dayKey(addDays(now, -(backToMonday - offset)))) ?? 0
  }
  return {
    done,
    goal: WEEKLY_GOAL,
    fraction: Math.min(done / WEEKLY_GOAL, 1),
  }
}

/**
 * The most recent record of `pattern`, or `null` if it has never been trained.
 *
 * Walks backwards, which is what makes it the *most recent* rather than the
 * first: `history` is append-ordered, and the pull exercise appears in every
 * session while push appears in one of three.
 */
export function lastRecordFor(
  history: readonly SessionResult[],
  pattern: Pattern,
): ExerciseRecord | null {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const record = history[index]?.exercises.find((exercise) => exercise.pattern === pattern)
    if (record !== undefined) return record
  }
  return null
}

/**
 * The best single set ever logged for `pattern`, or `null` if nothing was ever
 * logged for it.
 *
 * `null` is not zero and the difference is the whole reason this returns a union.
 * An absent `logged` key means "not logged", never "did nothing" — three
 * distinct values survive the codec (`shared/types.ts`) and collapsing them into
 * a zero here would put a proud `0` under "best ever" for a person who has
 * simply never used the log button, which is the default path through the
 * player.
 */
export function bestLoggedFor(
  history: readonly SessionResult[],
  pattern: Pattern,
): number | null {
  let best: number | null = null
  for (const session of history) {
    for (const exercise of session.exercises) {
      if (exercise.pattern !== pattern) continue
      for (const value of exercise.logged ?? []) {
        if (best === null || value > best) best = value
      }
    }
  }
  return best
}

/**
 * A log the codec will accept: at most `sets` entries, every one a finite
 * integer of at least zero.
 *
 * Enforced here rather than trusted, because the consequence is not a wrong
 * number on a screen. An out-of-range `logged` array makes `parse` fail on the
 * next load, and a document that will not parse blocks the whole app behind the
 * unreadable-document screen — the app's worst failure, caused by a typo in a
 * text field. Clamping is the right shape rather than rejecting: the user has
 * already told us what they did, and the only question is what we are allowed
 * to write down.
 */
export function sanitiseLog(values: readonly number[], sets: number): readonly number[] {
  return values
    .filter((value) => Number.isFinite(value))
    .map((value) => Math.max(0, Math.round(value)))
    .slice(0, Math.max(0, sets))
}
