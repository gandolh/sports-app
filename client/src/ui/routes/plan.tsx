import { useMemo } from 'react'
import { createRoute, redirect } from '@tanstack/react-router'
import type { IsoTimestamp, StateDoc } from '@sports-app/shared/types.ts'
import { prescribe, recordSession, toSessionResult } from '../../domain/schedule.ts'
import type { Prescription } from '../../domain/schedule.ts'
import { rootRoute } from './__root.tsx'
import { useDocument } from '../document.ts'
import { AlertBanner } from '../components/AlertBanner.tsx'
import { HonestNote, PosturalNote } from '../components/HonestNote.tsx'
import { TabBar } from '../components/TabBar.tsx'
import {
  Eyebrow,
  SectionHeading,
  Shell,
  ShellBody,
  ShellRail,
  ShellTitle,
} from '../components/Shell.tsx'
import { dayKey, sessionsByDay } from '../components/history.ts'
import { formatLongDate, itemName, targetLabel, targetText } from '../components/format.ts'

/**
 * `/plan` — a real month calendar, then the next seven **sessions**.
 *
 * Replaces `/week`, which brief 27's direction round retired along with the
 * no-dates rule it was built to keep (corpus/wiki/reversals.md). The seven-session
 * projection that used to be the whole of that screen survives unchanged as
 * "Coming up" — it is still not on the path to a first set, and it still reads
 * identically whether the next session happens tomorrow or in three weeks,
 * because the rotation still only advances on training. What changed is that this
 * screen now ALSO shows the calendar the old one refused to.
 *
 * ── Two halves, two different relationships with the clock ──────────────────
 *
 * The calendar is a report on what already happened: it reads `completedAt` off
 * local history and renders a real month, current-day included. "Coming up" is a
 * projection of what has not happened yet, and it is built by replaying
 * `recordSession` against a throwaway document — see `projectSessions` — because
 * `prescribe` is a pure function of `sessionsDone` and there is no other way to
 * ask "and then what". Neither one feeds the other: nothing the calendar shows
 * changes a single projected session, which is the whole point of the fixed
 * schedule (corpus/CLAUDE.md).
 */

const NOT_A_TIMESTAMP: IsoTimestamp = 'projection-only'
const SESSIONS_AHEAD = 7

function projectSessions(doc: StateDoc): readonly Prescription[] {
  const projected: Prescription[] = []
  let cursor = doc
  for (let step = 0; step < SESSIONS_AHEAD; step += 1) {
    // Medium, because a variant is picked per session on the way in and
    // projecting one would state a choice the user has not made.
    const prescription = prescribe(cursor, 'medium')
    projected.push(prescription)
    cursor = recordSession(cursor, toSessionResult(prescription, NOT_A_TIMESTAMP))
  }
  return projected
}

// ─── The calendar ───────────────────────────────────────────────────────────

type DayState = 'trained' | 'missed' | 'rest'

interface CalendarDay {
  readonly date: Date
  readonly key: string
  readonly state: DayState
  readonly isToday: boolean
}

/** Monday-first, matching `history.ts#weekProgress` — the rest of the app's week starts there too. */
const WEEKDAY_SHORT: readonly string[] = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const WEEKDAY_FULL: readonly string[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]

/**
 * This calendar month, Monday-first, as a flat list padded with `null` so it
 * chunks evenly into weeks of seven. `null` cells are the blank days before the
 * 1st — there is no month navigation here, so a foreign month's dates would only
 * ever be filler with nothing to show.
 */
function buildMonth(byDay: ReadonlyMap<string, number>, now: Date): readonly (CalendarDay | null)[] {
  const year = now.getFullYear()
  const month = now.getMonth()
  const firstOfMonth = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayMidnight = new Date(year, month, now.getDate())
  const todayKey = dayKey(todayMidnight)
  // `getDay()` is 0 for Sunday; shift so Monday is column 0.
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7

  const cells: (CalendarDay | null)[] = []
  for (let i = 0; i < leadingBlanks; i += 1) cells.push(null)
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day)
    const key = dayKey(date)
    const trained = (byDay.get(key) ?? 0) > 0
    // "Missed" only ever means a past day. There is no date arithmetic in the
    // domain (`slotAt`'s own comment says so), so nothing here may treat a
    // missed day as anything other than a fact to display — see the note below.
    const state: DayState = trained ? 'trained' : date < todayMidnight ? 'missed' : 'rest'
    cells.push({ date, key, state, isToday: key === todayKey })
  }
  return cells
}

/** `state`/`today`, as a sentence for a screen reader — the visible cell is `aria-hidden`. */
function cellLabel(cell: CalendarDay): string {
  const parts = [formatLongDate(cell.date)]
  if (cell.isToday) parts.push('today')
  if (cell.state === 'trained') parts.push('trained')
  else if (cell.state === 'missed') parts.push('missed')
  return parts.join(', ')
}

const CELL_FILL: Readonly<Record<DayState, string>> = {
  // Filled and bold: the one state that is a genuine accomplishment.
  trained: 'bg-accent text-on-accent font-bold',
  // Marked, but with a hairline rather than a fill — visible without being an
  // alarm. This is the one state the 42-day heatmap on Today deliberately does
  // NOT have (see `Heatmap.tsx`); the honesty about what it costs lives in the
  // note below, not in how loud the square is.
  missed: 'bg-grid0 text-tx3 border border-line2',
  // Quiet. A day that has not happened yet has nothing to report — not even
  // "upcoming", which every future day would say identically.
  rest: 'bg-grid0 text-tx3',
}

/**
 * Today's ring has to read against whichever fill it lands on. `--on-accent` is
 * exactly the token built for sitting on `--accent` (`tokens.css`'s per-accent
 * ink); using the plain `--accent` ring there would draw an accent-coloured ring
 * on an accent-coloured square, which is invisible under every one of the eight
 * accents rather than under one unlucky combination.
 */
const TODAY_RING: Readonly<Record<DayState, string>> = {
  trained: 'ring-on-accent',
  missed: 'ring-accent',
  rest: 'ring-accent',
}

function CalendarGrid({ cells }: { readonly cells: readonly (CalendarDay | null)[] }) {
  const weeks: (readonly (CalendarDay | null)[])[] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

  return (
    <table className="mt-[var(--sp-2)] w-full border-separate border-spacing-[3px]">
      <caption className="sr-only">
        This month, one row per week. Today is outlined; a filled square is a day
        that was trained.
      </caption>
      <thead>
        <tr>
          {WEEKDAY_SHORT.map((short, index) => (
            <th key={short} scope="col" className="pb-[var(--sp-1)] font-normal">
              <span aria-hidden="true" className="block text-center text-label text-tx3">
                {short}
              </span>
              <span className="sr-only">{WEEKDAY_FULL[index]}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week, weekIndex) => (
          <tr key={weekIndex}>
            {week.map((cell, dayIndex) =>
              cell === null ? (
                <td key={dayIndex} aria-hidden="true" />
              ) : (
                <td key={cell.key}>
                  <div
                    aria-hidden="true"
                    className={
                      'grid aspect-square place-items-center rounded-sm text-meta tabular-nums ' +
                      CELL_FILL[cell.state] +
                      (cell.isToday ? ` ring-2 ring-inset ${TODAY_RING[cell.state]}` : '')
                    }
                  >
                    {cell.date.getDate()}
                  </div>
                  <span className="sr-only">{cellLabel(cell)}</span>
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * The most recent missed day in the visible month, oldest-search-last, or
 * `null` if there is not one — a perfect month, or a month too young to have
 * one yet. `null` gets a note that makes the same argument without naming a day
 * that does not exist.
 */
function mostRecentMissedDay(cells: readonly (CalendarDay | null)[]): CalendarDay | null {
  for (let index = cells.length - 1; index >= 0; index -= 1) {
    const cell = cells[index]
    if (cell !== undefined && cell !== null && cell.state === 'missed') return cell
  }
  return null
}

function missedDayNote(missed: CalendarDay | null): string {
  const who = missed === null ? 'a missed day' : formatLongDate(missed.date).split(',')[0]
  return (
    `Nothing. The rotation moves when you train, not when the calendar does — ` +
    `${who} is marked because you asked to see it, and the next session is still ` +
    `the next session.`
  )
}

// ─── The route ──────────────────────────────────────────────────────────────

export const planRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/plan',
  beforeLoad: ({ context }) => {
    if (context.username === null) throw redirect({ to: '/login' })
    return { username: context.username }
  },
  component: PlanRoute,
})

function PlanRoute() {
  const { username } = planRoute.useRouteContext()
  const { data: snapshot } = useDocument(username)
  const doc = snapshot.doc

  // One clock read, taken once per mount — same rule as `routes/index.tsx`'s
  // `Home`: every derived value below keys off it, so a fresh instant on each
  // render would give the calendar new keys for no reason.
  const now = useMemo(() => new Date(), [])

  const cells = useMemo(() => {
    if (doc === null) return []
    return buildMonth(sessionsByDay(doc.history), now)
  }, [doc, now])

  const sessions = useMemo(() => (doc === null ? [] : projectSessions(doc)), [doc])
  const missedDay = useMemo(() => mostRecentMissedDay(cells), [cells])

  if (doc === null) {
    return (
      <Shell>
        <ShellRail>Plan</ShellRail>
        <ShellBody>
          <AlertBanner
            label="Read-only"
            text={snapshot.readOnly ?? snapshot.error ?? 'The document could not be read.'}
          />
        </ShellBody>
        <TabBar active="plan" />
      </Shell>
    )
  }

  const firstNumber = doc.history.length + 1

  return (
    <Shell>
      <ShellRail>Plan</ShellRail>
      <ShellTitle title="This month" size="movement" />
      <ShellBody>
        {snapshot.readOnly === null ? null : (
          <AlertBanner label="Read-only" text={snapshot.readOnly} />
        )}

        <CalendarGrid cells={cells} />
        <HonestNote label="What a missed day costs">{missedDayNote(missedDay)}</HonestNote>

        <SectionHeading>Coming up</SectionHeading>
        <p className="text-meta text-tx2">
          Sessions, not days. The rotation moves when you train, so a week away
          changes nothing here — you come back to exactly this.
        </p>

        <ol>
          {sessions.map((prescription, offset) => (
            <li
              key={offset}
              className="mt-[var(--sp-2)] rounded border border-line bg-s1 p-[var(--sp-3)] shadow-1"
            >
              <div className="flex items-center justify-between gap-[var(--sp-2)]">
                <Eyebrow className="text-tx3 tabular-nums">
                  {offset === 0 ? `Next · Session ${firstNumber}` : `Session ${firstNumber + offset}`}
                </Eyebrow>
              </div>
              <h3 className="mt-[2px] text-body font-semibold tracking-[-0.012em]">
                {prescription.label}
              </h3>
              <ul className="mt-[var(--sp-1)] flex flex-col gap-[2px]">
                {prescription.items.map((item, index) => (
                  <li
                    key={index}
                    className="flex items-baseline justify-between gap-[var(--sp-2)] text-meta text-tx2"
                  >
                    <span className="min-w-0 truncate">{itemName(item)}</span>
                    <span
                      aria-hidden="true"
                      className="shrink-0 font-semibold text-tx tabular-nums"
                    >
                      {targetText(item)}
                    </span>
                    <span className="sr-only">{targetLabel(item)}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>

        {/* Every one of the seven cells contains the daily posture exercise, so
            the notice is surfaced once at the foot of the page rather than seven
            times inside it. Verbatim either way. */}
        <PosturalNote />
      </ShellBody>
      <TabBar active="plan" />
    </Shell>
  )
}
