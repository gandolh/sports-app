import { StopIcon } from './icons.tsx'

/**
 * `Rung.stopRule`, in its own box, in the `dang` hue, **above the cues**.
 *
 * ── This is open question 9 ─────────────────────────────────────────────────
 *
 * Every rung has had a stop rule since brief 03 — "stop the set when your hips
 * sag", "stop the clock when your shoulders creep toward your ears" — and until
 * brief 24 it was `cues[3]`, an untyped convention. On screen that meant it
 * rendered as item four of four, below the fold, in the same grey as the setup
 * instructions.
 *
 * It is the one line that tells you when to END a set, in an app whose entire
 * premise is that the engine measures nothing and the user autoregulates
 * (corpus/wiki/reversals.md). It is the only brake there is. Position was
 * deciding its weight, so brief 24 made it a required field of `Rung` — required,
 * not optional, because optional means the thirty-sixth rung ships without one —
 * and this component is what that field is for.
 *
 * ── Above the cues, and outranked by nothing on the page ────────────────────
 *
 * There is a screen test asserting this component renders **before** the cue
 * list and is not inside it. That assertion is the whole feature: a brake you
 * have to scroll to is not a brake, and the single easiest way to undo this
 * change is to tuck the box into the top of the list "so it reads together".
 *
 * The one thing it does not outrank is `SafetyCue`, on the handful of rungs
 * flagged `safetyCritical`. That block is read *before you start*; this one is
 * read *while you are in the set*. Both are above the cues, in that order.
 *
 * ── Why `dang` and not `warn` ───────────────────────────────────────────────
 *
 * `<HonestNote>` is `warn` and is permanent, unactionable and true whether or
 * not you read it. This is the opposite: it is a single instruction, it is
 * actionable right now, and acting on it is the difference between a hard set
 * and an injury. Two hues, two meanings, and neither is ever the accent — which
 * is what lets the user pick any of the eight without changing what a warning
 * looks like.
 *
 * `--dang-bg` is deliberately NOT used as the fill. The box sits on `--bg` with
 * a `--line2` hairline, so the red is carried entirely by the icon and the
 * label. A red wash behind a paragraph on every single exercise page is an
 * alarm that fires forty times a week, and an alarm that always fires is
 * furniture.
 */

export function StopRule({ text }: { readonly text: string }) {
  return (
    <div
      data-testid="stop-rule"
      className="mt-[var(--sp-3)] grid grid-cols-[20px_minmax(0,1fr)] gap-[var(--sp-2)] rounded border border-line2 bg-bg p-[var(--sp-3)] shadow-1"
    >
      <StopIcon size={20} className="mt-[1px] text-dang" />
      <div>
        <span className="block text-label font-bold uppercase tracking-[var(--ls-label)] text-dang">
          Stop the set when
        </span>
        <p className="mt-[2px] text-body leading-[var(--lh-body)] text-tx">{text}</p>
      </div>
    </div>
  )
}
