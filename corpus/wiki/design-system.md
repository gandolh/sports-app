---
summary: Design tokens and the doctrine governing them — colour, type, spacing and motion. The banned patterns and accessibility floor live in design-guardrails.md.
updated: 2026-07-30
---

# Design system

Derived 2026-07-29 from shipped apps in the category (Hevy, Strong, Freeletics, NTC,
Caliber, Ladder, Down Dog, Peloton, Apple Fitness+), Material theme guidance and
WCAG 2.2. Screen-level specs live in the UI brief; this page is the durable layer.

*The colour section was re-derived on 2026-07-30 when the theme went from dark to white.
Everything else on this page survived that change unaltered, which is the useful signal:
the system was never actually about being dark.*

## The governing idea

> **This app is an instrument, not a coach.** It reports state in large tabular numerals
> on a plain white canvas, uses exactly one signal colour to mean "act now", and has no
> opinion about your character. **Nothing on any screen reads the clock.**

The aesthetic is **Instrument**, chosen for three reasons: oversized numerals are the only
thing legible on a phone lying on the floor at arm's length; it is the opposite of the
photographic/gradient default in fitness apps; and it structurally cannot produce the
template tells listed below.

## Colour

**The theme is white, since 2026-07-30.** It was dark-only before that, for a stated
reason — one user, 7am, a dim room — and the user asked for white instead. The palette
below is a re-derivation, not an inversion: `#6ee7a8` is **1.5:1 on white**, so the accent
had to be re-chosen. It is the same green in hue and a different green in lightness.

Elevation is expressed by **surface tint and hairlines, never shadow.** That rule outlived
its original justification (a shadow does not read in a dim room) and now has a better
one: shadow-on-white is the single most recognisable template look.

```css
--bg: #ffffff;  --surface-1: #f5f7f8;  --surface-2: #eef1f3;  --surface-3: #e3e8ea;
--hairline: rgba(17,24,32,0.12);   --hairline-2: rgba(17,24,32,0.22);

--text-1: #14181D;   /* 17.8:1 */
--text-2: #4A535D;   /*  7.8:1 */
--text-3: #646C75;   /*  5.3:1 on white, 4.7:1 on --surface-2 — the floor */

--accent: #0B6B3F;  --accent-press: #085330;   /*  6.6:1 on white */
--accent-wash: rgba(11,107,63,0.10);  --on-accent: #ffffff;  /* 6.6:1 on accent */
--warn: #7D4F00;     /*  7.0:1 — regressions and destructive confirms ONLY */
```

**Ratios are quoted against the surface a token is actually painted on, not against
`--bg`.** `--text-3` is the placeholder inside a `--surface-2` field, so its real floor is
4.7:1, not the 5.3:1 it scores on white. Reading only the against-white number is how a
palette ships a failing pair.

**Doctrine:**
1. `--accent` is for the primary button, the countdown ring's progress, filled rail
   segments, the current rung tick, sparkline strokes, cue ticks, focus rings. **Nothing
   else.**
2. **No red, no green-vs-red.** `Last time: 3×7` is never coloured — comparison affect is
   guilt with extra steps. A ladder regression is stated in words.
3. **No gradients anywhere.** **`box-shadow: none` globally.**
4. **One theme, and it is light.** No `prefers-color-scheme` block, no dark variant. Two
   themes would double the palette and halve the attention on each half; the app has one
   user and he picked this one.

## Type

**Archivo Variable** (SIL OFL), self-hosted woff2, subset to latin-basic + digits (~28 KB),
preloaded. Deliberately **not Inter or Roboto** — "Inter everywhere" is the most-cited
AI-generated-UI fingerprint. Self-hosted because the app is offline-first: no font CDN.

```css
--fs-hero:    clamp(88px, 26vw, 132px);  /* set target, rest countdown */
--fs-mono:    72px;   /* sessions-completed count */
--fs-display: 40px;   /* day title, cardio state label */
--fs-title:   28px;   /* exercise name in session */
--fs-h:       22px;   --fs-btn: 19px;   --fs-body-l: 19px;  /* cues */
--fs-body:    17px;   /* floor for body text */
--fs-meta:    15px;   --fs-label: 13px;  /* tracked uppercase eyebrows only */

--lh-hero: 0.92;  --lh-display: 1.05;  --lh-title: 1.15;  --lh-body: 1.45;
--ls-hero: -0.03em;  --ls-display: -0.02em;  --ls-title: -0.015em;  --ls-label: 0.10em;
```

**Doctrine:**
- **`font-variant-numeric: tabular-nums` on every number that changes.** Non-optional on
  the countdown — proportional digits shift the whole string as they tick.
- Negative tracking on hero and display sizes. Default tracking at 132px is the tell that
  nobody set it.
- Minimum weight is **400**, **500** under 17px. The reason changed with the theme and the
  rule did not: thin type halated on dark; on white, dark-on-light optically thins the
  stroke, so 300 would be spindly rather than glowing. Same floor, opposite cause.
- Ship the scale in `rem`; never set a px `font-size` on `html`, so OS text scaling works.
- **Only `--fs-label` is uppercase.** Uppercase body text is slower to read.

## Spacing, radii, sizing

```css
--sp-1:4px; --sp-2:8px; --sp-3:12px; --sp-4:16px; --sp-5:20px;
--sp-6:24px; --sp-8:32px; --sp-10:40px; --sp-12:48px; --sp-16:64px;

--r-sm:8px; --r-md:14px; --r-lg:20px; --r-xl:24px; --r-full:999px;

--tap-min: 44px;  --tap-row: 48px;  --tap-primary: 56px;   /* revised 2026-07-30 */
```

**Nothing uses 6, 10, 14 or 18px of spacing** — arbitrary in-between values are a top
template tell. Exactly five radii exist.

**The tap sizes were 48 / 56 / 96px until 2026-07-30**, sized for a phone lying on the
floor. That model is retired — see
[design-guardrails.md](design-guardrails.md#accessibility--target-sizes-and-reach) — and
these are ordinary sizes for a phone and a desktop, floored at WCAG's 44px AAA target.

**The primary button takes `--r-md`, not `--r-lg`.** 20px on the old 96px block read as a
physical key; on 56px it is 4px off a pill, and a pill reads as a template.

## Motion

```css
--dur-instant: 90ms;  --dur-fast: 160ms;  --dur-base: 240ms;  --dur-slow: 520ms;
--ease-out: cubic-bezier(0.2,0,0,1);  --ease-in: cubic-bezier(0.4,0,1,1);
--ease-spring: cubic-bezier(0.34,1.4,0.64,1);   /* used exactly once, on segment fill */
```

1. **Chrome motion only ever confirms a state change.** Nothing in the interface animates
   on load. No staggered entrances, no scroll reveals — "the same fade-in on every
   element" is a named tell.
2. Press feedback fires on **`pointerdown`**, not click.
3. **The entire celebration budget** is one count-up of the sessions number on finish. No
   confetti, no badges, no PR toast.

### Two exceptions, and they are content rather than chrome

*Revised 2026-07-29 — brief 18 found this page silently contradicting the code it was
supposed to govern, which is the failure mode a design system exists to prevent.*

- **The countdown ring** animates continuously and **steps once per second**. A smooth
  60fps sweep reads as a loading spinner; a stepped ring reads as a clock.
- **The exercise figure loops continuously, and it does animate on load.** It is not
  decoration and it is not a state change — it *is* the instruction. Adjacent rungs share
  a drawing and differ only in tempo and pause, so the animation's clock is the only
  thing that distinguishes them (see
  [technical-decisions.md](technical-decisions.md#figures-five-poses-animated-on-a-data-driven-clock)).
  Timing is **linear**, deliberately: easing that decelerates into the turnaround makes a
  pauseless rung look like it dwells at the bottom, which is precisely the signal a
  paused rung owns.

Rule 1 still governs everything that is *interface*. Neither exception licenses a third.

**`prefers-reduced-motion: reduce`** collapses the `fast`, `base` and `slow` durations to
1ms but **keeps `--dur-instant`** (press feedback is functional) and **keeps the countdown
ring** — it is information, not decoration. The figure **stops entirely** and holds its
`end` pose: unlike the ring, its information is also carried by the cue text.

## Guardrails — moved

The banned patterns, the floor-phone accessibility floor, and the four mechanical tests
now live in [design-guardrails.md](design-guardrails.md). Split out on 2026-07-30 when
this page passed 200 lines. **Read that page before adding anything visual** — this one
tells you what the vocabulary is, that one tells you what you may not do with it.
