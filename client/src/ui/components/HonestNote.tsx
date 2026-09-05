import type { ReactNode } from 'react'
import { POSTURAL_NOTICE } from '../../domain/ladders.ts'
import { NoteIcon } from './icons.tsx'

/**
 * A persistent, labelled disclosure in the `warn` hue. **Never dismissible and
 * never red.**
 *
 * ── This is open question 8, and it is why brief 27 is not a reskin ─────────
 *
 * The category standard ships exactly two warning affordances: a red toast and a
 * destructive confirm. Both are *interruptions* — they assume something went
 * wrong, they assume the user should stop, and they assume the right outcome is
 * that they go away. Neither fits the sentence this app has to say:
 *
 *   "The gap is real and this app does not pretend otherwise."
 *
 * That is not an error. Nothing went wrong, there is nothing to fix, and the
 * user cannot make it untrue by acknowledging it. It is a standing fact about
 * the programme that stays true for as long as the programme does, so the
 * component that carries it is a **disclosure**: it sits in the flow, it is
 * labelled with the question it answers, and it has no close button.
 *
 * ── Three rules, and each is load-bearing ───────────────────────────────────
 *
 *   1. **Not dismissible.** No `onDismiss`, no `×`, and no prop to add one. A
 *      dismissible honesty notice is a notice the app is trying to get past.
 *   2. **`warn`, never `dang`.** `--dang` is for the stop rule — the one line
 *      that says end this set now. Painting a permanent, unactionable statement
 *      in the same hue teaches the user that the danger colour means nothing,
 *      which is exactly the reading that gets someone hurt on a
 *      `safetyCritical` rung. The hues are separate tokens and never the accent,
 *      which is what lets all eight accents ship without changing what a warning
 *      looks like.
 *   3. **The label is a question the screen provokes**, not a category. "What
 *      this slot does not train" is answerable; "Warning" is not. That is the
 *      difference between reading as information and reading as scolding.
 *
 * Three uses ship: `POSTURAL_NOTICE` wherever a pull exercise appears (below),
 * the missed-day line on the plan screen, and what the progress chart plots.
 * The last two are brief 27b's.
 *
 * `Notices.tsx` rendered this content against `app.css` and was deleted with it
 * on 2026-09-04, along with `/week`. This is the only implementation.
 */

export interface HonestNoteProps {
  /** The question this answers. Sentence case, no colon. */
  readonly label: string
  readonly children: ReactNode
  /** The tighter form used inside a list row, where the row already has padding. */
  readonly inset?: boolean
}

export function HonestNote({ label, children, inset = false }: HonestNoteProps) {
  return (
    <div
      data-testid="honest-note"
      className={
        'mt-[var(--sp-3)] grid grid-cols-[20px_minmax(0,1fr)] gap-[var(--sp-2)] rounded ' +
        'border border-[color-mix(in_srgb,var(--warn)_32%,transparent)] bg-warn-bg ' +
        (inset ? 'p-[var(--sp-2)]' : 'p-[var(--sp-3)]')
      }
    >
      <NoteIcon size={20} className="mt-[1px] text-warn" />
      <div>
        {/* `--fs-label` uppercase, in the warn hue: the label has to be findable
            without being loud, and at 13px it is the smallest thing on screen
            that is still allowed to be bold. */}
        <span className="block text-label font-bold uppercase tracking-[var(--ls-label)] text-warn">
          {label}
        </span>
        <p className="mt-[2px] text-meta leading-[var(--lh-body)] text-tx">{children}</p>
      </div>
    </div>
  )
}

/**
 * `POSTURAL_NOTICE`, **verbatim**, wherever a pull exercise appears — the plan
 * on Today, the player page, and (27b) the plan screen.
 *
 * There is no anchor in a zero-equipment programme, so the pull slot trains
 * scapular retraction and upper-back endurance and nothing else. Presenting that
 * as pulling strength is a misrepresentation with a physical consequence, and
 * the wording is a locked decision rather than copy to tighten
 * (corpus/wiki/programme.md). It is interpolated from the constant rather than
 * retyped so that it cannot drift, and a test asserts the rendered text contains
 * the constant.
 */
export function PosturalNote({ inset = false }: { readonly inset?: boolean }) {
  return (
    <HonestNote label="What this slot does not train" inset={inset}>
      {POSTURAL_NOTICE}
    </HonestNote>
  )
}
