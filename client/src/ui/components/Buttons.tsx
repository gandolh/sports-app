import type { ButtonHTMLAttributes } from 'react'
import { PressButton } from './PressButton.tsx'

/**
 * Three buttons, three heights, and the heights are the whole design.
 *
 *   56px  `PrimaryButton`    — `--tap-primary`. One per screen. Never two.
 *   48px  `SecondaryButton`  — `--tap-row`. The row above the primary.
 *   44px  `QuietButton`      — `--tap-min`. WCAG 2.2 AAA target size (2.5.8).
 *
 * **Nothing goes below 44px to look tidier.** That is the floor in
 * `tokens.css`, it is a hard requirement rather than a preference, and the most
 * common way it gets broken is a text-weight control — "Stop", "Log out" — that
 * is visually small and therefore feels like it should be physically small.
 * `QuietButton` is that control, and it is 44px tall whatever its label looks
 * like. The old world's 96px primary is retired: it was justified by a
 * floor-phone model that no longer holds, and 56px is what the category ships.
 *
 * All three are `PressButton`, so the press state arrives as `data-pressed` on
 * `pointerdown` rather than through `:active` — which on iOS Safari silently
 * does nothing for a plain `<button>` unless the document carries a touch
 * listener, i.e. on the one platform this app is installed on. The visual half
 * of that lives in `src/index.css` as a single rule.
 *
 * ── Why the primary has two tones ───────────────────────────────────────────
 *
 * `gradient` is the accent pairing from the design system and it marks the one
 * button that starts something. `flat` is the same button after that: `Next set`
 * is pressed seven or more times in a session and a gradient on it is a flourish
 * repeating itself, which is exactly the "scattered effects" the motion rule
 * forbids in the other medium. Same size, same ink, same contrast — the
 * `--on-accent` for each accent is derived against both ends of the gradient
 * precisely so this choice is a visual one and never a legibility one.
 */

type NativeButtonProps = ButtonHTMLAttributes<HTMLButtonElement>

// `flex` with a gap, not `grid place-items-center`: several of these carry an
// icon beside their label, and a single-cell grid stacks the two vertically —
// which reads as a two-line button rather than as a labelled icon.
const PRIMARY_BASE =
  'flex w-full items-center justify-center gap-[var(--sp-2)] rounded text-btn ' +
  'font-bold tracking-[-0.01em] text-on-accent shadow-2 h-[var(--tap-primary)]'

export function PrimaryButton({
  tone = 'gradient',
  className,
  ...rest
}: NativeButtonProps & { readonly tone?: 'gradient' | 'flat' }) {
  const fill =
    tone === 'gradient'
      ? 'bg-[linear-gradient(96deg,var(--accent-2),var(--accent))]'
      : 'bg-accent'
  return <PressButton className={`${PRIMARY_BASE} ${fill} ${className ?? ''}`} {...rest} />
}

/**
 * The row above the primary. Outlined rather than filled, because two filled
 * buttons stacked read as two primaries and the whole point of the band is that
 * there is one.
 */
export function SecondaryButton({ className, ...rest }: NativeButtonProps) {
  return (
    <PressButton
      className={
        'flex w-full items-center justify-center gap-[var(--sp-2)] rounded border ' +
        'border-line2 bg-transparent text-meta font-semibold text-tx2 h-[var(--tap-row)] ' +
        (className ?? '')
      }
      {...rest}
    />
  )
}

/**
 * Text-weight, and 44px tall anyway. Used for the rail's one leaving control.
 *
 * `inline-flex` with a horizontal pad rather than a fixed width: the label is
 * the whole affordance, so the hit area grows with it and never shrinks below
 * the floor.
 */
export function QuietButton({ className, ...rest }: NativeButtonProps) {
  return (
    <PressButton
      className={
        'inline-flex items-center gap-[var(--sp-1)] rounded-sm px-[var(--sp-2)] ' +
        'text-meta font-semibold text-tx2 min-h-[var(--tap-min)] ' +
        (className ?? '')
      }
      {...rest}
    />
  )
}
