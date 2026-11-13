import { useMemo } from "react";
import { createRoute } from "@tanstack/react-router";
import type { StateDoc } from "@sports-app/shared/types.ts";
import { PATTERNS } from "@sports-app/shared/types.ts";
import { LADDERS, SESSIONS_PER_RUNG_ROTATING, topRungIndex } from "../../domain/ladders.ts";
import { rangeAt, rungIndexAt, targetAt } from "../../domain/schedule.ts";
import { milestonesReached, totalWork } from "../../domain/milestones.ts";
import { rootRoute } from "./__root.tsx";
import { toLogin } from "./next.ts";
import { useDocument } from "../document.ts";
import { AlertBanner } from "../components/AlertBanner.tsx";
import { HonestNote } from "../components/HonestNote.tsx";
import { StatTiles } from "../components/StatTiles.tsx";
import { StreakPill } from "../components/StreakPill.tsx";
import { TabBar } from "../components/TabBar.tsx";
import { Eyebrow, Shell, ShellBody, ShellRail, ShellTitle } from "../components/Shell.tsx";
import { currentStreak, sessionsByDay } from "../components/history.ts";
import { formatLongDate, groupDigits } from "../components/format.ts";

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

const PUSH_RUNG_COUNT = LADDERS.push.rungs.length;

/** The push ladder's actual span. Read off every rung rather than hard-coded,
 *  because a future rung could in principle declare its own `range` the way a
 *  `seconds` rung already does — nothing here should have to change if one ever
 *  does. */
function pushSpan(): { readonly min: number; readonly max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (let index = 0; index < PUSH_RUNG_COUNT; index += 1) {
    const range = rangeAt("push", index);
    min = Math.min(min, range.min);
    max = Math.max(max, range.max);
  }
  return { min, max };
}

interface PushChart {
  readonly domainEnd: number;
  readonly points: string;
  readonly ticks: readonly number[];
  readonly yMin: number;
  readonly yMax: number;
  readonly currentSession: number;
  readonly currentTarget: number;
  readonly currentRung: number;
}

/**
 * Builds the whole chart from nothing but the domain's own formulas — no history
 * is read here at all, only `doc.sessionsDone.push` for the "today" marker. The
 * domain always shows the complete nine-rung climb (126 push-sessions) and at
 * least one rung beyond wherever today sits, so a document that has already
 * cleared the ladder still shows the cycling tail rather than stopping short.
 */
function buildPushChart(sessionsDone: number): PushChart {
  const perRung = SESSIONS_PER_RUNG_ROTATING;
  const fullClimb = PUSH_RUNG_COUNT * perRung;
  const horizon = Math.max(fullClimb, sessionsDone + perRung);
  const domainEnd = Math.ceil(horizon / perRung) * perRung;
  const { min: yMin, max: yMax } = pushSpan();

  const points: string[] = [];
  for (let s = 0; s <= domainEnd; s += 1) {
    points.push(`${s},${yMax - targetAt("push", s)}`);
  }

  const ticks: number[] = [];
  for (let boundary = perRung; boundary < domainEnd; boundary += perRung) ticks.push(boundary);

  return {
    domainEnd,
    points: points.join(" "),
    ticks,
    yMin,
    yMax,
    currentSession: sessionsDone,
    currentTarget: targetAt("push", sessionsDone),
    currentRung: rungIndexAt("push", sessionsDone),
  };
}

function PushChart({ chart }: { readonly chart: PushChart }) {
  const { domainEnd, points, yMin, yMax, currentSession, currentTarget, currentRung } = chart;
  const height = yMax - yMin;
  const leftPct = (currentSession / domainEnd) * 100;
  const topPct = ((yMax - currentTarget) / height) * 100;

  return (
    <section
      aria-labelledby="push-target"
      className="rounded-lg border border-line bg-s1 p-[var(--sp-4)] shadow-1 min-[840px]:px-6 min-[840px]:pt-5 min-[840px]:pb-6"
    >
      <div className="mb-[var(--sp-2)] flex items-baseline justify-between gap-[var(--sp-3)]">
        <h2 id="push-target" className="text-h leading-[1.27] font-bold">
          Push target
        </h2>
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
        className="relative aspect-[8/3] rounded-[12px] bg-s2"
      >
        {/* The plot sits in an inset of the well, so the two guide lines at the
            ends of the range have room to breathe above and below the line. */}
        <div className="absolute inset-x-[1.25%] top-[8.3%] bottom-[10%]">
          <svg
            viewBox={`0 0 ${domainEnd} ${height}`}
            preserveAspectRatio="none"
            className="h-full w-full overflow-visible"
            aria-hidden="true"
          >
            {[0, height].map((y) => (
              <line
                key={y}
                x1={0}
                y1={y}
                x2={domainEnd}
                y2={y}
                stroke="var(--line2)"
                strokeWidth={1}
                strokeDasharray="3 5"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <polyline
              points={points}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={3}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {/* An HTML dot rather than an SVG circle: a circle's radius scales with
              the viewBox, and a dot that is a fixed size on screen needs to sit
              outside that coordinate system entirely. */}
          <span
            aria-hidden="true"
            className="absolute size-[14px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-s1 bg-accent box-content"
            style={{ left: `${leftPct}%`, top: `${topPct}%` }}
          />
        </div>
        <span
          aria-hidden="true"
          className="absolute top-[calc(8.3%+4px)] left-[var(--sp-3)] text-label leading-4 font-semibold text-tx2 tabular-nums"
        >
          {yMax} reps
        </span>
        <span
          aria-hidden="true"
          className="absolute bottom-[calc(10%+4px)] left-[var(--sp-3)] text-label leading-4 font-semibold text-tx2 tabular-nums"
        >
          {yMin} reps
        </span>
      </div>

      <div
        aria-hidden="true"
        className="mt-[var(--sp-2)] flex items-center gap-[var(--sp-2)] text-label leading-4 font-semibold text-tx2"
      >
        <span className="block size-[10px] rounded-full bg-accent" />
        Today
      </div>
    </section>
  );
}

export const progressRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/progress",
  beforeLoad: ({ context, location }) => {
    if (context.username === null) throw toLogin(location);
    return { username: context.username };
  },
  component: ProgressRoute,
});

function ProgressRoute() {
  const { username } = progressRoute.useRouteContext();
  const { data: snapshot } = useDocument(username);
  const doc = snapshot.doc;

  if (doc === null) {
    return (
      <Shell>
        <ShellRail topBar>Progress</ShellRail>
        <ShellBody>
          <AlertBanner
            label="Read-only"
            text={snapshot.readOnly ?? snapshot.error ?? "The document could not be read."}
          />
        </ShellBody>
        <TabBar active="progress" />
      </Shell>
    );
  }

  return <ProgressPage doc={doc} readOnly={snapshot.readOnly} />;
}

function ProgressPage({ doc, readOnly }: { readonly doc: StateDoc; readonly readOnly: string | null }) {
  const now = useMemo(() => new Date(), []);
  const streak = useMemo(() => currentStreak(sessionsByDay(doc.history), now), [doc, now]);
  return (
    <Shell>
      <ShellRail topBar trailing={<StreakPill days={streak} />}>
        {formatLongDate(now)}
      </ShellRail>
      <ShellBody>
        <ShellTitle title="Progress" />
        {readOnly === null ? null : <AlertBanner label="Read-only" text={readOnly} />}

        <ProgressBody doc={doc} />
      </ShellBody>
      <TabBar
        active="progress"
        trailing={
          <>
            <span>{formatLongDate(now)}</span>
            <StreakPill days={streak} />
          </>
        }
      />
    </Shell>
  );
}

function ProgressBody({ doc }: { readonly doc: StateDoc }) {
  const work = useMemo(() => totalWork(doc), [doc]);
  const milestones = useMemo(() => milestonesReached(doc), [doc]);
  const ladders = useMemo(
    () => PATTERNS.filter((pattern) => rungIndexAt(pattern, doc.sessionsDone[pattern]) === topRungIndex(pattern)),
    [doc],
  );
  const chart = useMemo(() => buildPushChart(doc.sessionsDone.push), [doc.sessionsDone.push]);

  return (
    <div className="mt-[var(--sp-3)] grid gap-[var(--sp-3)] min-[840px]:mt-0 min-[840px]:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] min-[840px]:items-start min-[840px]:gap-[var(--sp-4)]">
      <div className="grid gap-[var(--sp-3)] min-[840px]:gap-[var(--sp-4)]">
        <section aria-label="Totals" className="rounded-lg border border-line bg-s1 shadow-1">
          <StatTiles
            layout="columns"
            stats={[
              {
                value: groupDigits(work.sessions),
                label: "Sessions",
                srLabel: `${work.sessions} sessions completed.`,
              },
              {
                value: groupDigits(milestones.length),
                label: "Milestones",
                srLabel: `${milestones.length} milestones reached.`,
              },
              {
                value: groupDigits(ladders.length),
                label: "Ladders finished",
                srLabel: `${ladders.length} ladders reached their top rung.`,
              },
            ]}
          />
        </section>

        <PushChart chart={chart} />
      </div>

      <div className="grid gap-[var(--sp-3)] min-[840px]:gap-[var(--sp-4)]">
        <HonestNote flush label="What this chart plots">
          The schedule, not your capability. The app prescribes on a fixed six-week clock and never adapts to what you
          log — this line was knowable on day one.
        </HonestNote>

        <section
          aria-labelledby="milestones"
          className="rounded-lg border border-line bg-s1 p-[var(--sp-4)] shadow-1 min-[840px]:px-6 min-[840px]:pt-5 min-[840px]:pb-6"
        >
          <h2 id="milestones" className="text-h leading-[1.27] font-bold">
            Milestones
          </h2>
          {milestones.length === 0 ? (
            <p className="mt-[var(--sp-3)] text-body text-tx2">
              Nothing yet — the first one lands the first time a ladder moves up a rung, about six weeks in. Start a
              session from Today.
            </p>
          ) : (
            <ol>
              {milestones.map((milestone, index) => (
                <li
                  key={`${milestone.sessionNumber}-${index}`}
                  data-testid="milestone"
                  className="mt-[var(--sp-3)] rounded-[12px] bg-s2 px-[var(--sp-4)] py-[var(--sp-3)]"
                >
                  <span data-testid="milestone-ordinal">
                    <Eyebrow className="text-tx2 tabular-nums">{`Session ${milestone.sessionNumber}`}</Eyebrow>
                  </span>
                  <p className="mt-[2px] text-body leading-[1.45] text-tx">{milestone.label}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
