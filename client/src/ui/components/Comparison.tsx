import type { TargetUnit } from '@sports-app/shared/types.ts'
import { Eyebrow } from './Shell.tsx'
import { deltaLabel, formatLog, logLabel, signedDelta, unitWord } from './format.ts'

/**
 * The strip under the target: what this was last time, what changed, and what
 * you said you actually did.
 *
 * ── The reversal this belongs to, and the argument it lost ──────────────────
 *
 * "No comparison affect" was locked until 2026-09-04: `Last time: 3×7` was never
 * to be coloured, and a regression was to be stated in words. The argument was
 * that comparison affect is guilt with extra steps, and
 * corpus/wiki/reversals.md is explicit that **nothing refuted it — it was
 * outranked**. So this component exists under protest, and the shape of that
 * protest is what the three cells are:
 *
 *   - Only an INCREASE is coloured, and only in the accent. There is no red
 *     cell. A schedule that goes down does so because a rung reset, which is
 *     the programme working, and painting it as a loss would be the app
 *     scolding somebody for its own arithmetic.
 *   - "Change" is the change in the **prescription**, not in you. The number
 *     was knowable on the day you installed the app: `prescribe()` is a pure
 *     function of sessions completed. The label says "target", not "progress".
 *   - The logged cell is an em dash when nothing was logged, and it is never
 *     styled as a gap to be filled. Not logging is the default path.
 *
 * ── There is deliberately no estimated 1RM here ─────────────────────────────
 *
 * The reference build shows one, and its own colophon says it "would need an
 * honest definition before it ships". It does not have one and cannot: every
 * 1RM formula maps a load and a rep count onto a heavier load, and there is no
 * load here — the resistance is a fraction of bodyweight that changes with hand
 * position, foot elevation and tempo, none of which the formula can see. The
 * number it would print is a plausible-looking constant times your rep count.
 *
 * An app whose central component is called `<HonestNote>` and whose one
 * unbreakable rule is that it does not pretend cannot put a fabricated strength
 * estimate on the training screen. The third cell is what was actually logged
 * instead, which is real, and which the person themselves typed in.
 *
 * ── First time through, this renders nothing ────────────────────────────────
 *
 * `lastTarget === null` means this pattern has never been recorded. A strip
 * reading "Last time —, Change —, Logged —" is three empty boxes teaching a new
 * user that the app is missing something.
 */

export interface ComparisonProps {
  readonly unit: TargetUnit
  /** The previous prescribed target for this pattern. `null` = never trained. */
  readonly lastTarget: number | null
  /** Today's target, post-variant. The number on the screen above this strip. */
  readonly todayTarget: number
  /**
   * The previous session's logged sets, or `null` for "not logged".
   *
   * `null` and `[]` are different and both are real: an absent `logged` key
   * means no answer was given, and an empty array means the person logged that
   * they did nothing. The codec keeps them apart, so this does too.
   */
  readonly lastLogged: readonly number[] | null
}

function Cell({
  value,
  label,
  srLabel,
  accent = false,
}: {
  readonly value: string
  readonly label: string
  readonly srLabel: string
  readonly accent?: boolean
}) {
  return (
    <div className="text-center">
      <span className="sr-only">{srLabel}</span>
      <span
        aria-hidden="true"
        className={
          'block text-body font-bold tracking-[-0.02em] tabular-nums ' +
          (accent ? 'text-accent' : 'text-tx')
        }
      >
        {value}
      </span>
      <span aria-hidden="true" className="block">
        <Eyebrow>{label}</Eyebrow>
      </span>
    </div>
  )
}

export function Comparison({ unit, lastTarget, todayTarget, lastLogged }: ComparisonProps) {
  if (lastTarget === null) return null

  const delta = todayTarget - lastTarget
  const suffix = unit === 'seconds' ? 's' : ''

  return (
    <div
      data-testid="comparison"
      className="mt-[var(--sp-4)] flex justify-center gap-[var(--sp-8)] border-y border-line py-[var(--sp-2)]"
    >
      <Cell
        value={`${lastTarget}${suffix}`}
        label="Last time"
        srLabel={`Last time the target was ${lastTarget} ${unitWord(unit, lastTarget)}.`}
      />
      <Cell
        value={signedDelta(delta)}
        label="Target change"
        accent={delta > 0}
        srLabel={`${deltaLabel(delta, unit)}. This is the schedule, not a measurement.`}
      />
      <Cell
        value={lastLogged === null ? '—' : formatLog(lastLogged)}
        label="You logged"
        srLabel={
          lastLogged === null
            ? 'You did not log that session.'
            : `${logLabel(lastLogged, unit)} last time.`
        }
      />
    </div>
  )
}
