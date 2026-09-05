/**
 * The app's whole formatting layer: numbers, prose, and — since 2026-09-04 —
 * dates.
 *
 * ── There used to be a rule here, and it is gone ────────────────────────────
 *
 * This header said "there is no date formatter here and there is no place to add
 * one", and `__tests__/noDatesInUi.test.ts` enforced it by grepping every file
 * under `client/src/ui/` for the dozen ways a clock read had previously been
 * smuggled into a UI layer. That rule was reversed in the v3 direction round
 * (corpus/wiki/reversals.md): the app now shows a date, a streak, a heatmap and
 * a calendar. Brief 27 **deleted** the test rather than weakening it, because a
 * test kept alive after its rule is gone tells the next reader something false.
 *
 * ── Everything below is still hand-rolled, for a different reason ───────────
 *
 * `groupDigits` and `formatLongDate` do not call the platform's locale-aware
 * formatters, and that is now a determinism argument rather than a prohibition.
 * This app is English-only and its tests assert on rendered strings; a formatter
 * that answers differently under a different `LANG`, a different ICU build or a
 * headless runner turns a screen assertion into a flake. Two arrays of names and
 * four lines of digit grouping are cheap, and they read the same everywhere.
 *
 * The rule that did **not** move: `client/src/domain/` still may not read the
 * clock, and eslint still fails the build on it. Dates enter through
 * `client/src/persistence/` and are passed in. Nothing in this file calls
 * `new Date()` either — every function takes the `Date` it is given.
 */
import type { Pattern, TargetUnit } from '@sports-app/shared/types.ts'
import { LADDERS } from '../../domain/ladders.ts'
import { slotAt } from '../../domain/types.ts'
import type { PrescribedExercise, PrescribedItem, Prescription } from '../../domain/schedule.ts'

/**
 * `12480` → `12,480`. Grouped because the account page's totals reach six
 * figures and an ungrouped `128400` is unreadable at a glance.
 */
export function groupDigits(value: number): string {
  const rounded = Math.round(value)
  const sign = rounded < 0 ? '-' : ''
  const digits = Math.abs(rounded).toString()
  let out = ''
  for (let i = 0; i < digits.length; i += 1) {
    // Comma every three digits counting from the right.
    if (i > 0 && (digits.length - i) % 3 === 0) out += ','
    out += digits[i]
  }
  return `${sign}${out}`
}

/**
 * Hold time, as a duration and never as a clock time: `2h 14m`, `14m 30s`,
 * `45s`. `holdSeconds` arrives from `totalWork` as a bare count of seconds and
 * the domain deliberately does not format it (brief 20) — the choice of unit is
 * a display decision, so it is made here.
 *
 * Minutes are dropped once hours are in play. `2h 14m 08s` is a stopwatch
 * reading; the number this describes is "how much plank have I ever held", where
 * the seconds are noise.
 */
export function formatHoldTime(totalSeconds: number): string {
  const seconds = Math.max(Math.round(totalSeconds), 0)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    const rest = seconds % 60
    return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`
  }
  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  return restMinutes === 0 ? `${groupDigits(hours)}h` : `${groupDigits(hours)}h ${restMinutes}m`
}

/** `reps` / `seconds`, singular where the number is 1. */
export function unitWord(unit: TargetUnit, value: number): string {
  if (unit === 'reps') return value === 1 ? 'rep' : 'reps'
  return value === 1 ? 'second' : 'seconds'
}

/** The compact form for a dense row: `3 × 8`, `2 × 30s`, `5 × 60s`. */
export function targetText(item: PrescribedItem): string {
  if (item.type === 'cardio') return `${item.rounds} × ${item.protocol.hardSeconds}s`
  const value = item.unit === 'seconds' ? `${item.targetValue}s` : `${item.targetValue}`
  return `${item.sets} × ${value}`
}

/**
 * The same number as prose, for `aria-label`.
 *
 * Required rather than nice: a screen reader renders `3 × 8` as "3 x 8", which
 * is not a sentence and not a quantity. Design system, accessibility — targets
 * read as prose.
 */
export function targetLabel(item: PrescribedItem): string {
  if (item.type === 'cardio') {
    return `${item.rounds} rounds of ${item.protocol.hardSeconds} seconds hard`
  }
  const sets = `${item.sets} ${item.sets === 1 ? 'set' : 'sets'}`
  if (item.unit === 'seconds') {
    return `${sets} of a ${item.targetValue} second hold`
  }
  return `${sets} of ${item.targetValue} ${unitWord(item.unit, item.targetValue)}`
}

/** The movement's name, or the protocol's label on a cardio slot. */
export function itemName(item: PrescribedItem): string {
  return item.type === 'cardio' ? item.protocol.label : item.rung.name
}

/**
 * Pattern names for the account page. `pull` is spelled out as postural
 * because the ladder is: calling that row "Pull" beside a reps total would be
 * the exact misrepresentation `POSTURAL_NOTICE` exists to prevent
 * (corpus/wiki/programme.md).
 */
export const PATTERN_LABEL: Readonly<Record<Pattern, string>> = {
  push: 'Push',
  squat: 'Squat',
  hinge: 'Hinge',
  core: 'Core',
  pull: 'Posture (pull)',
}

// ─── Dates ──────────────────────────────────────────────────────────────────
//
// New in brief 27. See the header for why they are hand-rolled and why they
// exist at all.

const WEEKDAY_NAMES: readonly string[] = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

const MONTH_NAMES: readonly string[] = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/**
 * `Friday, 4 September` — the date rail on the Today screen.
 *
 * No year, and that is a choice rather than an omission: the rail answers "what
 * day is it", which is a question about this week. A year in it would be four
 * characters of noise on 364 days and mildly startling on the 365th.
 */
export function formatLongDate(date: Date): string {
  const weekday = WEEKDAY_NAMES[date.getDay()] ?? ''
  const month = MONTH_NAMES[date.getMonth()] ?? ''
  return `${weekday}, ${date.getDate()} ${month}`
}

// ─── The prescription, as headings ──────────────────────────────────────────

/**
 * `rung 5 of 9` for an exercise, `null` for the cardio slot.
 *
 * `null` rather than a placeholder string: a cardio slot has no ladder, no rung
 * and no progression, and `PrescribedCardio` has no field to read. Rendering
 * "rung 0 of 0" there would invent a ladder the programme deliberately does not
 * have (`CardioProtocol`, "deliberately not a `Ladder`").
 */
export function rungSummary(item: PrescribedItem): string | null {
  if (item.type === 'cardio') return null
  return `rung ${item.rungIndex + 1} of ${LADDERS[item.pattern].rungs.length}`
}

/**
 * The line under the day title: `Session 142 · rung 5 of 9`.
 *
 * The rungs listed are the slot's OWN work, never the daily block. Legs day
 * trains squat and hinge and shows both; Push day shows one; Cardio day trains
 * no ladder of its own and says so in words rather than showing the core and
 * posture rungs it shares with every other session. Listing the daily block here
 * would put the same two rungs under every single day and make the line
 * unreadable as a description of *this* session.
 */
export function sessionSummary(prescription: Prescription, sessionNumber: number): string {
  // The slot's own patterns, from `ROTATION`, and never `ladderKind`. The daily
  // block's core ladder is `kind: 'strength'` too, so filtering on that put
  // `core rung 2 of 6` under every single day — which is exactly the unreadable
  // line this filter exists to avoid.
  const slot = slotAt(prescription.position)
  const parts = prescription.items
    .filter(
      (item): item is PrescribedExercise =>
        item.type === 'exercise' && slot.patterns.includes(item.pattern),
    )
    .map((item) => `${item.pattern} ${rungSummary(item)}`)
  if (parts.length === 0) parts.push('five hard minutes, no ladder')
  return `Session ${sessionNumber} · ${parts.join(' · ')}`
}

// ─── Logged sets ────────────────────────────────────────────────────────────

/**
 * `[8, 8, 6]` → `8 · 8 · 6`. An empty array is `nothing`, spelled out.
 *
 * Three states reach here and all three are real (`shared/types.ts`): the key
 * absent means not logged and the caller renders an em dash without asking this
 * function; `[]` means the person logged that they did nothing, which deserves a
 * word rather than an empty span; anything else is what they did.
 */
export function formatLog(values: readonly number[]): string {
  if (values.length === 0) return 'nothing'
  return values.join(' · ')
}

/** The same list as a sentence, for `aria-label`. `8 · 8 · 6` is not speech. */
export function logLabel(values: readonly number[], unit: TargetUnit): string {
  if (values.length === 0) return 'Logged: nothing'
  const spoken = values.map((value) => `${value} ${unitWord(unit, value)}`).join(', ')
  return `Logged: ${spoken}`
}

/**
 * `+2`, `−1`, `0`. A true minus sign, not a hyphen.
 *
 * The pair is set in `tabular-nums` beside each other in the comparison strip,
 * and a hyphen-minus is narrower than a plus at the same size — the two rows
 * visibly fail to line up. This is the one place the distinction is worth a
 * character nobody can type.
 */
export function signedDelta(value: number): string {
  if (value > 0) return `+${value}`
  if (value < 0) return `−${Math.abs(value)}`
  return '0'
}

/** The same, as prose: screen readers read `−` inconsistently or not at all. */
export function deltaLabel(value: number, unit: TargetUnit): string {
  const word = unitWord(unit, Math.abs(value))
  if (value > 0) return `${value} ${word} more than last time`
  if (value < 0) return `${Math.abs(value)} ${word} fewer than last time`
  return `The same as last time`
}
