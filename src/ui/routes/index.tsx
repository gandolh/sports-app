import { useMemo } from 'react'
import { Link, createRoute, redirect, useNavigate } from '@tanstack/react-router'
import { isVariant } from '../../domain/types.ts'
import type { StateDoc, Variant } from '../../domain/types.ts'
import { prescribe } from '../../domain/schedule.ts'
import type { PrescribedItem } from '../../domain/schedule.ts'
import type { PlayerPosition } from '../../session/useSession.ts'
import { rootRoute } from './__root.tsx'
import { useAdoptLegacy, useDocument, useRequestPersistence } from '../document.ts'
import { CountUp } from '../components/CountUp.tsx'
import { Banner, PosturalNotice } from '../components/Notices.tsx'
import { Player } from '../components/Player.tsx'
import { PressButton } from '../components/PressButton.tsx'
import { Body, Footer, Rail, Screen } from '../components/Screen.tsx'
import { itemName, targetLabel, targetText } from '../components/format.ts'

/**
 * `/` — today's session, then the player, then done. The only route on the path
 * to a first set.
 *
 * ── The whole of the player's state is three search params ──────────────────
 *
 *   `v`    the variant. Its **presence** is what "a session is in progress"
 *          means, so no param can be forgotten to reconstruct it.
 *   `i`    which exercise. `d` how many of its dots are filled.
 *   `done` the finish page.
 *
 * They are in the URL rather than in a `useState` because a phone on the floor
 * gets backgrounded, reloaded by the OS, and back-swiped. A reload mid-plank
 * resumes on the same exercise and the back button undoes a mis-tap, both for
 * free, and neither is a feature anybody would have built with local state. Every
 * value is clamped rather than validated (`clampPosition`): a stale bookmark
 * carrying `?i=9` is an expected input, not an error worth a blank screen.
 *
 * Nothing here reads `completedAt`. `doc.history.length` is the only thing the
 * history is asked for, which is why the home screen renders identically whether
 * the last session was yesterday or fourteen months ago — there is a test.
 */

export interface PlayerSearch {
  readonly v?: Variant
  readonly i?: number
  readonly d?: number
  readonly done?: true
}

function toIndex(value: unknown): number | null {
  const asNumber = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(asNumber) || asNumber < 0) return null
  return Math.trunc(asNumber)
}

/**
 * Anything unrecognised is dropped rather than rejected, which is what makes a
 * hand-typed or stale URL land on the home screen instead of an error. The
 * properties are assigned conditionally because `exactOptionalPropertyTypes` makes
 * `{ v: undefined }` a different type from `{}` — and here the difference is real:
 * an explicit `undefined` would still serialise into the URL.
 */
function validatePlayerSearch(raw: Record<string, unknown>): PlayerSearch {
  const search: { v?: Variant; i?: number; d?: number; done?: true } = {}
  if (isVariant(raw['v'])) search.v = raw['v']
  const item = toIndex(raw['i'])
  if (item !== null) search.i = item
  const dots = toIndex(raw['d'])
  if (dots !== null) search.d = dots
  if (raw['done'] === true || raw['done'] === 1 || raw['done'] === '1') search.done = true
  return search
}

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: validatePlayerSearch,
  beforeLoad: ({ context }) => {
    if (context.username === null) throw redirect({ to: '/login' })
    return { username: context.username }
  },
  component: TodayRoute,
})

function TodayRoute() {
  const { username } = indexRoute.useRouteContext()
  const search = indexRoute.useSearch()
  const navigate = useNavigate()
  const { data: snapshot } = useDocument(username)
  useRequestPersistence(username, snapshot.doc)

  // A pre-accounts document was found and converted, and nothing has been
  // written. Ask before adopting it: v2 had one user and recorded no owner, so on
  // a shared browser this may be somebody else's history.
  if (snapshot.pendingLegacy !== null) {
    return <LegacyPrompt username={username} legacy={snapshot.pendingLegacy} />
  }

  // Unreadable, not empty. Deliberately no training path: presenting a fresh
  // document here would show a reset ladder as this person's history and they
  // would train against it.
  if (snapshot.doc === null) {
    return <Unreadable message={snapshot.readOnly ?? snapshot.error ?? 'Unknown error.'} />
  }

  if (search.v === undefined) {
    return <Home doc={snapshot.doc} readOnly={snapshot.readOnly} />
  }
  if (search.done === true) {
    return <Finish doc={snapshot.doc} />
  }

  const variant = search.v
  return (
    <PlayerRoute
      doc={snapshot.doc}
      username={username}
      variant={variant}
      readOnly={snapshot.readOnly}
      rawPosition={{ itemIndex: search.i ?? 0, dotsFilled: search.d ?? 0 }}
      onMove={(position: PlayerPosition) => {
        void navigate({
          to: '/',
          search: { v: variant, i: position.itemIndex, d: position.dotsFilled },
        })
      }}
      onFinished={() => void navigate({ to: '/', search: { v: variant, done: true } })}
      onStop={() => void navigate({ to: '/', search: {} })}
    />
  )
}

function PlayerRoute(props: {
  readonly doc: StateDoc
  readonly username: string
  readonly variant: Variant
  readonly readOnly: string | null
  readonly rawPosition: PlayerPosition
  readonly onMove: (position: PlayerPosition) => void
  readonly onFinished: () => void
  readonly onStop: () => void
}) {
  const prescription = useMemo(
    () => prescribe(props.doc, props.variant),
    [props.doc, props.variant],
  )
  return (
    <Player
      doc={props.doc}
      username={props.username}
      prescription={prescription}
      rawPosition={props.rawPosition}
      readOnly={props.readOnly}
      onMove={props.onMove}
      onFinished={props.onFinished}
      onStop={props.onStop}
    />
  )
}

// ─── Home ───────────────────────────────────────────────────────────────────

/**
 * Today's session and three ways to start it.
 *
 * The variant is a **load dial, never a signal**: it shifts today's numbers by
 * two reps or five seconds and touches nothing else, so an easy day banks no debt
 * and costs no progress (corpus/wiki/decisions.md). That is the whole reason a bad
 * day is free, and the footer says it in one line rather than hiding it.
 *
 * Medium is the 96px primary and the other two are the 56px secondary row above
 * it, so **every variant is one tap** — a segmented picker plus a start button
 * would put the common case two taps away to make the rare cases symmetrical. The
 * numbers listed are medium's, because that is what the primary will do.
 */
function Home({ doc, readOnly }: { readonly doc: StateDoc; readonly readOnly: string | null }) {
  const navigate = useNavigate()
  const prescription = useMemo(() => prescribe(doc, 'medium'), [doc])

  function start(variant: Variant): void {
    void navigate({ to: '/', search: { v: variant, i: 0, d: 0 } })
  }

  return (
    <Screen>
      <Rail status={`Session ${doc.history.length + 1}`}>
        <Link to="/week" className="btn-quiet">
          Week
        </Link>
        <Link to="/account" className="btn-quiet">
          Account
        </Link>
      </Rail>

      <Body>
        {readOnly === null ? null : <Banner label="Read-only" text={readOnly} />}
        <h1 className="day-title">{prescription.label}</h1>
        <ol className="plan">
          {prescription.items.map((item, index) => (
            <PlanRow key={index} item={item} />
          ))}
        </ol>
      </Body>

      <Footer
        above={
          <div className="footer__group">
            <p className="footer__note">
              Easier and harder shift today&rsquo;s numbers by two reps or five seconds. Neither
              changes what comes next.
            </p>
            <div className="footer__secondary">
              <PressButton
                className="btn-secondary"
                onClick={() => start('easy')}
                aria-label="Start today's session, easier"
              >
                Easier
              </PressButton>
              <PressButton
                className="btn-secondary"
                onClick={() => start('hard')}
                aria-label="Start today's session, harder"
              >
                Harder
              </PressButton>
            </div>
          </div>
        }
      >
        <PressButton className="btn-primary" onClick={() => start('medium')}>
          Start
        </PressButton>
      </Footer>
    </Screen>
  )
}

function PlanRow({ item }: { readonly item: PrescribedItem }) {
  const postural = item.type === 'exercise' && item.ladderKind === 'postural'
  return (
    <li className="plan__item">
      <div className="plan__row">
        <span className="plan__name">{itemName(item)}</span>
        <span className="plan__target" aria-hidden="true">
          {targetText(item)}
        </span>
        <span className="sr-only">{targetLabel(item)}</span>
      </div>
      {/* On the cardio slot the item's name and the day's title are the same word,
          so the row alone says nothing the heading did not. The movements are what
          somebody standing on a mat actually wants from this line, and they are the
          protocol's own words. */}
      {item.type === 'cardio' ? (
        <p className="plan__detail">{item.protocol.movements.join('  ·  ')}</p>
      ) : null}
      {/* Verbatim, and on every screen a pull exercise appears on. Presenting
          postural work as pulling strength is a misrepresentation with a physical
          consequence. */}
      {postural ? <PosturalNotice inset /> : null}
    </li>
  )
}

// ─── Finish ─────────────────────────────────────────────────────────────────

/**
 * Done, and it asks nothing.
 *
 * No effort rating, no "how did that feel", no notes field. Asking after the work
 * is asking at the worst possible moment, and the app has nothing it could do with
 * the answer. The count-up of the sessions number is the entire celebration
 * budget: no confetti, no badge, no personal record.
 */
function Finish({ doc }: { readonly doc: StateDoc }) {
  const navigate = useNavigate()
  return (
    <Screen>
      <Rail status="Done">
        <Link to="/week" className="btn-quiet">
          Week
        </Link>
        <Link to="/account" className="btn-quiet">
          Account
        </Link>
      </Rail>
      <Body>
        <div className="finish">
          <h1 className="day-title">Session complete.</h1>
          <CountUp value={doc.history.length} className="finish__value" />
          <p className="stat__label">
            {doc.history.length === 1 ? 'session completed' : 'sessions completed'}
          </p>
        </div>
      </Body>
      <Footer>
        <PressButton className="btn-primary" onClick={() => void navigate({ to: '/', search: {} })}>
          Done
        </PressButton>
      </Footer>
    </Screen>
  )
}

// ─── The two states that are not a session ──────────────────────────────────

function LegacyPrompt({
  username,
  legacy,
}: {
  readonly username: string
  readonly legacy: StateDoc
}) {
  const adopt = useAdoptLegacy(username)
  const sessions = legacy.history.length
  return (
    <Screen>
      <Rail status="Existing history" />
      <Body>
        <h1 className="page-title">There is already a training history on this browser.</h1>
        <p className="prose">
          It was saved before this app had accounts, so no owner is recorded in it —{' '}
          {sessions === 1 ? '1 session' : `${sessions} sessions`}. Nothing has been written yet.
        </p>
        <p className="prose">
          If you recorded it, keep it and it becomes {username}&rsquo;s. If this browser is shared,
          start fresh: the old file stays exactly where it is either way.
        </p>
        {adopt.error === null ? null : <Banner label="Not saved" text={adopt.error.message} />}
      </Body>
      <Footer
        above={
          <div className="footer__secondary">
            <PressButton
              className="btn-secondary btn-quiet--warn"
              onClick={() => adopt.mutate({ doc: legacy, keep: false })}
            >
              Start fresh
            </PressButton>
          </div>
        }
      >
        <PressButton
          className="btn-primary"
          onClick={() => adopt.mutate({ doc: legacy, keep: true })}
        >
          Keep this history
        </PressButton>
      </Footer>
    </Screen>
  )
}

function Unreadable({ message }: { readonly message: string }) {
  return (
    <Screen>
      <Rail status="Read-only">
        <Link to="/account" className="btn-quiet">
          Account
        </Link>
      </Rail>
      <Body>
        <h1 className="page-title">The saved training history could not be read.</h1>
        <Banner label="Nothing was changed" text={message} />
        <p className="prose">
          The stored text is untouched and is usually repairable by hand — it is plain JSON in this
          browser&rsquo;s local storage. Training is blocked rather than started from zero, because
          starting from zero here would look exactly like months of work having never happened.
        </p>
        <p className="prose">
          <Link to="/account">Account</Link> has the file to download, and the way to replace it if
          you decide it is not worth repairing.
        </p>
      </Body>
    </Screen>
  )
}
