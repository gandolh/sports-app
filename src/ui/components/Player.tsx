import { useRef } from 'react'
import type { PrescribedExercise, Prescription } from '../../domain/schedule.ts'
import type { StateDoc } from '../../domain/types.ts'
import { useCountdown } from '../../session/timer.ts'
import { useSession } from '../../session/useSession.ts'
import type { PlayerPosition, SessionView } from '../../session/useSession.ts'
import { ExerciseFigure } from '../ExerciseFigure.tsx'
import { useCompleteSession } from '../document.ts'
import { CountdownRing } from './CountdownRing.tsx'
import { CueList, SafetyCue } from './Cues.tsx'
import { Dots } from './Dots.tsx'
import { Banner, Notice, PosturalNotice } from './Notices.tsx'
import { PressButton } from './PressButton.tsx'
import { Body, Footer, Rail, Screen } from './Screen.tsx'
import { targetLabel, targetText, unitWord } from './format.ts'

/**
 * The player: one page per exercise, and the heart of the app.
 *
 * ── Next is never gated. Not once, not for a moment. ────────────────────────
 *
 * There is no `disabled` anywhere below, and there is no state in which one could
 * be added without contradicting the governing decision: **the app measures
 * nothing and trusts the user** (corpus/wiki/decisions.md). Next is live before
 * the countdown is started, while it runs, and after it is abandoned. On a rep
 * exercise there is no clock at all. A control that waited for a timer would be
 * the app deciding whether the work happened, which is precisely the category of
 * feature this design deletes — and there is a test asserting it, because a
 * plausible-looking `disabled={countdown.running}` is the single easiest way to
 * break this app.
 *
 * ── What one tap of Next means ──────────────────────────────────────────────
 *
 * "I am ready for the next thing." It fills a dot; the last dot moves to the next
 * exercise; the last exercise finishes the session. Rest is however long the user
 * takes before tapping, so there is no rest timer — a rest timer would be the app
 * measuring something.
 *
 * Both numbers live in the URL, so the position survives a reload and the back
 * button undoes a mis-tap. This component holds no session state of its own; the
 * only `useRef` here guards against a double-tap recording two sessions.
 */

export interface PlayerProps {
  readonly doc: StateDoc
  readonly username: string
  readonly prescription: Prescription
  readonly rawPosition: Partial<PlayerPosition>
  /** `store.readOnlyReason`, verbatim, when the store will refuse to write. */
  readonly readOnly: string | null
  readonly onMove: (position: PlayerPosition) => void
  readonly onFinished: () => void
  /** Leave without recording. Nothing was measured, so nothing is lost. */
  readonly onStop: () => void
}

export function Player(props: PlayerProps) {
  const view = useSession(props.prescription, props.rawPosition)
  // A prescription with no items is not producible by any rotation slot; handled
  // rather than asserted, because the alternative is a thrown error on the one
  // screen that matters.
  if (view === null) {
    return (
      <Screen>
        <Rail status="Session" />
        <Body>
          <p className="prose">This session has nothing in it. Go back and start again.</p>
        </Body>
        <Footer>
          <PressButton className="btn-primary" onClick={props.onStop}>
            Back
          </PressButton>
        </Footer>
      </Screen>
    )
  }
  return <PlayerPage {...props} view={view} />
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
  const complete = useCompleteSession(username)
  // Two taps inside the same microtask would otherwise record the session twice
  // and advance every counter by two. Not a `disabled` — the button stays live;
  // the second tap is simply ignored.
  const recorded = useRef(false)

  const { item, position, dotCount, secondsOnTheClock } = view
  const countdown = useCountdown(
    secondsOnTheClock ?? 0,
    `${position.itemIndex}:${position.dotsFilled}`,
  )

  const finishing = view.nextPosition === 'finished'

  function next(): void {
    if (view.nextPosition !== 'finished') {
      onMove(view.nextPosition)
      return
    }
    if (recorded.current) return
    recorded.current = true
    complete.mutate(
      { doc, prescription },
      {
        onSuccess: onFinished,
        // A refused local save means the store is read-only. Let them try again
        // rather than swallowing it: the banner carries the store's own words.
        onError: () => {
          recorded.current = false
        },
      },
    )
  }

  const cardio = item.type === 'cardio'
  const cues = cardio ? item.protocol.cues : item.rung.cues
  const safety = !cardio && item.rung.safetyCritical === true ? cues[0] : undefined
  const listedCues = safety === undefined ? cues : cues.slice(1)

  return (
    <Screen>
      <Rail status={`${prescription.label} · ${view.itemNumber} of ${view.itemCount}`}>
        <PressButton
          className="btn-quiet"
          onClick={onStop}
          aria-label="Stop this session. Nothing is recorded."
        >
          Stop
        </PressButton>
      </Rail>

      <Body>
        {readOnly === null ? null : <Banner label="Read-only" text={readOnly} />}
        {complete.error === null ? null : (
          <Banner label="Not saved" text={complete.error.message} />
        )}

        {cardio ? (
          <>
            <h1 className="day-title">{item.protocol.label}</h1>
            <p className="movement__meta">
              {`Round ${position.dotsFilled + 1} of ${dotCount} · ${item.protocol.hardSeconds}s hard`}
            </p>
            <p className="movement__meta">{item.protocol.movements.join('  ·  ')}</p>
          </>
        ) : (
          <div className="movement">
            <ExerciseFigure rung={item.rung} size={132} className="movement__figure" />
            <div>
              <h1 className="movement__name">{item.rung.name}</h1>
              <p className="movement__meta">
                {`Set ${position.dotsFilled + 1} of ${dotCount} · ${targetText(item)}`}
              </p>
            </div>
          </div>
        )}

        {/* Above the target, not below it, because the brief's word is "first" and
            the block's own label is "Read before starting". Below the hero numeral
            it was the seventh thing on the page and the first three of its lines
            were under the fold — a safety check nobody reads, which is the exact
            failure separating it out was meant to prevent. It is the only element
            in the app that outranks the number. */}
        {safety === undefined ? null : <SafetyCue text={safety} />}

        {item.type === 'exercise' && item.unit === 'reps' ? (
          <RepTarget item={item} />
        ) : (
          <CountdownRing
            total={secondsOnTheClock ?? 0}
            remaining={countdown.remaining}
            started={countdown.running || countdown.finished}
            label={
              cardio
                ? `${secondsOnTheClock} second hard round`
                : `${secondsOnTheClock} second hold`
            }
          >
            <span className="hero__value">{countdown.remaining}</span>
            <span className="hero__unit">{unitWord('seconds', countdown.remaining)}</span>
          </CountdownRing>
        )}

        <CueList cues={listedCues} />

        {!cardio && item.ladderKind === 'postural' ? <PosturalNotice /> : null}
        {cardio ? <Notice label="What this dose reaches" text={item.protocol.notice} /> : null}
      </Body>

      <Footer
        above={
          <div className="footer__group">
            <Dots
              filled={position.dotsFilled}
              total={dotCount}
              noun={cardio ? 'rounds' : 'sets'}
            />
            {secondsOnTheClock === null ? null : (
              <>
                <div className="footer__secondary">
                  <PressButton
                    className="btn-secondary"
                    onClick={countdown.running ? countdown.reset : countdown.start}
                  >
                    {countdown.running
                      ? 'Stop the clock'
                      : countdown.finished
                        ? `Run ${secondsOnTheClock}s again`
                        : `Start ${secondsOnTheClock}s`}
                  </PressButton>
                </div>
                <p className="footer__note">
                  The countdown is a guide. Next is live whether or not you run it.
                </p>
              </>
            )}
          </div>
        }
      >
        <PressButton className="btn-primary" data-testid="next" onClick={next}>
          {finishing ? 'Finish' : 'Next'}
        </PressButton>
      </Footer>
    </Screen>
  )
}

/** A rep target has no clock, so it is the numeral alone. */
function RepTarget({ item }: { readonly item: PrescribedExercise }) {
  return (
    <div className="hero">
      <span className="hero__value" aria-hidden="true">
        {item.targetValue}
      </span>
      <span className="hero__unit" aria-hidden="true">
        {unitWord(item.unit, item.targetValue)}
      </span>
      {/* The visible pair reads as "3 x 8" to a screen reader, which is not a
          quantity. This is the same number as a sentence. */}
      <span className="sr-only">{targetLabel(item)}</span>
    </div>
  )
}
