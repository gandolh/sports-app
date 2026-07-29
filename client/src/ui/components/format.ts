/**
 * The app's whole formatting layer. Numbers and prose only — **there is no date
 * formatter here and there is no place to add one.**
 *
 * `__tests__/noDatesInUi.test.ts` greps every file under `client/src/ui/` for the dozen
 * ways a date or a clock read has previously been smuggled into a UI layer, and
 * fails on a hit. That is why `groupDigits` below is hand-rolled rather than
 * delegating to the standard locale-aware number formatter: that formatter's name
 * is on the forbidden list, because the same call with a different argument is a
 * formatted date. Four lines of digit grouping is a cheap price for a rule with no
 * exceptions (corpus/wiki/decisions.md, no dates anywhere in the app).
 *
 * The test greps for the API names as text, so do not name them here either.
 */
import type { Pattern, TargetUnit } from '@sports-app/shared/types.ts'
import type { PrescribedItem } from '../../domain/schedule.ts'

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
