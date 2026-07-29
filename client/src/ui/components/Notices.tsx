import { POSTURAL_NOTICE } from '../../domain/ladders.ts'

/**
 * The two things the app is obliged to say out loud, plus the banner it uses
 * when the store cannot write.
 *
 * `PosturalNotice` carries `POSTURAL_NOTICE` **verbatim**, wherever a pull
 * exercise appears — the plan on the home screen, the player page, and the week.
 * There is no anchor in a zero-equipment programme, so the pull slot trains
 * scapular retraction and upper-back endurance and nothing else. Presenting that
 * as pulling strength is a misrepresentation with a physical consequence, and the
 * wording is a locked decision rather than copy to tighten
 * (corpus/wiki/programme.md, corpus/wiki/decisions.md).
 *
 * `Notice` is the same shape for the cardio protocol's own honest limit, which is
 * `CardioProtocol.notice` and equally verbatim.
 */

export function Notice({
  label,
  text,
  inset = false,
}: {
  readonly label: string
  readonly text: string
  readonly inset?: boolean
}) {
  return (
    <div className={inset ? 'notice notice--inset' : 'notice'}>
      <span className="notice__label">{label}</span>
      <p className="notice__text">{text}</p>
    </div>
  )
}

/** `inset` for the tighter version used inside the home screen's plan list. */
export function PosturalNotice({ inset = false }: { readonly inset?: boolean }) {
  return <Notice label="What this trains" text={POSTURAL_NOTICE} inset={inset} />
}

/**
 * The read-only and unreadable-document states.
 *
 * `text` is whatever `store.readOnlyReason` or a `SaveResult` error said,
 * verbatim and with its line breaks intact. Those messages are already written
 * for a person who is about to lose training history, and paraphrasing them into
 * "Something went wrong" is how a recoverable hand-editable file becomes a
 * silently discarded one. A user whose document is corrupt must be told.
 */
export function Banner({ label, text }: { readonly label: string; readonly text: string }) {
  return (
    <div className="banner" role="alert">
      <span className="banner__label">{label}</span>
      <p className="banner__text">{text}</p>
    </div>
  )
}
