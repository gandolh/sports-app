/**
 * Cues, and the one rule about them that is a safety requirement rather than a
 * layout preference.
 *
 * A rung is one movement plus a modifier, so adjacent rungs share a drawing and
 * differ only in tempo and pause. The cue text is therefore not commentary on the
 * figure — for most rungs it is the *only* thing that distinguishes this rung
 * from the one below it, which is why they are set at 19px rather than a caption
 * size (corpus/wiki/design-system.md: 17px is the body floor, 19px for cues).
 *
 * On a rung flagged `safetyCritical`, `cues[0]` renders in `SafetyCue` — its own
 * block, above the list, in a wash. The schedule reaches those rungs on a clock
 * rather than on readiness and there is no mechanism to step back, so the user
 * chose that cue text as the only brake they would have
 * (corpus/wiki/decisions.md, accepted risk). A safety check that is item one of
 * four in a list is a safety check nobody reads, which is the whole of the
 * failure this separation prevents.
 */

export function SafetyCue({ text }: { readonly text: string }) {
  return (
    <div className="safety" data-testid="safety-cue">
      <span className="safety__label">Read before starting</span>
      <p className="safety__text">{text}</p>
    </div>
  )
}

export function CueList({ cues }: { readonly cues: readonly string[] }) {
  return (
    <ul className="cues" data-testid="cue-list">
      {cues.map((cue, index) => (
        <li key={index} className="cue">
          <span className="cue__tick" aria-hidden="true" />
          <span>{cue}</span>
        </li>
      ))}
    </ul>
  )
}
