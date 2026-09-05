import { useMemo } from 'react'
import { Link, createRoute, redirect, useNavigate } from '@tanstack/react-router'
import { isVariant } from '@sports-app/shared/types.ts'
import type { StateDoc, Variant } from '@sports-app/shared/types.ts'
import { prescribe } from '../../domain/schedule.ts'
import { totalWork } from '../../domain/milestones.ts'
import type { PlayerPosition } from '../../session/useSession.ts'
import { rootRoute } from './__root.tsx'
import { useAdoptLegacy, useDocument, useRequestPersistence } from '../document.ts'
import { AlertBanner } from '../components/AlertBanner.tsx'
import { PrimaryButton, SecondaryButton } from '../components/Buttons.tsx'
import { CountUp } from '../components/CountUp.tsx'
import { ExerciseRow } from '../components/ExerciseRow.tsx'
import { Heatmap } from '../components/Heatmap.tsx'
import { Player } from '../components/Player.tsx'
import { Ring } from '../components/Ring.tsx'
import { StatTiles } from '../components/StatTiles.tsx'
import { StreakPill } from '../components/StreakPill.tsx'
import { TabBar } from '../components/TabBar.tsx'
import {
  Eyebrow,
  SectionHeading,
  Shell,
  ShellBody,
  ShellFooter,
  ShellRail,
  ShellTitle,
} from '../components/Shell.tsx'
import { currentStreak, heatmap, sessionsByDay, weekProgress } from '../components/history.ts'
import { formatLongDate, groupDigits, sessionSummary } from '../components/format.ts'

/**
 * `/` — today's session, then the player, then done. The only route on the path
 * to a first set, and nothing on that path touches the network.
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
 * ── This screen reads the clock now, and did not used to ────────────────────
 *
 * The header of this file used to end: "Nothing here reads `completedAt`.
 * `doc.history.length` is the only thing the history is asked for, which is why
 * the home screen renders identically whether the last session was yesterday or
 * fourteen months ago — there is a test." That decision was reversed on
 * 2026-09-04 (corpus/wiki/reversals.md), the test was deleted rather than
 * weakened, and the date rail, the streak, the ring and the heatmap below are
 * what replaced it.
 *
 * The half that survived is the half that matters: **the rotation advances on
 * training, never on the calendar.** Miss a fortnight and `prescribe()` returns
 * exactly the same next session, because it is a pure function of
 * `sessionsDone` and no derived value here may ever reach it (corpus/CLAUDE.md).
 * The calendar reports; it does not schedule.
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
 * Today: where the week stands, what today is, and one tap to start it.
 *
 * ── The order down the page is an argument ──────────────────────────────────
 *
 * Ring, tiles, heatmap, then the plan. That puts three screens' worth of history
 * above the thing the user came to do, which is only defensible because the
 * thing they came to do is a **fixed-position primary button** at the foot —
 * reachable with a thumb without reading any of it. Somebody who opens the app
 * to train taps Start; somebody who opens it to see how they are doing scrolls.
 * Neither is made to do the other's work.
 *
 * ── The variant is a load dial, never a signal ──────────────────────────────
 *
 * It shifts today's numbers by two reps or five seconds and touches nothing
 * else, so an easy day banks no debt and costs no progress
 * (corpus/wiki/decisions.md). That is the whole reason a bad day is free, and the
 * footer says it in one line rather than hiding it. Medium is the 56px primary
 * and the other two are the 48px row above it, so **every variant is one tap** —
 * a segmented picker plus a start button would put the common case two taps away
 * to make the rare cases symmetrical. The numbers listed are medium's, because
 * that is what the primary will do.
 */
function Home({ doc, readOnly }: { readonly doc: StateDoc; readonly readOnly: string | null }) {
  const navigate = useNavigate()
  const prescription = useMemo(() => prescribe(doc, 'medium'), [doc])

  /**
   * The one clock read on this screen, taken once per mount.
   *
   * `useMemo` with no dependencies rather than a bare `new Date()` in the body:
   * every derived value below keys off it, and a fresh instant on each render
   * would give the heatmap new React keys and re-run the ring's fill animation
   * on every unrelated state change. It is also the only place a date enters —
   * everything in `components/history.ts` takes it as a parameter, exactly as
   * `client/src/domain/` is required to.
   */
  const now = useMemo(() => new Date(), [])

  const stats = useMemo(() => {
    const byDay = sessionsByDay(doc.history)
    return {
      week: weekProgress(byDay, now),
      streak: currentStreak(byDay, now),
      cells: heatmap(byDay, now),
      reps: totalWork(doc).reps,
    }
  }, [doc, now])

  function start(variant: Variant): void {
    void navigate({ to: '/', search: { v: variant, i: 0, d: 0 } })
  }

  const percent = Math.round(stats.week.fraction * 100)

  return (
    <Shell>
      <ShellRail trailing={<StreakPill days={stats.streak} />}>{formatLongDate(now)}</ShellRail>

      <ShellTitle
        title={`${prescription.label} day`}
        subtitle={sessionSummary(prescription, doc.history.length + 1)}
      />

      <ShellBody>
        {readOnly === null ? null : <AlertBanner label="Read-only" text={readOnly} />}

        <Ring
          fraction={stats.week.fraction}
          value={`${percent}%`}
          caption="Weekly goal"
          label={`This week: ${stats.week.done} of ${stats.week.goal} sessions.`}
        />

        <StatTiles
          stats={[
            {
              value: groupDigits(doc.history.length),
              label: 'Sessions',
              srLabel: `${doc.history.length} sessions completed.`,
            },
            {
              value: groupDigits(stats.streak),
              label: 'Day streak',
              srLabel: `${stats.streak} days in a row.`,
            },
            {
              value: groupDigits(stats.reps),
              label: 'Reps ever',
              srLabel: `${stats.reps} reps prescribed and completed, all time.`,
            },
          ]}
        />

        <Heatmap cells={stats.cells} />

        <SectionHeading>Today</SectionHeading>
        <ol>
          {prescription.items.map((item, index) => (
            <ExerciseRow key={index} item={item} />
          ))}
        </ol>
      </ShellBody>

      <ShellFooter
        above={
          <>
            <p className="text-center text-label text-tx3">
              Easier and harder shift today&rsquo;s numbers by two reps or five seconds. Neither
              changes what comes next.
            </p>
            <div className="flex gap-[var(--sp-2)]">
              <SecondaryButton
                onClick={() => start('easy')}
                aria-label="Start today's session, easier"
              >
                Easier
              </SecondaryButton>
              <SecondaryButton
                onClick={() => start('hard')}
                aria-label="Start today's session, harder"
              >
                Harder
              </SecondaryButton>
            </div>
          </>
        }
      >
        <PrimaryButton onClick={() => start('medium')}>Start workout</PrimaryButton>
      </ShellFooter>

      <TabBar active="today" />
    </Shell>
  )
}

// ─── Finish ─────────────────────────────────────────────────────────────────

/**
 * Done, and it asks nothing.
 *
 * No effort rating, no "how did that feel", no notes field. Asking after the work
 * is asking at the worst possible moment, and the app has nothing it could do
 * with the answer — `prescribe()` is a pure function of sessions completed and
 * no captured value may reach it. Logging was offered *during* the session,
 * beside each set, where the answer was still in the room; it is deliberately not
 * offered again here, because a second ask after a first refusal is a nag.
 *
 * The count-up of the sessions number is the entire celebration budget: no
 * confetti, no badge, no personal record.
 */
function Finish({ doc }: { readonly doc: StateDoc }) {
  const navigate = useNavigate()
  return (
    <Shell>
      <ShellRail>Done</ShellRail>
      <ShellBody>
        <div className="grid place-items-center py-[var(--sp-12)] text-center">
          <h1 className="text-display leading-[var(--lh-display)] font-extrabold tracking-[var(--ls-display)]">
            Session complete.
          </h1>
          <CountUp
            value={doc.history.length}
            className="mt-[var(--sp-6)] block text-mono leading-none font-extrabold tracking-[var(--ls-hero)] tabular-nums"
          />
          <span className="mt-[var(--sp-2)] block">
            <Eyebrow>
              {doc.history.length === 1 ? 'session completed' : 'sessions completed'}
            </Eyebrow>
          </span>
        </div>
      </ShellBody>
      <ShellFooter>
        <PrimaryButton onClick={() => void navigate({ to: '/', search: {} })}>Done</PrimaryButton>
      </ShellFooter>
      <TabBar active="today" />
    </Shell>
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
    <Shell>
      <ShellRail>Existing history</ShellRail>
      <ShellTitle title="There is already a training history on this browser." size="movement" />
      <ShellBody>
        <p className="mt-[var(--sp-3)] text-body text-tx2">
          It was saved before this app had accounts, so no owner is recorded in it —{' '}
          {sessions === 1 ? '1 session' : `${sessions} sessions`}. Nothing has been written yet.
        </p>
        <p className="mt-[var(--sp-3)] text-body text-tx2">
          If you recorded it, keep it and it becomes {username}&rsquo;s. If this browser is shared,
          start fresh: the old file stays exactly where it is either way.
        </p>
        {adopt.error === null ? null : (
          <AlertBanner label="Not saved" text={adopt.error.message} />
        )}
      </ShellBody>
      <ShellFooter
        above={
          <SecondaryButton onClick={() => adopt.mutate({ doc: legacy, keep: false })}>
            Start fresh
          </SecondaryButton>
        }
      >
        <PrimaryButton onClick={() => adopt.mutate({ doc: legacy, keep: true })}>
          Keep this history
        </PrimaryButton>
      </ShellFooter>
    </Shell>
  )
}

function Unreadable({ message }: { readonly message: string }) {
  return (
    <Shell>
      <ShellRail>Read-only</ShellRail>
      <ShellTitle title="The saved training history could not be read." size="movement" />
      <ShellBody>
        <AlertBanner label="Nothing was changed" text={message} />
        <p className="mt-[var(--sp-3)] text-body text-tx2">
          The stored text is untouched and is usually repairable by hand — it is plain JSON in this
          browser&rsquo;s local storage. Training is blocked rather than started from zero, because
          starting from zero here would look exactly like months of work having never happened.
        </p>
        <p className="mt-[var(--sp-3)] text-body text-tx2">
          <Link to="/account" className="text-accent underline">
            Account
          </Link>{' '}
          has the file to download, and the way to replace it if you decide it is not worth
          repairing.
        </p>
      </ShellBody>
      <TabBar active="today" />
    </Shell>
  )
}
