import { useState } from 'react'
import { Link, createRoute, redirect, useNavigate } from '@tanstack/react-router'
import { LADDERS, getRung, topRungIndex } from '../../domain/ladders.ts'
import { rangeAt, rungIndexAt } from '../../domain/schedule.ts'
import { milestonesReached, totalWork } from '../../domain/milestones.ts'
import { PATTERNS } from '@sports-app/shared/types.ts'
import type { Pattern, StateDoc } from '@sports-app/shared/types.ts'
import { clearCurrentUsername } from '../../persistence/session.ts'
import { rootRoute } from './__root.tsx'
import { useDocument, useStartFresh } from '../document.ts'
import { Banner } from '../components/Notices.tsx'
import { PressButton } from '../components/PressButton.tsx'
import { SyncSettings } from '../components/SyncSettings.tsx'
import { Body, Rail, Screen } from '../components/Screen.tsx'
import { PATTERN_LABEL, formatHoldTime, groupDigits } from '../components/format.ts'

/**
 * `/account` — who you are, what you have reached, and how much you have done.
 *
 * ── There is no chart, and that is the design being honest ──────────────────
 *
 * The prescription is a pure function of session count, so plotting it against
 * session number draws a straight line containing no information. Nothing here is
 * a visualisation of progress because there is no measured progress to visualise:
 * every number on this page is work **prescribed**, summed from history, not work
 * verified. The app measures nothing (corpus/wiki/decisions.md), and the totals say
 * so in a sentence rather than pretending.
 *
 * Milestones are the one thing a fixed schedule can honestly celebrate, and they
 * key off session **number**, never a date.
 *
 * ── It also carries the two things nothing else can ─────────────────────────
 *
 * The sync settings, because deleting the old settings screen left
 * `client/src/persistence/sync.ts` with no way in at all — see
 * `../components/SyncSettings.tsx`. And the way out of the read-only latch: a
 * user whose stored document cannot be read is told so on every screen, but this
 * is the only one that offers the export and then the replacement, in that order.
 */

export const accountRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/account',
  beforeLoad: ({ context }) => {
    if (context.username === null) throw redirect({ to: '/login' })
    return { username: context.username }
  },
  component: AccountRoute,
})

function AccountRoute() {
  const { username } = accountRoute.useRouteContext()
  const navigate = useNavigate()
  const { data: snapshot } = useDocument(username)

  function logOut(): void {
    clearCurrentUsername()
    void navigate({ to: '/login' })
  }

  return (
    <Screen>
      <Rail status="Account">
        <Link to="/" className="btn-quiet">
          Today
        </Link>
        <Link to="/week" className="btn-quiet">
          Week
        </Link>
      </Rail>
      <Body>
        <h1 className="page-title">{username}</h1>
        {snapshot.readOnly === null ? null : <Banner label="Read-only" text={snapshot.readOnly} />}

        {snapshot.doc === null ? (
          <>
            <p className="prose">
              The stored document could not be read, so there is nothing to total up here.
            </p>
            <Recovery username={username} rawText={snapshot.rawText} />
          </>
        ) : (
          <AccountBody doc={snapshot.doc} />
        )}

        {snapshot.doc === null ? null : <SyncSettings doc={snapshot.doc} username={username} />}

        <div className="section">
          <p className="section__title">Session</p>
          <p className="prose">
            Logging out forgets which account this browser is showing. Every training history stays
            exactly where it is.
          </p>
          <div className="actions">
            <PressButton className="btn-secondary" onClick={logOut}>
              Log out
            </PressButton>
          </div>
        </div>
      </Body>
    </Screen>
  )
}

function AccountBody({ doc }: { readonly doc: StateDoc }) {
  const work = totalWork(doc)
  const milestones = milestonesReached(doc)
  const ceilings = PATTERNS.filter(
    (pattern) => rungIndexAt(pattern, doc.sessionsDone[pattern]) === topRungIndex(pattern),
  )

  return (
    <>
      <div className="stat">
        <span className="stat__value">{groupDigits(work.sessions)}</span>
        <span className="stat__label">
          {work.sessions === 1 ? 'session completed' : 'sessions completed'}
        </span>
      </div>

      <div className="section">
        <p className="section__title">Total work ever</p>
        <div className="rows">
          <div className="row">
            <span>Reps</span>
            <span className="row__value">{groupDigits(work.reps)}</span>
          </div>
          <div className="row">
            <span>Time held</span>
            <span className="row__value">{formatHoldTime(work.holdSeconds)}</span>
          </div>
          {PATTERNS.map((pattern) => (
            <div className="row" key={pattern}>
              <span>{PATTERN_LABEL[pattern]}</span>
              <span className="row__value">{patternTotal(work.perPattern[pattern], pattern)}</span>
            </div>
          ))}
        </div>
        <p className="prose prose--spaced">
          This is work the schedule asked for, added up. The app never learns what you actually did,
          so it cannot claim more than that — and it is still the largest true number here.
        </p>
      </div>

      {ceilings.length === 0 ? null : (
        <div className="section">
          <p className="section__title">Ladders finished</p>
          {ceilings.map((pattern) => (
            <p className="ceiling" key={pattern}>
              {ceilingSentence(pattern)}
            </p>
          ))}
        </div>
      )}

      <div className="section">
        <p className="section__title">Milestones</p>
        {milestones.length === 0 ? (
          <p className="prose">
            Nothing yet — the first one lands the first time a ladder moves up a rung, about six
            weeks in. Start a session from the home screen.
          </p>
        ) : (
          <ol className="rows">
            {milestones.map((milestone, index) => (
              <li className="milestone" key={`${milestone.sessionNumber}-${index}`}>
                <span className="milestone__ordinal">{`Session ${milestone.sessionNumber}`}</span>
                <span className="milestone__label">{milestone.label}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  )
}

/**
 * The way out of the read-only latch: export first, replace second.
 *
 * ── The order is the whole design ───────────────────────────────────────────
 *
 * The stored text is untouched and is usually repairable by hand — a truncated
 * write, a stray character from a hand-edit, a JSON file that lost its last brace.
 * So the download comes first and the destructive control second, and the second
 * takes **two taps**: nothing else in this app asks for a confirmation, and this
 * is the one action that can destroy months of training history. It is also the
 * only place `allowOverwriteCorrupt` is passed anywhere in the app.
 *
 * A confirm-in-place rather than a dialog, because there is no modal anywhere in
 * this app (see the foot of `app.css`) and a second tap on a button that has
 * changed its own label says the same thing with less machinery.
 */
function Recovery({
  username,
  rawText,
}: {
  readonly username: string
  readonly rawText: string | null
}) {
  const startFresh = useStartFresh(username)
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="section">
      <p className="section__title">Recovery</p>
      <p className="prose">
        Nothing has been written and nothing will be until you say so. Take a copy of the file
        first: it is plain JSON, the problem is often one character, and a text editor is a better
        repair tool than anything this app could offer.
      </p>

      <div className="actions">
        {rawText === null ? (
          <p className="field__description">
            The stored text could not be read back either, so there is nothing to download.
          </p>
        ) : (
          <PressButton
            className="btn-secondary"
            onClick={() => downloadText(`${username}-training-history.json`, rawText)}
          >
            Download the file
          </PressButton>
        )}
      </div>

      <p className="prose prose--spaced">
        Replacing it starts every ladder at the bottom rung and every counter at zero. The
        downloaded copy is then the only one that exists.
      </p>

      {startFresh.error === null ? null : (
        <Banner label="Not replaced" text={startFresh.error.message} />
      )}

      <div className="actions actions--apart">
        {confirming ? (
          <>
            <PressButton className="btn-secondary" onClick={() => setConfirming(false)}>
              Keep it
            </PressButton>
            <PressButton
              className="btn-secondary btn-quiet--warn"
              onClick={() => startFresh.mutate()}
            >
              {startFresh.isPending ? 'Replacing…' : 'Yes, replace it'}
            </PressButton>
          </>
        ) : (
          <PressButton
            className="btn-secondary btn-quiet--warn"
            onClick={() => setConfirming(true)}
          >
            Replace it with an empty history
          </PressButton>
        )}
      </div>
    </div>
  )
}

/**
 * Hand the bytes back, unchanged.
 *
 * Capability-checked rather than assumed: `createObjectURL` is absent in some
 * embedded webviews and in the test renderer, and a recovery screen that throws
 * is worse than one whose download button does nothing. The revoke is deferred to
 * a task rather than done inline — revoking before the browser has started the
 * download cancels it in WebKit.
 */
function downloadText(filename: string, text: string): void {
  if (typeof URL.createObjectURL !== 'function') return
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** One line per pattern, in that ladder's own unit — reps and seconds do not add. */
function patternTotal(
  totals: { readonly reps: number; readonly holdSeconds: number },
  pattern: Pattern,
): string {
  if (LADDERS[pattern].unit === 'seconds') return formatHoldTime(totals.holdSeconds)
  return `${groupDigits(totals.reps)} reps`
}

/**
 * Stated plainly and without hedging, because it is a real finish rather than a
 * failure: at the top of a ladder the target cycles bottom→top→bottom forever,
 * which is the honest ceiling of what floor-only training offers.
 */
function ceilingSentence(pattern: Pattern): string {
  const top = topRungIndex(pattern)
  const rung = getRung(pattern, top)
  const range = rangeAt(pattern, top)
  const unit = LADDERS[pattern].unit === 'reps' ? 'reps' : 'seconds'
  return (
    `${PATTERN_LABEL[pattern]} has reached the top of its ladder — ${rung.name}. ` +
    `There is no rung above it, so the target now cycles between ${range.min} and ` +
    `${range.max} ${unit} and keeps cycling. That is the ceiling of what floor-only ` +
    `training offers, and reaching it is a finish.`
  )
}
