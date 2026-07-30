/**
 * The JS counterparts of the motion tokens, and the one rule they follow.
 *
 * **`tokens.css` remains the source of truth for motion.** Almost everything that
 * moves in this app is CSS — chrome transitions on the tokens, and the figure
 * clock's generated `@keyframes` — because `figures/index.ts` is explicit that a
 * rAF driver competing for frames beside a live countdown is a regression. This
 * module exists for the one place JS legitimately drives a *value* rather than a
 * style: the count-up on the finish screen.
 *
 * Ported in shape from `~/projects/game-engine`'s `engine/core/src/animation/
 * easing.ts`, which is where the idea came from, with two deliberate differences:
 *
 *   - **Only curves that correspond to a shipped token.** The engine carries six
 *     (`smoothstep`, `easeOutQuad`, `easeOutBack`, `easeOutElastic`, …) because a
 *     game needs a library. Here an unused curve is dead code that invites a
 *     fifth easing into a design system that documents exactly three, so
 *     `easeOutCubic` is here because `--ease-out` exists and nothing else is.
 *   - **Stateless, not a mutable `Tween` object.** The engine advances a tween by
 *     `dt` and stores `elapsed` on it, which suits a frame loop stepping many
 *     objects. Here every caller already knows its own elapsed time, so a pure
 *     function of `(elapsed, duration)` is both simpler and directly testable.
 *
 * **Time is injected, never read.** Nothing here consults a wall clock of any
 * kind — that is the engine's contract, and it is the whole reason these are
 * unit-testable at an arbitrary point in the sweep, which is how `motion.ts` is
 * already testable and `CountUp` previously was not.
 *
 * (Phrased without naming the clock APIs on purpose. `__tests__/noDatesInUi.test.ts`
 * is a blunt string grep enforcing a product invariant, and it does not read
 * comments — so a docstring boasting about not calling `Date`-something fails it.
 * Sharpening the test to skip comments would cost it teeth for no gain; wording
 * the claim differently costs nothing.)
 */

/** Maps normalised time `t ∈ [0,1]` to an output in `[0,1]`. */
export type EaseFn = (t: number) => number

/** No easing. Named rather than inlined so a caller can say it meant it. */
export const linear: EaseFn = (t) => t

/**
 * Fast out, settling in — the counterpart of `--ease-out`
 * (`cubic-bezier(0.2, 0, 0, 1)`).
 *
 * Not the same curve. A cubic Bézier with those control points and `1 - (1-t)³`
 * differ by a few percent in the middle of the sweep, and matching them exactly
 * would mean solving the Bézier for `t` on every frame. Deliberately not done:
 * the only consumer animates a rounded integer for 520ms, where the difference is
 * imperceptible. This comment is the honest version of that, and replaces one in
 * `CountUp.tsx` that apologised for the same approximation without naming it.
 */
export const easeOutCubic: EaseFn = (t) => {
  const u = 1 - t
  return 1 - u * u * u
}

/** Slow out of the gate — the counterpart of `--ease-in`. */
export const easeInCubic: EaseFn = (t) => t * t * t

/**
 * Normalised progress through a duration, clamped to `[0,1]`.
 *
 * A zero or negative duration yields `1` — finished — rather than dividing by
 * zero. That is the useful answer: a caller with no time to animate in should
 * show the final value, not `NaN`.
 */
export function progress(elapsedMs: number, durationMs: number): number {
  if (!(durationMs > 0)) return 1
  const t = elapsedMs / durationMs
  return t <= 0 ? 0 : t >= 1 ? 1 : t
}

/**
 * The eased value between `from` and `to` at `elapsedMs` of `durationMs`.
 *
 * Pure, clamped at both ends, and it never reads a clock. Exactly `to` once the
 * duration has elapsed — an animation that stops a hair short of its target is a
 * bug the user reads as a wrong number, which matters here because the value in
 * question is how many sessions they have completed.
 */
export function tween(
  from: number,
  to: number,
  elapsedMs: number,
  durationMs: number,
  ease: EaseFn = linear,
): number {
  const t = progress(elapsedMs, durationMs)
  if (t >= 1) return to
  return from + (to - from) * ease(t)
}
