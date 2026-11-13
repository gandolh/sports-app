import { useCallback, useRef, useState } from "react";
import type { PrescribedExercise, Prescription } from "../../domain/schedule.ts";
import type { StateDoc } from "@sports-app/shared/types.ts";
import { useCountdown } from "../../session/timer.ts";
import { useSession } from "../../session/useSession.ts";
import type { PlayerPosition, SessionView } from "../../session/useSession.ts";
import { ExerciseFigure } from "../ExerciseFigure.tsx";
import { useCompleteSession } from "../document.ts";
import type { SessionLogs } from "../document.ts";
import { AlertBanner } from "./AlertBanner.tsx";
import { PrimaryButton, SecondaryButton } from "./Buttons.tsx";
import { Comparison } from "./Comparison.tsx";
import { CountdownRing } from "./CountdownRing.tsx";
import { CueList, SafetyCue } from "./Cues.tsx";
import { Dots } from "./Dots.tsx";
import { HonestNote, PosturalNote } from "./HonestNote.tsx";
import { LogControls } from "./LogControls.tsx";
import { Eyebrow, Shell, ShellBody, ShellFooter, ShellRail } from "./Shell.tsx";
import { SessionBar } from "./SessionBar.tsx";
import { useWide } from "./useMedia.ts";
import { StopRule } from "./StopRule.tsx";
import { PatternIcon } from "./icons.tsx";
import { LADDERS } from "../../domain/ladders.ts";
import { lastRecordFor, sanitiseLog } from "./history.ts";
import { rungSummary, targetLabel, unitWord } from "./format.ts";

/**
 * The player: one page per exercise, and the heart of the app.
 *
 * ── Next is never gated. Not once, not for a moment. ────────────────────────
 *
 * There is no `disabled` anywhere below, and there is no state in which one
 * could be added without contradicting the design: **the app does not judge
 * effort and trusts the user**. It records sets only when the user logs them, and
 * nothing logged ever changes the schedule (corpus/wiki/reversals.md). Next is live
 * before the countdown is started, while it runs, and after it is abandoned. On
 * a rep exercise there is no clock at all. A control that waited for a timer
 * would be the app deciding whether the work happened, which is precisely the
 * category of feature this design deletes — and there is a test asserting it,
 * because a plausible-looking `disabled={countdown.running}` is the single
 * easiest way to break this app.
 *
 * **Logging does not gate it either, and that is the v4 version of the same
 * rule.** `Log 8` and `Log other` sit beside Next, not in front of it. Walking
 * the whole session without touching them is the default path and records a
 * document with no `logged` key anywhere in it, which is a valid, complete,
 * unremarkable session.
 *
 * ── What one tap of Next means ──────────────────────────────────────────────
 *
 * "I am ready for the next thing." It fills a dot; the last dot moves to the
 * next exercise; the last exercise finishes the session. Rest is however long
 * the user takes before tapping, so there is no rest timer — a rest timer would
 * be the app measuring something.
 *
 * ── State: two numbers in the URL, one map in memory ────────────────────────
 *
 * `itemIndex` and `dotsFilled` live in the route's search params, which is what
 * makes a reload mid-plank resume on the same exercise and the back button undo
 * a mis-tap. The logs do **not**: they are component state, deliberately.
 * Putting them in the URL would mean a URL that grows with every tap, a back
 * button that un-logs a set as a side effect of moving between exercises, and a
 * training record pasteable into a chat window. The cost is that a genuine
 * mid-session reload loses what was logged so far but not where you are — the
 * position is the part that matters standing on a mat, and the logs are optional
 * by construction.
 *
 * ── Announcements ───────────────────────────────────────────────────────────
 *
 * One polite region here, for set and exercise transitions, and a second inside
 * `CountdownRing` for ten-seconds and time-up. They are separate because this
 * one fires on rep exercises too, where there is no clock to hang it off. The
 * countdown numeral itself is `aria-hidden` and is never in a live region — see
 * `CountdownRing`.
 */

export interface PlayerProps {
  readonly doc: StateDoc;
  readonly username: string;
  readonly prescription: Prescription;
  readonly rawPosition: Partial<PlayerPosition>;
  /** `store.readOnlyReason`, verbatim, when the store will refuse to write. */
  readonly readOnly: string | null;
  readonly onMove: (position: PlayerPosition) => void;
  readonly onFinished: () => void;
  /** Leave without recording. Nothing was measured, so nothing is lost. */
  readonly onStop: () => void;
}

export function Player(props: PlayerProps) {
  const view = useSession(props.prescription, props.rawPosition);
  // A prescription with no items is not producible by any rotation slot; handled
  // rather than asserted, because the alternative is a thrown error on the one
  // screen that matters.
  if (view === null) {
    return (
      <Shell>
        <ShellRail>Session</ShellRail>
        <ShellBody>
          <p className="text-body text-tx2">This session has nothing in it. Go back and start again.</p>
        </ShellBody>
        <ShellFooter>
          <PrimaryButton onClick={props.onStop}>Back</PrimaryButton>
        </ShellFooter>
      </Shell>
    );
  }
  return <PlayerPage {...props} view={view} />;
}

/**
 * Per-item logs, indexed by set.
 *
 * `null` in a slot means "this set was not logged", which is why the array is
 * not `number[]`: sets are walked in order but logging them is optional per set,
 * so set 2 can carry a value while set 1 does not. `finishLogs` below is where
 * the holes are resolved.
 */
type ItemLogs = ReadonlyMap<number, readonly (number | null)[]>;

/**
 * Collapse the in-memory logs into what the codec will store.
 *
 * Two things happen here and both are lossy in a chosen direction:
 *
 *   - **Holes are dropped, not zero-filled.** A zero would mean "I did nothing",
 *     which is a real and different answer (`ExerciseRecord.logged`); an unlogged
 *     set means no answer was given. Dropping keeps `length <= sets` true and
 *     never invents a claim, at the cost of the array no longer saying *which*
 *     sets the values came from. The field's contract is "what the user actually
 *     did, per set, when they chose to say", and that is what survives.
 *   - **An item with no values at all is omitted entirely**, so its `logged` key
 *     is absent rather than `[]`. Absent means not logged; `[]` means logged
 *     nothing. Emitting `[]` for somebody who never touched the log buttons
 *     would record the loudest of the three values for the quietest of the three
 *     intentions.
 *
 * `sanitiseLog` then enforces what `parse` will accept. That is not defensive
 * politeness: an out-of-range entry makes the document unreadable on next load
 * and blocks the entire app behind the corrupt-document screen.
 */
function finishLogs(logs: ItemLogs, prescription: Prescription): SessionLogs {
  const out = new Map<number, readonly number[]>();
  for (const [itemIndex, sets] of logs) {
    const item = prescription.items[itemIndex];
    if (item === undefined || item.type !== "exercise") continue;
    const values = sets.filter((value): value is number => value !== null);
    if (values.length === 0) continue;
    out.set(itemIndex, sanitiseLog(values, item.sets));
  }
  return out;
}

function PlayerPage({
  doc,
  username,
  prescription,
  view,
  readOnly,
  onMove,
  onFinished,
  onStop,
}: PlayerProps & { readonly view: SessionView }) {
  const complete = useCompleteSession(username);
  // Two taps inside the same microtask would otherwise record the session twice
  // and advance every counter by two. Not a `disabled` — the button stays live;
  // the second tap is simply ignored.
  const recorded = useRef(false);
  const [logs, setLogs] = useState<ItemLogs>(() => new Map());

  const { item, position, dotCount, secondsOnTheClock } = view;
  const countdown = useCountdown(secondsOnTheClock ?? 0, `${position.itemIndex}:${position.dotsFilled}`);

  const finishing = view.nextPosition === "finished";
  const cardio = item.type === "cardio";

  const setLog = useCallback(
    (value: number | null) => {
      setLogs((previous) => {
        const next = new Map(previous);
        const sets = [...(next.get(position.itemIndex) ?? [])];
        // The array is grown to the set being logged rather than pre-filled, so
        // its length is always "how far the user has logged to" and never a
        // claim about sets that have not happened.
        while (sets.length <= position.dotsFilled) sets.push(null);
        sets[position.dotsFilled] = value;
        next.set(position.itemIndex, sets);
        return next;
      });
    },
    [position.itemIndex, position.dotsFilled],
  );

  function next(): void {
    if (view.nextPosition !== "finished") {
      onMove(view.nextPosition);
      return;
    }
    if (recorded.current) return;
    recorded.current = true;
    complete.mutate(
      { doc, prescription, logs: finishLogs(logs, prescription) },
      {
        onSuccess: onFinished,
        // A refused local save means the store is read-only. Let them try again
        // rather than swallowing it: the banner carries the store's own words.
        onError: () => {
          recorded.current = false;
        },
      },
    );
  }

  const cues = cardio ? item.protocol.cues : item.rung.cues;
  const safety = !cardio && item.rung.safetyCritical === true ? cues[0] : undefined;
  const listedCues = safety === undefined ? cues : cues.slice(1);

  const loggedHere = logs.get(position.itemIndex)?.[position.dotsFilled] ?? null;
  const previous = cardio ? null : lastRecordFor(doc.history, item.pattern);

  const wide = useWide();
  const name = cardio ? item.protocol.label : item.rung.name;
  const setWord = cardio ? "Round" : "Set";

  // The row under the figure, the rung's place on its ladder: one tick a rung.
  const ladder = cardio ? null : (
    <div aria-hidden="true" className="mt-[var(--sp-2)] flex max-w-[200px] gap-[var(--sp-1)]">
      {Array.from({ length: LADDERS[item.pattern].rungs.length }, (_, index) => (
        <i
          key={index}
          className={`block h-2 flex-1 rounded-[3px] ${index === item.rungIndex ? "bg-accent" : "bg-line2"}`}
        />
      ))}
    </div>
  );

  const figure = (
    <div
      className={
        "grid place-items-center rounded-[12px] bg-s2 text-tx " +
        (cardio
          ? "h-[116px] min-[840px]:h-[176px]"
          : "h-[116px] max-[389px]:h-[96px] min-[840px]:h-auto min-[840px]:min-h-[300px] min-[840px]:flex-1")
      }
    >
      {cardio ? (
        <span className="text-accent">
          <PatternIcon pattern={null} size={wide ? 96 : 56} />
        </span>
      ) : (
        <ExerciseFigure rung={item.rung} size={wide ? 320 : 96} />
      )}
    </div>
  );

  const heading = (
    <div className="min-w-0">
      <h1 className="text-title leading-[var(--lh-title)] font-extrabold tracking-[var(--ls-title)] text-balance max-[389px]:text-[1.5rem] min-[840px]:text-[2rem]">
        {name}
      </h1>
      <p className="mt-[2px] flex flex-wrap gap-x-3 text-meta text-tx2 tabular-nums min-[840px]:text-body">
        {cardio ? (
          <>
            <span>{item.rounds} rounds</span>
            <span>{item.protocol.hardSeconds}s hard</span>
            <span>no ladder</span>
          </>
        ) : (
          <>
            <span>{rungSummary(item)}</span>
            <span>{item.pattern} ladder</span>
          </>
        )}
      </p>
      {ladder}
    </div>
  );

  const cueList = <CueList cues={listedCues} />;
  const notes = (
    <>
      {!cardio && item.ladderKind === "postural" ? <PosturalNote /> : null}
      {cardio ? <HonestNote label="What this dose reaches">{item.protocol.notice}</HonestNote> : null}
    </>
  );

  const setCard = (
    <section
      aria-label="This set"
      className="rounded-lg border border-line bg-s1 px-[var(--sp-4)] py-[var(--sp-3)] shadow-1 max-[389px]:px-[var(--sp-3)] max-[389px]:py-[var(--sp-2)] min-[840px]:px-6 min-[840px]:pt-5 min-[840px]:pb-6"
    >
      <div className="flex items-center justify-between gap-[var(--sp-3)]">
        <h2 className="text-body leading-[1.3] font-bold tabular-nums min-[840px]:text-h">
          {`${setWord} ${position.dotsFilled + 1} of ${dotCount}`}
        </h2>
        <Dots filled={position.dotsFilled} total={dotCount} noun={cardio ? "rounds" : "sets"} />
      </div>

      {item.type === "exercise" && item.unit === "reps" ? (
        <RepTarget item={item} />
      ) : (
        <>
          <CountdownRing
            total={secondsOnTheClock ?? 0}
            remaining={countdown.remaining}
            started={countdown.running || countdown.finished}
            label={cardio ? `${secondsOnTheClock} second hard round` : `${secondsOnTheClock} second hold`}
          >
            <span className="block text-mono leading-none font-extrabold tracking-[var(--ls-hero)] tabular-nums">
              {countdown.remaining}
            </span>
            <Eyebrow>{unitWord("seconds", countdown.remaining)}</Eyebrow>
          </CountdownRing>
          <div className="mt-[var(--sp-3)]">
            <SecondaryButton onClick={countdown.running ? countdown.reset : countdown.start}>
              {countdown.running
                ? "Stop the clock"
                : countdown.finished
                  ? `Run ${secondsOnTheClock}s again`
                  : `Start ${secondsOnTheClock}s`}
            </SecondaryButton>
            <p className="mt-[var(--sp-2)] text-center text-label text-tx2">
              The countdown is a guide. Next is live whether or not you run it.
            </p>
          </div>
        </>
      )}

      {cardio || item.type !== "exercise" ? null : (
        <Comparison
          unit={item.unit}
          lastTarget={previous?.targetValue ?? null}
          todayTarget={item.targetValue}
          lastLogged={previous?.logged ?? null}
        />
      )}
    </section>
  );

  const actions = (
    <>
      {cardio ? (
        // The cardio slot has no target field at all, by design: it is prescribed
        // by breathlessness, and a number is something you can quietly pace yourself
        // down to. A "log your rounds" button would put one back.
        <p className="text-center text-meta text-tx2">
          Judged by your breathing, not by a count. There is nothing to log.
        </p>
      ) : (
        <>
          <p className="text-center text-meta text-tx2 max-[389px]:text-label">
            Log the set, or just tap next — nothing here is required.
          </p>
          <LogControls target={item.targetValue} unit={item.unit} logged={loggedHere} onLog={setLog} />
        </>
      )}
      <PrimaryButton data-testid="next" onClick={next}>
        {finishing ? "Finish" : cardio ? "Next round" : "Next set"}
      </PrimaryButton>
    </>
  );

  return (
    <Shell>
      <SessionBar label={prescription.label} number={view.itemNumber} count={view.itemCount} onStop={onStop} />

      {/*
        The set transition announcement. One polite region, and its content
        changes exactly when the position does — which is what makes a live
        region fire once rather than needing a ref to remember whether it has.
        It carries the target as prose, because "3 × 8" is not a quantity to a
        screen reader.
      */}
      <p data-testid="set-announcement" className="sr-only" aria-live="polite">
        {cardio
          ? `Round ${position.dotsFilled + 1} of ${dotCount}. ${item.protocol.label}.`
          : `Set ${position.dotsFilled + 1} of ${dotCount}. ${item.rung.name}, ${targetLabel(item)}.`}
      </p>

      <ShellBody>
        <div className="grid gap-[var(--sp-3)] pt-[var(--sp-3)] max-[389px]:gap-[var(--sp-2)] min-[840px]:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] min-[840px]:items-stretch min-[840px]:gap-[var(--sp-4)] min-[840px]:pt-[var(--sp-4)]">
          <div className="grid content-start gap-[var(--sp-3)] max-[389px]:gap-[var(--sp-2)] min-[840px]:gap-[var(--sp-4)]">
            {readOnly === null ? null : <AlertBanner label="Read-only" text={readOnly} />}
            {complete.error === null ? null : <AlertBanner label="Not saved" text={complete.error.message} />}

            <section className="flex flex-col rounded-lg border border-line bg-s1 p-[var(--sp-3)] shadow-1 max-[389px]:p-[var(--sp-2)] min-[840px]:min-h-0 min-[840px]:p-6">
              <div className="grid grid-cols-[116px_minmax(0,1fr)] items-center gap-x-4 max-[389px]:grid-cols-[96px_minmax(0,1fr)] max-[389px]:gap-x-3 min-[840px]:flex min-[840px]:flex-col-reverse min-[840px]:items-stretch min-[840px]:gap-4">
                {figure}
                {heading}
              </div>
              {wide ? <div className="mt-[var(--sp-4)]">{cueList}</div> : null}
            </section>

            {/* Above the target, not below it: its own label is "Read before
                starting". It is the only element in the app that outranks the number. */}
            {safety === undefined ? null : <SafetyCue text={safety} />}
          </div>

          <div className="grid content-start gap-[var(--sp-3)] max-[389px]:gap-[var(--sp-2)] min-[840px]:gap-[var(--sp-4)]">
            {setCard}

            {/* Above the cues AND beside the comparison, never below them: a
                safety line that is legible right up to the moment it stops being
                legible is worse than one plainly below the fold. */}
            {cardio ? null : <StopRule text={item.rung.stopRule} />}

            {wide ? (
              <section className="grid gap-[var(--sp-2)] rounded-lg border border-line bg-s1 px-6 pt-5 pb-6 shadow-1">
                {actions}
              </section>
            ) : (
              <>
                <div>{cueList}</div>
                <div>{notes}</div>
              </>
            )}
          </div>
        </div>
        {wide ? notes : null}
      </ShellBody>

      {wide ? null : <ShellFooter>{actions}</ShellFooter>}
    </Shell>
  );
}

function RepTarget({ item }: { readonly item: PrescribedExercise }) {
  return (
    <div className="mt-[var(--sp-2)] grid justify-items-center text-center max-[389px]:mt-0">
      <span
        aria-hidden="true"
        className="block pt-[var(--sp-2)] text-hero leading-[var(--lh-hero)] font-extrabold tracking-[var(--ls-hero)] tabular-nums max-[389px]:pt-[var(--sp-1)] max-[389px]:text-[4.5rem] min-[840px]:text-[8.25rem]"
      >
        {item.targetValue}
      </span>
      <span aria-hidden="true" className="mt-[var(--sp-1)]">
        <Eyebrow>{unitWord(item.unit, item.targetValue)} this set</Eyebrow>
      </span>
      {/* The visible pair reads as "3 x 8" to a screen reader, which is not a
          quantity. This is the same number as a sentence. */}
      <span className="sr-only">{targetLabel(item)}</span>
    </div>
  );
}
