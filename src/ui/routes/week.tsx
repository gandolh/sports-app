import { useMemo } from 'react'
import { Link, createRoute, redirect } from '@tanstack/react-router'
import type { IsoTimestamp, StateDoc } from '../../domain/types.ts'
import { prescribe, recordSession, toSessionResult } from '../../domain/schedule.ts'
import type { Prescription } from '../../domain/schedule.ts'
import { rootRoute } from './__root.tsx'
import { useDocument } from '../document.ts'
import { Banner, PosturalNotice } from '../components/Notices.tsx'
import { Body, Rail, Screen } from '../components/Screen.tsx'
import { itemName, targetLabel, targetText } from '../components/format.ts'

/**
 * `/week` — the next seven **sessions**. Not seven days.
 *
 * No dates, no day names, no weekday grid, and no "today". The rotation advances
 * when you train and never on the calendar, so this page reads identically whether
 * the user trains tomorrow or in three weeks — which is the entire point of it
 * existing. It earns its place because a fixed schedule is knowable in advance and
 * seeing it is reassuring; it is not on the path to a first set.
 *
 * ── Why it is a list at phone width rather than seven columns ───────────────
 *
 * "Laid out like a week" is the brief and a seven-across grid is what that
 * suggests. At 390px that gives each session 46px of width, which cannot hold an
 * exercise name, let alone four. So the cells stack in one column and pair up at
 * 44rem where there is room, which is the same information in the shape the
 * viewport can actually carry. The ordinal is a **session number**, never a day
 * offset: "+3 days" would be a date in disguise.
 */

/**
 * The projection replays `recordSession` seven times against a throwaway document
 * to get the seven prescriptions, because `prescribe` is a pure function of
 * `sessionsDone` and there is no other way to ask "and then what".
 *
 * `recordSession` needs a timestamp for the `SessionResult` it appends. This one
 * is a deliberate non-timestamp: nothing reads `completedAt` anywhere in the app,
 * this document is never saved, never synced and never leaves this function, and a
 * plausible-looking ISO string here would be the first thing a future reader tried
 * to display.
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

export const weekRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/week',
  beforeLoad: ({ context }) => {
    if (context.username === null) throw redirect({ to: '/login' })
    return { username: context.username }
  },
  component: WeekRoute,
})

function WeekRoute() {
  const { username } = weekRoute.useRouteContext()
  const { data: snapshot } = useDocument(username)
  const doc = snapshot.doc
  const sessions = useMemo(() => (doc === null ? [] : projectSessions(doc)), [doc])

  if (doc === null) {
    return (
      <Screen>
        <Rail status="Week">
          <Link to="/" className="btn-quiet">
            Today
          </Link>
        </Rail>
        <Body>
          <Banner
            label="Read-only"
            text={snapshot.readOnly ?? snapshot.error ?? 'The document could not be read.'}
          />
        </Body>
      </Screen>
    )
  }

  const firstNumber = doc.history.length + 1

  return (
    <Screen>
      <Rail status="Next seven">
        <Link to="/" className="btn-quiet">
          Today
        </Link>
        <Link to="/account" className="btn-quiet">
          Account
        </Link>
      </Rail>
      <Body>
        <h1 className="page-title">The next seven sessions</h1>
        <p className="prose">
          Sessions, not days. The rotation moves when you train, so a week away changes nothing
          here — you come back to exactly this.
        </p>

        <ol className="week">
          {sessions.map((prescription, offset) => (
            <li
              key={offset}
              className={offset === 0 ? 'week__cell week__cell--next' : 'week__cell'}
            >
              <span className="week__ordinal">
                {offset === 0 ? 'Next · ' : ''}
                {`Session ${firstNumber + offset}`}
              </span>
              <h2 className="week__label">{prescription.label}</h2>
              <ul className="week__items">
                {prescription.items.map((item, index) => (
                  <li key={index} className="week__item">
                    <span>{itemName(item)}</span>
                    <span className="week__target" aria-hidden="true">
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
        <PosturalNotice />
      </Body>
    </Screen>
  )
}
