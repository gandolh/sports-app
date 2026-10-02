/**
 * The animation clock: `Rung.modifier` → a keyframe timeline.
 *
 * This module is why five drawings produce 35 visibly distinct results. A figure
 * knows two poses and nothing else; everything that separates
 * `push-05-full-3s-down` from `push-06-full-3s-down-2s-bottom-hold` — same
 * ladder, same pose, same overlay set — lives in the *timing* derived here. Rung
 * 5 turns around instantly at the bottom; rung 6 stops dead there for a count of
 * two. That difference is the reason this module exists, so
 * `__tests__/motion.test.ts` asserts the two timelines differ rather than merely
 * that each one is well-formed.
 *
 * ## The position axis
 *
 * A timeline is a walk along **one number**: `0` is the figure's drawn `start`
 * pose, `1` is its drawn `end` pose. Every figure is a rig (`rig.ts`): one
 * skeleton, a length per bone, an angle per bone per phase. So a position is a
 * pose — the same skeleton part-rotated — and `motionStyles` samples the
 * timeline, solves each sample, and emits one `@keyframes` per bone.
 *
 * (Until brief 23 the two poses were independent drawings, crossfaded, and this
 * comment said there was nothing to tween because their path shapes differed.
 * That was never the blocker: the poses shared a topology. The blocker was that
 * their bone lengths disagreed, and a rig makes that unrepresentable.)
 *
 * Keeping the timeline as an abstract 0..1 position rather than as CSS is what
 * keeps the clock unit-testable without a DOM, and it is why the rig could
 * replace the crossfade without touching `buildTimeline`.
 *
 * ## Which pose is "lowered" — the decision that has no test
 *
 * A slow eccentric must animate as a slow *lowering*. Getting the direction
 * backwards turns rung 5's three-second descent into a three-second lift, which
 * is worse than not animating at all — and no assertion can catch it, because
 * both directions produce a well-formed timeline. So it is stated as data, per
 * pattern, with the reasoning next to it (`LOWERED_PHASE` below).
 *
 * The rule that emerged from reading all five drawings: **a figure's `end` pose
 * is the pose its `MovementArrow` points at — the emphasised end of the rep, not
 * necessarily the low end of it.** For a push-up and a squat that is the bottom.
 * For a glute bridge, a prone raise and a hollow-body it is the *top*. Hence
 * three of the five patterns run their eccentric from `end` back to `start`.
 *
 * ## Real time, compressed
 *
 * Segment lengths are proportional to the real prescription and then scaled by a
 * single factor (`MOTION_SCALE`), so every ratio that distinguishes one rung from
 * another survives intact. See the constant for why 0.6.
 */
import type { Modifier } from '../../domain/types.ts'
import type { RigPartId } from './primitives.tsx'
import { boneEntries, localAngles, resolvePhasePose, sampleTimeline } from './rig.ts'
import type { RigPose } from './rig.ts'
import type { FigurePhase, Rig } from './types.ts'

/**
 * Which drawn phase is the **lowered / de-loaded** end of each pattern's rep —
 * the pose a slow eccentric arrives at, and the pose `pauseAt: 'bottom'` holds.
 *
 * Read off the actual drawings and the actual rung cues, pattern by pattern:
 *
 *   - **push** — `Push.tsx` draws `start` with straight arms (head y 70) and
 *     `end` with bent elbows and the chest low (head y 120). `end` is the
 *     bottom. `push-05`: "three full seconds on the way down only… then press
 *     back up". Eccentric runs `start` → `end`.
 *   - **squat** — `Squat.tsx` draws `start` standing (hip y 100) and `end` in the
 *     hole (hip y 140, thighs parallel). `end` is the bottom. `squat-03`: "three full
 *     seconds… from standing to thighs parallel". Eccentric runs `start` → `end`.
 *   - **hinge** — `Hinge.tsx` draws `start` lying with the hips down (hip y 158)
 *     and `end` bridged (hip y 112). **`end` is the TOP.** `hinge-01`: "lift your
 *     hips… then lower until your backside just brushes the floor", and
 *     `hinge-02` holds at the top, which is the bridged pose. The eccentric —
 *     `hinge-06`'s five-second slide-out, which ends with the legs straight and
 *     the hips coming down — runs `end` → `start`.
 *   - **prone** — `Prone.tsx` draws `start` face-down with the hands by the hips
 *     (y 151/152) and `end` with the arms overhead in a Y (y 72/62). **`end` is
 *     the raised, loaded pose.** `pull-05`'s comment in `ladders.ts` is explicit
 *     that its `pauseAt: 'bottom'` means "the bottom of the pull, elbows driven
 *     past the ribs" — arms *down*, which is the drawn `start`. So `'bottom'`
 *     maps to `start` here, and the de-loading direction (arms drifting back to
 *     the floor, which is every prone rung's stated failure signal) is
 *     `end` → `start`.
 *   - **plank** — `Plank.tsx` draws `start` as a flat plank (hip y 96) and `end`
 *     as the hollow, hips-lifted shape (hip y 82). `end` is the braced, raised
 *     pose; `start` is the relaxed one.
 *
 * **A sixth pose needs an entry here.** There is deliberately no sixth pose
 * today (see the retired-rung note in `ladders.ts`), and an unlisted id falls
 * back to `'end'` — the push/squat convention — rather than throwing, because a
 * content typo already renders a placeholder that never animates at all.
 */
export const LOWERED_PHASE: Readonly<Record<string, FigurePhase>> = {
  push: 'end',
  squat: 'end',
  hinge: 'start',
  prone: 'start',
  plank: 'start',
}

/**
 * One second per unmodified phase — the tempo every rung without an
 * `eccentricSeconds` states in words ("about one second down, one second up").
 * The animation says exactly what the cue says.
 */
export const BASE_PHASE_SECONDS = 1

/**
 * Everything is scaled by this before it becomes CSS.
 *
 * Real time would make `push-06` a **six-second** loop (3s down + 2s hold + 1s
 * up). A figure sitting beside a set target is glanced at, not watched, and a
 * loop longer than the glance reads as a still image with an occasional twitch —
 * the failure mode this brief exists to avoid. 0.6 puts that worst case at 3.6s,
 * inside a single glance, while leaving the 2s hold at 1.2s of dead stillness,
 * which is an order of magnitude above the ~100ms at which a stop reads as a
 * dropped frame.
 *
 * **Scaling is uniform on purpose.** Every ratio that distinguishes one rung
 * from another — 3:1 eccentric-to-concentric, 2s of hold against 0s — is
 * preserved exactly, so compressing cannot cost discriminability. It is also
 * the only knob: nothing else in this file is a tuned number.
 */
export const MOTION_SCALE = 0.6

/** `eccentric` and `concentric` move; `hold` is the segment with no movement. */
export type MotionSegmentPhase = 'eccentric' | 'concentric' | 'hold'

export interface MotionSegment {
  readonly phase: MotionSegmentPhase
  readonly durationMs: number
  /** Position at the segment's start. `0` = the drawn `start` pose, `1` = `end`. */
  readonly from: number
  /** Position at the segment's end. Equal to `from` on a `hold`, by definition. */
  readonly to: number
}

export interface MotionTimeline {
  /** In order, and cyclic: the last segment's `to` returns to the first's `from`. */
  readonly segments: readonly MotionSegment[]
  readonly totalMs: number
  /** Which drawn phase this pattern's eccentric arrives at. See `LOWERED_PHASE`. */
  readonly loweredPhase: FigurePhase
  /** Position of the still segment, or `undefined` when the rung has no pause. */
  readonly holdAt: number | undefined
}

function scaledMs(seconds: number): number {
  // A hand-editable content file can hold a zero or a negative; clamp rather
  // than emit a CSS duration that would freeze or reverse the loop.
  return Math.max(1, Math.round(Math.max(0, seconds) * 1000 * MOTION_SCALE))
}

/**
 * Where a `pauseAt` sits on the position axis.
 *
 * `'bottom'` is the lowered pose and `'top'` the other one — which of the two is
 * the drawn `end` depends entirely on the pattern, which is the whole point of
 * `LOWERED_PHASE`. `'mid'` has no drawn pose, so it holds the crossfade halfway;
 * no rung currently uses it.
 */
function holdPosition(pauseAt: NonNullable<Modifier['pauseAt']>, loweredPhase: FigurePhase): number {
  if (pauseAt === 'mid') return 0.5
  const loweredPosition = loweredPhase === 'end' ? 1 : 0
  return pauseAt === 'bottom' ? loweredPosition : 1 - loweredPosition
}

/**
 * `Rung.modifier` → the timeline `ExerciseFigure.tsx` runs.
 *
 * `unilateral` and `elevation` are deliberately absent: they change *what is
 * drawn*, not *when*, and are handled as overlays. Feeding them into the clock
 * would make two rungs that differ only in leverage animate at different speeds,
 * which would be a lie about the tempo the cue text prescribes.
 */
export function buildTimeline(
  figureId: string | undefined,
  modifier: Modifier | undefined,
): MotionTimeline {
  const loweredPhase = (figureId ? LOWERED_PHASE[figureId] : undefined) ?? 'end'
  const eccentricMs = scaledMs(modifier?.eccentricSeconds ?? BASE_PHASE_SECONDS)
  const concentricMs = scaledMs(BASE_PHASE_SECONDS)

  // The loop always walks 0 → 1 → 0, because the drawn `start` pose is where
  // every rep begins. Which of those two legs is the *eccentric* is what
  // `loweredPhase` decides.
  const outboundIsEccentric = loweredPhase === 'end'
  const outbound: MotionSegment = {
    phase: outboundIsEccentric ? 'eccentric' : 'concentric',
    durationMs: outboundIsEccentric ? eccentricMs : concentricMs,
    from: 0,
    to: 1,
  }
  const inbound: MotionSegment = {
    phase: outboundIsEccentric ? 'concentric' : 'eccentric',
    durationMs: outboundIsEccentric ? concentricMs : eccentricMs,
    from: 1,
    to: 0,
  }

  const segments: MotionSegment[] = []
  let holdAt: number | undefined

  if (modifier?.pauseSeconds) {
    // `pauseSeconds` with no `pauseAt` still means "the figure stops". The
    // loaded end is where a hold lives on every rung that names one, so guess
    // there rather than silently dropping a prescribed hold from the clock.
    holdAt = holdPosition(modifier.pauseAt ?? 'bottom', loweredPhase)
    const hold: MotionSegment = {
      phase: 'hold',
      durationMs: scaledMs(modifier.pauseSeconds),
      from: holdAt,
      to: holdAt,
    }

    if (holdAt === 0) {
      // A hold at the drawn `start` pose is the loop's own boundary. Placing it
      // first means the figure is at rest on first paint and only then moves —
      // the design system's "nothing animates on load" instinct, as close as a
      // looping clock can get to it.
      segments.push(hold, outbound, inbound)
    } else if (holdAt === 1) {
      segments.push(outbound, hold, inbound)
    } else {
      // A mid-rep pause splits the *eccentric* in half: a paused rep pauses
      // under load, on the way down, never on the way back. Both branches still
      // open at position 0, so the loop always begins from the pose the rep
      // begins from.
      const eccentric = outboundIsEccentric ? outbound : inbound
      const firstHalfMs = Math.max(1, Math.round(eccentric.durationMs / 2))
      const secondHalfMs = Math.max(1, eccentric.durationMs - firstHalfMs)
      const descend = [
        { ...eccentric, to: holdAt, durationMs: firstHalfMs },
        hold,
        { ...eccentric, from: holdAt, durationMs: secondHalfMs },
      ]
      if (outboundIsEccentric) segments.push(...descend, inbound)
      else segments.push(outbound, ...descend)
    }
  } else {
    segments.push(outbound, inbound)
  }

  return {
    segments,
    totalMs: segments.reduce((sum, segment) => sum + segment.durationMs, 0),
    loweredPhase,
    holdAt,
  }
}

/** The timeline as a CSS identifier fragment, readable in devtools as the
 * clock itself: `e0-100-1800_h100-100-1200_c100-0-600`. */
function timelineSlug(timeline: MotionTimeline): string {
  return timeline.segments
    .map(
      (s) =>
        `${s.phase.slice(0, 1)}${Math.round(s.from * 100)}-${Math.round(s.to * 100)}-${s.durationMs}`,
    )
    .join('_')
}

/**
 * A short, stable name for a rig's geometry (32-bit FNV-1a over its JSON, in
 * base 36).
 *
 * The keyframes depend on the rig as well as the clock, and `@keyframes` names
 * are global to the document. Several exercise cards are on screen at once, and
 * a push-up and a squat can share a clock; named by the clock alone, whichever
 * card rendered last would silently drive the other's bones. Hashing the
 * geometry rather than taking a figure id keeps the function honest — the name
 * changes exactly when the keyframes would — and identical rigs still share.
 */
function rigSlug(rig: Rig): string {
  let hash = 0x811c9dc5
  for (const char of JSON.stringify(rig)) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(36)
}

/**
 * The animation (and class) name for every moving part of a rig on a clock: the
 * shoulder anchor plus each bone `boneEntries` names. A one-bone limb is one
 * part, a two-bone limb two, so the set depends on the rig.
 *
 * The 20-odd rungs that share both a clock and a figure share one set of
 * `@keyframes`, so duplicated `<style>` tags are identical and harmless.
 */
export function motionClassNames(
  timeline: MotionTimeline,
  rig: Rig,
): ReadonlyMap<RigPartId, string> {
  const base = `exercise-figure-clock-${timelineSlug(timeline)}-${rigSlug(rig)}`
  const names = new Map<RigPartId, string>([['anchor', `${base}-anchor`]])
  for (const [id] of boneEntries(resolvePhasePose(rig, 'start'))) names.set(id, `${base}-${id}`)
  return names
}

/** Percentages and angles to four and three decimals, trailing zeros dropped. */
function trim(value: number, digits: number): string {
  return value.toFixed(digits).replace(/\.?0+$/, '') || '0'
}

function partTransform(pose: RigPose, local: ReadonlyMap<RigPartId, number>, part: RigPartId): string {
  if (part === 'anchor') {
    return `translate(${trim(pose.shoulder.x, 3)}px, ${trim(pose.shoulder.y, 3)}px)`
  }
  return `rotate(${trim(local.get(part) ?? 0, 3)}deg)`
}

/**
 * The timeline as a stylesheet fragment: one `@keyframes` per moving part, the
 * rules that bind them, and a reduced-motion guard.
 *
 * Stops come from `sampleTimeline`: every segment boundary, plus
 * `SAMPLES_PER_MOVING_SEGMENT` interior samples per moving segment, each solved
 * by FK or IK into concrete angles. The JS runs once per rung, when this string
 * is built; CSS interpolates between the stops, and since every stop is a
 * rotation of a fixed-length bone, nothing can stretch between them either. The
 * one approximation — a planted hand drifting slightly between stops, because an
 * IK path is not linear in its angles — is measured by `worstTipDrift` and held
 * under a unit by the sample count.
 *
 * **`linear`, deliberately, and this is not a style preference.** Any easing that
 * decelerates into the turnaround makes a rung *without* a pause appear to dwell
 * at the bottom, which is precisely the signal a rung *with* a pause is supposed
 * to own. The eased-motion instinct in `corpus/wiki/design-system.md` is about
 * discrete state changes; here a constant rate is what carries the information.
 * (Within a segment, constant rate means constant progress along the timeline;
 * a bone turning at a varying angular speed is the IK solution, not easing.)
 *
 * The `@media` block is belt-and-braces. `ExerciseFigure.tsx` branches in JS and
 * emits none of this when reduced motion is set — but `matchMedia` is absent
 * under SSR and in some test environments, and a figure that animates for
 * somebody who asked it not to is an accessibility failure, not a cosmetic one.
 * With the animation off, each part falls back to its static `transform`
 * attribute, which is the `end` pose (`RigFigure`).
 */
export function motionStyles(timeline: MotionTimeline, rig: Rig): string {
  const names = motionClassNames(timeline, rig)
  const samples = sampleTimeline(rig, timeline).map((sample) => ({
    percent: trim(sample.percent, 4),
    pose: sample.pose,
    local: localAngles(sample.pose) as ReadonlyMap<RigPartId, number>,
  }))
  const duration = `${timeline.totalMs}ms`
  const keyframes: string[] = []
  const rules: string[] = []
  for (const [part, name] of names) {
    const stops = samples.map(
      (sample) => `  ${sample.percent}% { transform: ${partTransform(sample.pose, sample.local, part)}; }`,
    )
    keyframes.push(`@keyframes ${name} {\n${stops.join('\n')}\n}`)
    rules.push(`.${name} { animation: ${name} ${duration} linear infinite; }`)
  }
  return [
    ...keyframes,
    ...rules,
    '@media (prefers-reduced-motion: reduce) {',
    `  ${[...names.values()].map((name) => `.${name}`).join(', ')} { animation: none; }`,
    '}',
  ].join('\n')
}
