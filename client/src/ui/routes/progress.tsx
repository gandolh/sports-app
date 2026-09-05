import { useMemo } from 'react'
import { createRoute, redirect } from '@tanstack/react-router'
import type { StateDoc } from '@sports-app/shared/types.ts'
import { PATTERNS } from '@sports-app/shared/types.ts'
import { LADDERS, SESSIONS_PER_RUNG_ROTATING, topRungIndex } from '../../domain/ladders.ts'
import { rangeAt, rungIndexAt, targetAt } from '../../domain/schedule.ts'
import { milestonesReached, totalWork } from '../../domain/milestones.ts'
import { rootRoute } from './__root.tsx'
import { useDocument } from '../document.ts'
import { AlertBanner } from '../components/AlertBanner.tsx'
import { HonestNote } from '../components/HonestNote.tsx'
import { StatTiles } from '../components/StatTiles.tsx'
import { TabBar } from '../components/TabBar.tsx'
import { Eyebrow, SectionHeading, Shell, ShellBody, ShellRail, ShellTitle } from '../components/Shell.tsx'
import { groupDigits } from '../components/format.ts'

/**
 * `/progress` — the one chart this app draws, and the disclosure that says what
 * it is not.
 *
 * ── Why push, and why only push ─────────────────────────────────────────────
 *
 * `/account` already has the reason there is no chart there: the prescription is
 * a pure function of session count, so plotting it against session number is a
 * straight line with no information in it. That is still true here — this is not
 * a second attempt at the same chart. What this screen plots instead is the
 * *shape* of the schedule itself: the push ladder's rep target sweeps its floor
 * to its ceiling every rung and resets, because every push rung shares the same
 * 5-to-12 span (`ladders.ts#PUSH_RUNGS`) and only the movement gets harder. That
 * sawtooth is real content — it is the one place in the app where "the number
 * goes DOWN when you get better at something" is true — and push is the pattern
 * it is most visible on, since squat and hinge share the same shape but push is
 * the one every session of the rotation eventually reaches.
 *
 * ── Knowable on day one ──────────────────────────────────────────────────────
 *
 * Every point on this line is `targetAt('push', s)` for a session count `s` that
 * has not necessarily happened yet — the chart is the schedule, not a log. The
 * `<HonestNote>` beneath it says exactly that, because a step chart with a
 * "today" marker on it looks, at a glance, like a chart of achievement. It is a
 * chart of a fixed formula that would have produced the same line the day this
 * document was created, and the note is what keeps that honest.
 *
 * ── Milestones, again ────────────────────────────────────────────────────────
 *
 * `/account` already lists `milestonesReached`, keyed by session number, next to
 * the totals. This screen lists the same pure function's output again, next to
 * the chart that explains WHY they land where they do — a milestone is a rung
 * boundary, and the chart is what a rung boundary looks like. The two lists are
 * not required to agree on layout because they are answering different
 * questions: "what have I got" versus "what does the shape of getting it look
 * like".
 */

// ─── The push-target step chart ─────────────────────────────────────────────

const PUSH_RUNG_COUNT = LADDERS.push.rungs.length

/** The push ladder's actual span. Read off every rung rather than hard-coded,
 *  because a future rung could in principle declare its own `range` the way a
 *  `seconds` rung already does — nothing here should have to change if one ever
 *  does. */
function pushSpan(): { readonly min: number; readonly max: number } {
  let min = Infinity
  let max = -Infinity
  for (let index = 0; index < PUSH_RUNG_COUNT; index += 1) {
    const range = rangeAt('push', index)
    min = Math.min(min, range.min)
    max = Math.max(max, range.max)
  }
  return { min, max }
}

interface PushChart {
  readonly domainEnd: number
  readonly points: string
  readonly ticks: readonly number[]
  readonly yMin: number
  readonly yMax: number
  readonly currentSession: number
  readonly currentTarget: number
  readonly currentRung: number
}

/**
 * Builds the whole chart from nothing but the domain's own formulas — no history
 * is read here at all, only `doc.sessionsDone.push` for the "today" marker. The
 * domain always shows the complete nine-rung climb (126 push-sessions) and at
 * least one rung beyond wherever today sits, so a document that has already
 * cleared the ladder still shows the cycling tail rather than stopping short.
 */
function buildPushChart(sessionsDone: number): PushChart {
  const perRung = SESSIONS_PER_RUNG_ROTATING
  const fullClimb = PUSH_RUNG_COUNT * perRung
  const horizon = Math.max(fullClimb, sessionsDone + perRung)
  const domainEnd = Math.ceil(horizon / perRung) * perRung
  const { min: yMin, max: yMax } = pushSpan()

  const points: string[] = []
  for (let s = 0; s <= domainEnd; s += 1) {
    points.push(`${s},${yMax - targetAt('push', s)}`)
  }

  const ticks: number[] = []
  for (let boundary = perRung; boundary < domainEnd; boundary += perRung) ticks.push(boundary)

  return {
    domainEnd,
    points: points.join(' '),
    ticks,
    yMin,
    yMax,
    currentSession: sessionsDone,
    currentTarget: targetAt('push', sessionsDone),
    currentRung: rungIndexAt('push', sessionsDone),
  }
}

function PushChart({ chart }: { readonly chart: PushChart }) {
  const { domainEnd, points, ticks, yMin, yMax, currentSession, currentTarget, currentRung } = chart
  const height = yMax - yMin
  const leftPct = (currentSession / domainEnd) * 100
  const topPct = ((yMax - currentTarget) / height) * 100

  return (
    <div className="mt-[var(--sp-2)]">
      <div className="flex items-baseline justify-between">
        <Eyebrow>Push target</Eyebrow>
        <span className="text-meta text-tx2 tabular-nums">
          rung {currentRung + 1} of {PUSH_RUNG_COUNT}
        </span>
      </div>

      <div
        role="img"
        aria-label={
          `The push rep target across the whole ladder, sweeping ${yMin} to ${yMax} reps every ` +
          `rung and resetting at the next. Currently rung ${currentRung + 1} of ${PUSH_RUNG_COUNT}, ` +
          `targeting ${currentTarget} reps.`
        }
        className="relative mt-[var(--sp-2)] h-40 rounded border border-line bg-s1 p-[var(--sp-2)] shadow-1"
      >
        <svg
          viewBox={`0 0 ${domainEnd} ${height}`}
          preserveAspectRatio="none"
          className="h-full w-full"
          aria-hidden="true"
        >
          {ticks.map((tick) => (
            <line
              key={tick}
              x1={tick}
              y1={0}
              x2={tick}
              y2={height}
              stroke="var(--line)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <polyline
            points={points}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {/* An HTML dot rather than an SVG circle: a circle's radius scales with
            the viewBox, which runs from 126 units wide to several hundred, and a
            dot that is a fixed size on screen needs to sit outside that
            coordinate system entirely. */}
        <span
          aria-hidden="true"
          className="absolute h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-1"
          style={{ left: `${leftPct}%`, top: `${topPct}%` }}
        />
      </div>

      <div className="mt-[var(--sp-1)] flex items-center justify-between text-label text-tx3">
        <span className="tabular-nums">{yMin} reps</span>
        <span className="inline-flex items-center gap-[var(--sp-1)]">
          <span aria-hidden="true" className="block h-[8px] w-[8px] rounded-full bg-accent" />
          Today
        </span>
        <span className="tabular-nums">{yMax} reps</span>
      </div>
    </div>
  )
}

// ─── The route ──────────────────────────────────────────────────────────────

export const progressRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/progress',
  beforeLoad: ({ context }) => {
    if (context.username === null) throw redirect({ to: '/login' })
    return { username: context.username }
  },
  component: ProgressRoute,
})

function ProgressRoute() {
  const { username } = progressRoute.useRouteContext()
  const { data: snapshot } = useDocument(username)
  const doc = snapshot.doc

  if (doc === null) {
    return (
      <Shell>
        <ShellRail>Progress</ShellRail>
        <ShellBody>
          <AlertBanner
            label="Read-only"
            text={snapshot.readOnly ?? snapshot.error ?? 'The document could not be read.'}
          />
        </ShellBody>
        <TabBar active="progress" />
      </Shell>
    )
  }

  return (
    <Shell>
      <ShellRail>Progress</ShellRail>
      <ShellTitle title="Progress" size="movement" />
      <ShellBody>
        {snapshot.readOnly === null ? null : (
          <AlertBanner label="Read-only" text={snapshot.readOnly} />
        )}

        <ProgressBody doc={doc} />
      </ShellBody>
      <TabBar active="progress" />
    </Shell>
  )
}

function ProgressBody({ doc }: { readonly doc: StateDoc }) {
  const work = useMemo(() => totalWork(doc), [doc])
  const milestones = useMemo(() => milestonesReached(doc), [doc])
  const ladders = useMemo(
    () => PATTERNS.filter((pattern) => rungIndexAt(pattern, doc.sessionsDone[pattern]) === topRungIndex(pattern)),
    [doc],
  )
  const chart = useMemo(() => buildPushChart(doc.sessionsDone.push), [doc.sessionsDone.push])

  return (
    <>
      <StatTiles
        stats={[
          {
            value: groupDigits(work.sessions),
            label: 'Sessions',
            srLabel: `${work.sessions} sessions completed.`,
          },
          {
            value: groupDigits(milestones.length),
            label: 'Milestones',
            srLabel: `${milestones.length} milestones reached.`,
          },
          {
            value: groupDigits(ladders.length),
            label: 'Ladders finished',
            srLabel: `${ladders.length} ladders reached their top rung.`,
          },
        ]}
      />

      <PushChart chart={chart} />
      <HonestNote label="What this chart plots">
        The schedule, not your capability. The app prescribes on a fixed six-week
        clock and never adapts to what you log — this line was knowable on day
        one.
      </HonestNote>

      <SectionHeading>Milestones</SectionHeading>
      {milestones.length === 0 ? (
        <p className="text-body text-tx2">
          Nothing yet — the first one lands the first time a ladder moves up a
          rung, about six weeks in. Start a session from Today.
        </p>
      ) : (
        <ol>
          {milestones.map((milestone, index) => (
            <li
              key={`${milestone.sessionNumber}-${index}`}
              data-testid="milestone"
              className="mt-[var(--sp-2)] rounded border border-line bg-s1 p-[var(--sp-3)] shadow-1"
            >
              <span data-testid="milestone-ordinal">
                <Eyebrow className="text-tx3 tabular-nums">{`Session ${milestone.sessionNumber}`}</Eyebrow>
              </span>
              <p className="mt-[2px] text-body text-tx">{milestone.label}</p>
            </li>
          ))}
        </ol>
      )}
    </>
  )
}
