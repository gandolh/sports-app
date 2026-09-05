import { ShieldIcon } from './icons.tsx'

/**
 * Cues, and the one rule about them that is a safety requirement rather than a
 * layout preference.
 *
 * A rung is one movement plus a modifier, so adjacent rungs share a drawing and
 * differ only in tempo and pause. The cue text is therefore not commentary on
 * the figure — for most rungs it is the *only* thing that distinguishes this
 * rung from the one below it, which is why it is set at a real reading size
 * rather than a caption size (corpus/wiki/design-system.md).
 *
 * ── Numbered, because the order is the movement ─────────────────────────────
 *
 * Setup, then the standard, then where the modifier applies
 * (`domain/ladders.ts`). Read out of order they describe a different exercise,
 * and a bulleted list says nothing about order. The numerals are a CSS counter
 * on an `<ol>`, so the list is an ordered list to a screen reader too rather
 * than three paragraphs that happen to start with a digit.
 *
 * ── What is NOT in this list any more ───────────────────────────────────────
 *
 * The stop rule. It used to be `cues[3]` and it now has its own field on `Rung`
 * (brief 24) and its own component above this one (`StopRule.tsx`). If it ever
 * reappears at the bottom of this list, the brake has gone back below the fold.
 *
 * ── `safetyCritical` ────────────────────────────────────────────────────────
 *
 * On a rung flagged `safetyCritical`, `cues[0]` renders in `SafetyCue` — its own
 * block, above everything, in the danger hue. The schedule reaches those rungs
 * on a clock rather than on readiness and there is no mechanism to step back, so
 * the user chose that cue text as the only brake they would have
 * (corpus/wiki/decisions.md, accepted risk). A safety check that is item one of
 * three in a list is a safety check nobody reads, which is the whole of the
 * failure this separation prevents.
 */

export function SafetyCue({ text }: { readonly text: string }) {
  return (
    <div
      data-testid="safety-cue"
      className="mt-[var(--sp-3)] grid grid-cols-[20px_minmax(0,1fr)] gap-[var(--sp-2)] rounded border border-[color-mix(in_srgb,var(--dang)_38%,transparent)] bg-dang-bg p-[var(--sp-3)]"
    >
      <ShieldIcon size={20} className="mt-[1px] text-dang" />
      <div>
        <span className="block text-label font-bold uppercase tracking-[var(--ls-label)] text-dang">
          Read before starting
        </span>
        <p className="mt-[2px] text-body leading-[var(--lh-body)] text-tx">{text}</p>
      </div>
    </div>
  )
}

export function CueList({ cues }: { readonly cues: readonly string[] }) {
  return (
    <ol data-testid="cue-list" className="mt-[var(--sp-4)] grid gap-[var(--sp-3)]">
      {cues.map((cue, index) => (
        <li
          key={index}
          className="grid grid-cols-[1.3rem_minmax(0,1fr)] gap-[var(--sp-2)] text-meta leading-[var(--lh-body)] text-tx2"
        >
          {/* The numeral is `aria-hidden` because the `<ol>` already numbers the
              item for a screen reader; rendering it as text too would announce
              "one, one, setup your hands…". */}
          <span aria-hidden="true" className="font-bold text-tx3 tabular-nums">
            {index + 1}
          </span>
          <span>{cue}</span>
        </li>
      ))}
    </ol>
  )
}
