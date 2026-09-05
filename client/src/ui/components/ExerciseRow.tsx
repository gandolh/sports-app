import type { PrescribedItem } from '../../domain/schedule.ts'
import { PatternIcon } from './icons.tsx'
import { PosturalNote } from './HonestNote.tsx'
import { itemName, rungSummary, targetLabel, targetText } from './format.ts'

/**
 * One line of the plan: what the movement is, how much of it, and — on the pull
 * slot — what it does not train.
 *
 * ── It is not a button ──────────────────────────────────────────────────────
 *
 * A row that looked tappable would be promising a per-exercise screen that does
 * not exist and should not: the session is walked front to back in the player,
 * and letting somebody jump to exercise three would skip the two before it while
 * still recording all three as prescribed. The list is a list.
 *
 * That also means the 48px row minimum is about legibility rather than about a
 * target, and it is still 48px: this is read at arm's length, standing up,
 * deciding whether to start.
 *
 * ── The target reads twice ──────────────────────────────────────────────────
 *
 * `3 × 8` for the eye and "3 sets of 8 reps" for a screen reader, because the
 * first is rendered as "3 x 8", which is not a sentence and not a quantity.
 * Design system, accessibility: targets read as prose. The visible half is
 * `aria-hidden` rather than merely unlabelled, so the pair is announced once.
 *
 * ── `POSTURAL_NOTICE` rides with the row, not with the screen ───────────────
 *
 * Verbatim, wherever a pull exercise appears — and putting it here rather than
 * in each screen is what makes "wherever" true by construction. Today, the
 * player and (27b) the plan screen all render pull work through this component,
 * so none of them can forget it, and there is a test on each.
 */

export function ExerciseRow({ item }: { readonly item: PrescribedItem }) {
  const cardio = item.type === 'cardio'
  const postural = item.type === 'exercise' && item.ladderKind === 'postural'
  const rung = rungSummary(item)
  const unit = cardio ? 'rounds' : item.unit

  return (
    <li className="mt-[var(--sp-2)]">
      <div className="grid min-h-[var(--tap-row)] grid-cols-[2.6rem_minmax(0,1fr)_auto] items-center gap-[var(--sp-3)] rounded border border-line bg-s1 p-[var(--sp-2)] shadow-1">
        <span className="grid h-[2.6rem] w-[2.6rem] place-items-center rounded-sm bg-s2 text-accent">
          <PatternIcon pattern={cardio ? null : item.pattern} size={24} />
        </span>

        <span className="min-w-0">
          <span className="block truncate text-body font-semibold tracking-[-0.012em]">
            {itemName(item)}
          </span>
          <span className="block text-meta text-tx2">
            {cardio
              ? `${item.rounds} rounds · no ladder`
              : `${item.sets} sets${rung === null ? '' : ` · ${rung}`}`}
          </span>
        </span>

        <span className="text-right">
          <span
            aria-hidden="true"
            className="block text-body font-bold tracking-[-0.02em] whitespace-nowrap tabular-nums"
          >
            {targetText(item)}
          </span>
          <span aria-hidden="true" className="block text-label font-semibold text-tx3">
            {unit}
          </span>
          <span className="sr-only">{targetLabel(item)}</span>
        </span>
      </div>

      {/* On the cardio slot the item's name and the day's title are the same
          word, so the row alone says nothing the heading did not. The movements
          are what somebody standing on a mat actually wants from this line, and
          they are the protocol's own words. */}
      {cardio ? (
        <p className="mt-[var(--sp-1)] px-[var(--sp-1)] text-meta text-tx2">
          {item.protocol.movements.join('  ·  ')}
        </p>
      ) : null}

      {postural ? <PosturalNote inset /> : null}
    </li>
  )
}
