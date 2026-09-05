import { StopIcon } from './icons.tsx'

/**
 * The store could not write, or the stored document could not be read.
 *
 * ── The text is never paraphrased ───────────────────────────────────────────
 *
 * `text` is whatever `store.readOnlyReason` or a `SaveResult` error said,
 * verbatim and with its line breaks intact. Those messages are already written
 * for a person who is about to lose training history, and flattening them into
 * "Something went wrong" is how a recoverable, hand-editable file becomes a
 * silently discarded one. `whitespace-pre-line` is what keeps the line breaks.
 *
 * ── Why this is `role="alert"` and `<HonestNote>` is not ────────────────────
 *
 * Something *has* gone wrong, it happened just now, and it changes what the user
 * should do next — an interruption is the correct affordance and an assertive
 * announcement is the correct behaviour. `<HonestNote>` is the opposite on all
 * three counts, which is the whole reason the two are separate components rather
 * than one with a `severity` prop. The hue difference follows from that rather
 * than decorating it: `dang` here, `warn` there.
 *
 * `Notices.tsx` held the previous version, rendering against `app.css`. Both
 * were deleted on 2026-09-04 once every route had been ported off them.
 */
export function AlertBanner({
  label,
  text,
}: {
  readonly label: string
  readonly text: string
}) {
  return (
    <div
      role="alert"
      className="mt-[var(--sp-3)] grid grid-cols-[20px_minmax(0,1fr)] gap-[var(--sp-2)] rounded border border-[color-mix(in_srgb,var(--dang)_38%,transparent)] bg-dang-bg p-[var(--sp-3)]"
    >
      <StopIcon size={20} className="mt-[1px] text-dang" />
      <div>
        <span className="block text-label font-bold uppercase tracking-[var(--ls-label)] text-dang">
          {label}
        </span>
        <p className="mt-[2px] text-meta leading-[var(--lh-body)] whitespace-pre-line text-tx">
          {text}
        </p>
      </div>
    </div>
  )
}
