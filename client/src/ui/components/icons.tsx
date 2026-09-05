import type { ReactNode } from 'react'
import type { Pattern } from '@sports-app/shared/types.ts'

/**
 * The icon family. **Drawn, never typed** — there is no emoji anywhere in this
 * app and this file is the reason there does not need to be.
 *
 * ── Why a family and not a package ──────────────────────────────────────────
 *
 * Every icon below is one `<Icon>` plus paths, and `<Icon>` owns the four things
 * that make a set look like a set: a 24-unit box, a 1.6 stroke, round caps and
 * round joins. Those live in exactly one place so they cannot drift — a single
 * icon drawn at 2px reads as a different family at a glance, and an icon library
 * dropped in would bring its own answer to all four along with 900 glyphs the
 * app will never render.
 *
 * `stroke="currentColor"` and `fill="none"` throughout: an icon takes the colour
 * of whatever it sits inside, which is what lets the same flame render in
 * `--warn` on the streak pill and in `--tx3` in a spec strip.
 *
 * ── The streak pill is the reason this file exists ──────────────────────────
 *
 * A streak needs a flame, a flame has an emoji, and 🔥 is one keystroke and no
 * dependency. It is also a different typeface on every platform, unstyleable,
 * uncoloured by the accent, and the single loudest "assembled from defaults"
 * signal a fitness app can emit. `<FlameIcon>` is four path commands and it is
 * the whole of the argument for drawing the rest.
 *
 * ── Decorative by default ───────────────────────────────────────────────────
 *
 * Every icon here is `aria-hidden` unless given a `title`. Each one sits beside
 * its own text label — the tab bar, the exercise row, the two disclosures — so
 * announcing it would read the same word twice. `title` exists for the one case
 * that has no text beside it, and it turns the icon into `role="img"` with a
 * name rather than adding a `<title>` a screen reader may or may not reach.
 */

export interface IconProps {
  /** Rendered px, square. The 24-unit box scales; the stroke scales with it. */
  readonly size?: number
  readonly className?: string
  /** Supply ONLY when the icon carries meaning no adjacent text carries. */
  readonly title?: string
}

function Icon({
  size = 24,
  className,
  title,
  children,
}: IconProps & { readonly children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      className={className}
      {...(title === undefined
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': title })}
    >
      {children}
    </svg>
  )
}

// ─── Navigation ─────────────────────────────────────────────────────────────

export function TodayIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 10.5 12 4l8.5 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-4V15h-6v5.5H5A1.5 1.5 0 0 1 3.5 19Z" />
    </Icon>
  )
}

export function PlanIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    </Icon>
  )
}

export function ProgressIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 19.5V13m5 6.5V8m5 11.5v-5m5 5V5" />
    </Icon>
  )
}

export function YouIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8.5" r="3.6" />
      <path d="M4.8 20a7.4 7.4 0 0 1 14.4 0" />
    </Icon>
  )
}

// ─── Status ─────────────────────────────────────────────────────────────────

/** The streak pill. Drawn precisely so that 🔥 never gets a chance. */
export function FlameIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3c.6 3 2.4 4.2 3.8 5.8A7.5 7.5 0 0 1 18 13.6 6 6 0 0 1 6 13.6c0-2 .9-3.3 1.8-4.4.4 1 1 1.6 1.8 2 0-2.6.9-5.6 2.4-8.2Z" />
    </Icon>
  )
}

/** `<HonestNote>`. A disclosure mark, not an alarm — see that component. */
export function NoteIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8.2v4.6M12 16h.01" />
    </Icon>
  )
}

/** `<StopRule>`. The octagon is the one shape that means stop without words. */
export function StopIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 3.5h6L20.5 9v6L15 20.5H9L3.5 15V9Z" />
      <path d="M12 8v4.5M12 15.8h.01" />
    </Icon>
  )
}

/** The `safetyCritical` first cue: read this before you start, not after. */
export function ShieldIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.2 19 5.6v6c0 4-2.9 7.4-7 8.8-4.1-1.4-7-4.8-7-8.8v-6Z" />
      <path d="m9 12 2.2 2.2L15.4 10" />
    </Icon>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5 12.8 4.4 4.4L19 7.4" />
    </Icon>
  )
}

/** `Log other` — the set that was not the number on the screen. */
export function PencilIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 19.5h4l10-10a2.1 2.1 0 0 0-3-3l-10 10Z" />
      <path d="m14.5 7 2.5 2.5" />
    </Icon>
  )
}

/** Leave the session. Recording nothing is the whole point, so: a door, not an X. */
export function ExitIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13.5 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20h7" />
      <path d="M16 8.5 19.5 12 16 15.5M19 12h-8.5" />
    </Icon>
  )
}

// ─── Movement patterns ──────────────────────────────────────────────────────
//
// One per pattern plus cardio, and every one is a body doing the thing rather
// than a piece of equipment. That is not decoration: this is a zero-equipment
// programme (corpus/CLAUDE.md) and a dumbbell in the push row would be the same
// category of misrepresentation `POSTURAL_NOTICE` exists to prevent, in a
// 24px box.

export function PushIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 17h4l3-4 4 4h7" />
      <circle cx="17" cy="8" r="2.2" />
      <path d="M8.5 13.5 6 10.5" />
    </Icon>
  )
}

export function SquatIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="4.8" r="2.2" />
      <path d="M12 7.4v4.2l-3.2 3.2V20M12 11.6l3.2 3.2V20" />
      <path d="M8 9.5h8" />
    </Icon>
  )
}

export function HingeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="6.5" cy="7.5" r="2.2" />
      <path d="M8.6 8.8 15 11l3.5 1.5" />
      <path d="M15 11v9M15 11l-2.5 4" />
    </Icon>
  )
}

export function CoreIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.5 17h6l9-1.5" />
      <circle cx="19.5" cy="14" r="2.1" />
      <path d="M8.5 17v-3" />
    </Icon>
  )
}

/**
 * The pull slot. Shoulder blades drawing back — **not** a bar and not a rowing
 * cable, because there is no anchor and drawing one would say the opposite of
 * what `POSTURAL_NOTICE` says three lines further down the same screen.
 */
export function PostureIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="5.5" r="2.3" />
      <path d="M12 8v8m0 0-2.5 4m2.5-4 2.5 4M6 10l6 1 6-1" />
    </Icon>
  )
}

export function CardioIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 20.5S4.5 16 4.5 10.6A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 3c0 5.4-7.5 9.9-7.5 9.9Z" />
    </Icon>
  )
}

const PATTERN_ICONS: Readonly<Record<Pattern, (props: IconProps) => ReactNode>> = {
  push: PushIcon,
  squat: SquatIcon,
  hinge: HingeIcon,
  core: CoreIcon,
  pull: PostureIcon,
}

/**
 * The icon for a prescribed item. `null` means the cardio slot, which has no
 * pattern because it trains no ladder — see `PrescribedCardio`.
 */
export function PatternIcon({
  pattern,
  ...props
}: IconProps & { readonly pattern: Pattern | null }) {
  const Chosen = pattern === null ? CardioIcon : PATTERN_ICONS[pattern]
  return <Chosen {...props} />
}
