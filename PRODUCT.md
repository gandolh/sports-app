# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A returning beginner training at home, on the floor, in one room, with **zero
equipment and no intention of buying any**. One primary user; weak multi-user exists
(a username keys a state document, a password is accepted and discarded) so a second
person can train on the same personal deployment. The product is shaped by one
person's constraints, not by a market.

The scene that governs every decision: phone in the hand or propped on the floor,
sweaty hands, mid-exhale, roughly twelve minutes, once a day. Every tap is expensive.

## Product Purpose

Remove the decision. The app opens already knowing what today's session is; the user
picks how hard a day they are having and works through the exercises one page at a
time. Success is that the session starts — decision fatigue, not programming quality,
is what actually kills home training.

Secondary purpose: state the honest limits of floor-only training out loud rather than
hiding them (no pulling strength is trainable; the cardio dose reaches 20–45% of the
guideline aerobic minimum).

## Positioning

Every competitor in the category is a **logging** app — Hevy, Strong, Freeletics, and
the self-hosted openGym — built around capture, charts, streaks and progressive-
overload arithmetic. This one arrives with the answer already made and asks for
nothing back. The mechanism is a **fixed schedule**: progression is one law
(`step = span ÷ sessions-in-six-weeks`), so the entire user state is one integer per
movement pattern and the prescription is interpolated rather than stored.

**A rung is one movement plus a modifier**, never a different exercise — difficulty
comes from tempo, pause, range, leverage and unilateral work, which are the levers
that substitute for load when load cannot be added.

## Operating Context

- **Four screens.** `/` today's session → the player → done. `/week` the next seven
  *sessions*. `/account` milestones and total work. `/login`.
- **Three-day rotation**, advanced by training and never by the calendar: Push ·
  Legs · Cardio, with a core-and-posture block every day. `Legs → Cardio → Push`
  order is locked by the concurrent-training literature.
- **The player** is one exercise per page: animated figure, the target number, two or
  three dots, a Next button. Holds get an *orientative* countdown ring that gates
  nothing. Rest is however long you take before tapping.
- **Offline-first PWA**, installed, service-worker precached. Nothing on the
  session-critical path may require network. Sync is fire-and-forget.
- Deployed under a sub-path on a personal VPS; a Fastify + node:sqlite service holds
  snapshot rows.

## Capabilities and Constraints

- **Zero equipment, floor and bodyweight only, one room.** Reaffirmed three times
  against specific no-purchase alternatives. Standing consequence the app must state
  rather than hide: lats, elbow flexors and grip receive no meaningful stimulus.
- **No dates anywhere in the UI.** No streak, no heatmap, no "3 days ago", no calendar,
  no % of a weekly goal, no trophy. Returning after two weeks must look identical to
  returning after one day. `completedAt` is stored; nothing in the UI may read it.
  Enforced by a `noDatesInUi` test and a byte-identical time-invariance snapshot.
- **Pure core, imperative shell**, enforced by eslint rather than convention:
  `client/src/domain/**` cannot touch a browser global, `new Date()`, `Date.now()`, or
  `Math.random()`. `shared/` is the wire contract and holds no behaviour.
- **The pull slot is postural, and the app says so.** `Ladder.kind` is `'postural'`,
  required rather than optional, and `POSTURAL_NOTICE` is surfaced verbatim on every
  screen a pull exercise appears on. Presenting it as pull strength is a safety
  misrepresentation.
- **Per-rung evidence caps**, not one range per ladder: front plank 20→60s, tuck L-sit
  10→30s, side plank 30→90s *total* split between sides. Reps cap at 12.
- Login is **not a security boundary**; anyone who knows a username can read that
  person's training history. Accepted, and no feature may treat it otherwise.
- **~634 tests** currently green across domain, persistence, server and UI.

### Reversed 2026-09-04, recorded in the corpus

Three decisions were reversed at the user's explicit direction during the v3 direction
round. All three are in `corpus/wiki/decisions.md` and `corpus/log.md`.

- **The app measures again.** Optional logging is in scope. The one thing that does not
  move: captured data may not silently drive the prescription (principle 4 below).
- **Dates are in scope** — a calendar, streaks, missed days, a weekly-goal percentage.
  `noDatesInUi.test.ts` and the time-invariance snapshot are deleted, not weakened.
- **Comparison affect is admitted** — "last time: 7" and an estimated 1RM.

The cost the reversals buy, stated so it is not rediscovered as a bug: **returning
after a long gap no longer looks identical to returning after one day.**

### Known defect, carried

Open question 7: the interpolation assumes rung N+1's minimum is about as hard as rung
N's maximum, and on `push-03-knees` 12 reps → `push-04-full` 5 reps that is badly
false. Difficulty is **front-loaded inside each rung** while the UI presents a smooth
ramp. The honest fixes are content, not code.

## Brand Commitments

Name: **sports-app** (working name; nothing is branded yet). No logo, no wordmark.

Voice is **imperative and factual**. No motivational copy — "Crush it", "Beast mode"
and their register are out. The app has no opinion about the user's character. A
missed day is never framed as failure, and there is no comparison affect: `Last time:
3×7` is never coloured, and a ladder regression is stated in words.

Zero photography.

**The visual direction is the category standard, committed 2026-09-04** and chosen by
the user over three alternatives shown as running interfaces. Dark ground, gradient
progress ring, streak grid, stat tiles, bottom tab bar, Inter throughout — executed
straight, at full fidelity, without irony or smuggled quirk. This is a standing
preference, not a fallback.

**The craft bar is openGym** (`github.com/arvids-unavailable/openGym`): light and dark
themes, eight accent colours, custom drawn iconography, "designed, not assembled". That
sets the finish level the build must reach.

**Stack:** Tailwind + Framer Motion + anime.js, replacing `app.css`.

## Evidence on Hand

- `corpus/` — an LLM-maintained wiki: `overview`, `decisions`, `programme`,
  `progression-engine`, `training-science`, `adherence`, `architecture`,
  `technical-decisions`, `design-system`, `design-guardrails`, `open-questions`,
  `status`, plus 23 briefs and a chronological `log.md`. This is the product's
  source of truth and outranks `SPEC.md`, which describes the superseded v1.
- Real content: five ladders, 35 rungs, per-rung form cues and safety-critical
  flags, five SVG figures with per-rung motion timing, a cardio protocol with its
  own honest-limit notice, and a milestone set keyed to session number.
- Training-science citations behind every programme number (McGill's 10-second
  holds, the 4×4min vs 8×20s VO2max comparison, Tabata's own author's note on
  intensity).
- **No** users beyond one, no testimonials, no benchmarks, no pricing, no press.
  None may be invented.

## Product Principles

1. **Arrive with the answer already made.** Anything that asks the user to decide
   before the first set is a defect.
2. **State the limits out loud.** Where floor-only training cannot deliver, the app
   says so on the screen where it matters, verbatim.
3. **A gap costs nothing.** No date, no debt, no streak. The rotation moves when you
   train.
4. **Trust over measurement.** Autoregulation belongs to the person, not the engine.
   Even with logging open, captured data may not silently drive the prescription.
5. **The core stays pure.** What the app should do today is a function of plain data,
   testable without a browser.

## Accessibility & Inclusion

WCAG 2.2 AA as the floor, with AAA target sizes. Binding, product-specific rules:

- **44px hard minimum** target, 48px secondary rows and inputs, 56px primary. Nothing
  goes below 44px to look tidier.
- Body text ≥4.5:1 against **the surface it is actually painted on**, not against the
  page background. Non-text UI ≥3:1. Enforced pair-by-pair by a contrast test that
  composites translucent washes over their real backdrops.
- Icons are **drawn**, in one consistent stroke and weight. Emoji is not an icon system.
- **Never put the per-second countdown in an `aria-live` region** — it would announce
  sixty times per rest. `role="timer"`, `aria-hidden` the numeral, one polite
  announcement at set transitions, at 10s and at 0.
- Targets read as prose: `aria-label="3 sets of 8 reps"`, never `3×8`.
- Body floor 17px, cues 19px; the scale ships in `rem` with no px `font-size` on
  `html` so OS text scaling works.
- `prefers-reduced-motion: reduce` must keep press feedback and the countdown ring
  (both are information) and stop the exercise figure entirely, since its information
  is carried by the cue text as well.
- Reach model: a reaching arm occludes top-centre, so priority runs bottom-centre →
  bottom edges → top-right → top-left → top-centre. Primary bottom-centre,
  destructive top-right, only a glanceable status strip top-centre.
