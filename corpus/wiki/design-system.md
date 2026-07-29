---
summary: Design tokens and the doctrine governing them — colour, type, spacing, motion, anti-patterns, and the floor-phone accessibility floor.
updated: 2026-07-29
---

# Design system

Derived 2026-07-29 from shipped apps in the category (Hevy, Strong, Freeletics, NTC,
Caliber, Ladder, Down Dog, Peloton, Apple Fitness+), Material dark-theme guidance and
WCAG 2.2. Screen-level specs live in the UI brief; this page is the durable layer.

## The governing idea

> **This app is an instrument, not a coach.** It reports state in large tabular numerals
> on near-black, uses exactly one signal colour to mean "act now", and has no opinion
> about your character. **Nothing on any screen reads the clock.**

The aesthetic is **Instrument**, chosen for three reasons: oversized numerals are the only
thing legible on a phone lying on the floor at arm's length; it is the opposite of the
photographic/gradient default in fitness apps; and it structurally cannot produce the
template tells listed below.

## Colour

`#111418` and `#6ee7a8` were already chosen and both survive review — the accent computes
to **12.0:1** on the canvas, AAA at any size. Elevation is expressed by **surface
lightness, never shadow**, because shadows do not read in a dim room.

```css
--bg: #111418;  --surface-1: #171B21;  --surface-2: #1E232A;  --surface-3: #262C34;
--hairline: rgba(255,255,255,0.08);   --hairline-2: rgba(255,255,255,0.14);

--text-1: #E8EAED;   /* 15.3:1 */
--text-2: #A2AAB4;   /*  7.9:1 */
--text-3: #7C858F;   /*  4.9:1 — the floor; nothing dimmer ships */

--accent: #6ee7a8;  --accent-press: #57C98C;
--accent-wash: rgba(110,231,168,0.16);  --on-accent: #0B1F14;  /* 11.2:1 on accent */
--warn: #E8B04B;     /*  9.5:1 — regressions and destructive confirms ONLY */
```

**Doctrine:**
1. `--accent` is for the primary button, the countdown ring's progress, filled rail
   segments, the current rung tick, sparkline strokes, cue ticks, focus rings. **Nothing
   else.**
2. **No red, no green-vs-red.** `Last time: 3×7` is never coloured — comparison affect is
   guilt with extra steps. A ladder regression is stated in words.
3. **No gradients anywhere.** **`box-shadow: none` globally.**
4. **No light theme.** One user, 7am, dim room. Scope with no user.

## Type

**Archivo Variable** (SIL OFL), self-hosted woff2, subset to latin-basic + digits (~28 KB),
preloaded. Deliberately **not Inter or Roboto** — "Inter everywhere" is the most-cited
AI-generated-UI fingerprint. Self-hosted because the app is offline-first: no font CDN.

```css
--fs-hero:    clamp(88px, 26vw, 132px);  /* set target, rest countdown */
--fs-mono:    72px;   /* sessions-completed count */
--fs-display: 40px;   /* day title, cardio state label */
--fs-title:   28px;   /* exercise name in session */
--fs-h:       22px;   --fs-btn: 24px;   --fs-body-l: 19px;  /* cues */
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
- Minimum weight on dark is **400**, **500** under 17px. Thin type halates on dark.
- Ship the scale in `rem`; never set a px `font-size` on `html`, so OS text scaling works.
- **Only `--fs-label` is uppercase.** Uppercase body text is slower to read.

## Spacing, radii, sizing

```css
--sp-1:4px; --sp-2:8px; --sp-3:12px; --sp-4:16px; --sp-5:20px;
--sp-6:24px; --sp-8:32px; --sp-10:40px; --sp-12:48px; --sp-16:64px;

--r-sm:8px; --r-md:14px; --r-lg:20px; --r-xl:24px; --r-full:999px;

--tap-min: 48px;  --tap-row: 56px;  --tap-primary: 96px;
```

**Nothing uses 6, 10, 14 or 18px of spacing** — arbitrary in-between values are a top
template tell. Exactly five radii exist. **The primary button is 20px, not a pill:** a
20px radius on a 96px block reads as a physical key; a pill reads as a template.

## Motion

```css
--dur-instant: 90ms;  --dur-fast: 160ms;  --dur-base: 240ms;  --dur-slow: 520ms;
--ease-out: cubic-bezier(0.2,0,0,1);  --ease-in: cubic-bezier(0.4,0,1,1);
--ease-spring: cubic-bezier(0.34,1.4,0.64,1);   /* used exactly once, on segment fill */
```

1. **Motion only ever confirms a state change.** Nothing animates on load. No staggered
   entrances, no scroll reveals — "the same fade-in on every element" is a named tell.
2. **The countdown ring is the only continuously-animating element**, and it **steps once
   per second**. A smooth 60fps sweep reads as a loading spinner; a stepped ring reads as
   a clock.
3. Press feedback fires on **`pointerdown`**, not click.
4. **The entire celebration budget** is one count-up of the sessions number on finish. No
   confetti, no badges, no PR toast.

**`prefers-reduced-motion: reduce`** collapses the `fast`, `base` and `slow` durations to 1ms but **keeps
`--dur-instant`** (press feedback is functional) and **keeps the countdown ring** — it is
information, not decoration.

## Anti-patterns — none of these may appear

**Generic-AI tells:** Inter or Roboto · lavender/indigo accent · centred hero · three
rounded cards in a row · glassmorphism / `backdrop-filter` · glowing borders · purple
gradient orbs · one huge rounded icon above a heading · uniform fade-ins · buttons that
snap instead of ease · `box-shadow` on dark.

**Fitness-specific tells:** photography of a model mid-lunge (**this app contains zero
photography**) · emoji as iconography · gradient progress rings with a glow · anatomy
heatmaps · motivational copy ("Crush it!", "Beast mode") — copy is imperative and factual
· per-pattern colour palettes · cards inside cards · inconsistent radii · pill-shaped tiny
buttons where one big button belongs · a bottom tab bar on a two-destination app ·
**skeleton loaders** (everything is local and synchronous; a skeleton means an
architecture bug) · `font-weight: 300` on dark.

**And, enforcing the product constraints:** any date, any calendar, any heatmap, any
"3 days ago", any % of a weekly goal, any trophy.

## Accessibility — the floor-phone context

Standards floor is 24×24 (WCAG 2.2 AA 2.5.8), 44×44 (AAA), 48dp (Material). **This app
uses 48×48 minimum, 56px secondary rows, 96px primary** — a sweaty finger aiming at a
phone flat on the floor, viewed obliquely mid-exhale, has a far higher error rate than a
seated one-handed tap.

- ≥12px between targets; ≥24px dead space around the primary; **no interactive element
  within 120px of the primary** except the secondary row above it.
- **The reach model inverts for a floor phone:** the reaching arm occludes top-centre. So
  priority runs bottom-centre → bottom edges → top-right → top-left → **top-centre
  (worst)**. Primary lives bottom-centre; destructive close lives top-right; top-centre
  carries only a thin status rail that is glanced at, never aimed at.
- Body text ≥4.5:1. Large text may take a 3:1 discount — **don't**. Non-text UI ≥3:1.
- **Documented exception so nobody "fixes" it:** the countdown ring's *track* is
  intentionally below 3:1. It is decorative — the numeral inside carries the value.
  Brightening it into a competing grey ring is a regression.
- **17px is the body floor, 19px for cues.** A floor phone at ~60–70cm subtends roughly
  60% of the angular size it would in the hand, so 17px there behaves like ~11px held.
  That is why 14px never appears.
- **Never put the per-second countdown in an `aria-live` region** — it would announce 60
  times per rest. Use `role="timer"`, `aria-hidden` the numeral, and fire one polite
  announcement at set transitions, at 10s, and at 0.
- Targets read as prose: `aria-label="3 sets of 8 reps"`, not `3×8` ("3 x 8").
- Focus: 3px `--accent` outline, 2px offset, never removed.

## Two tests that enforce this mechanically

Intent is not enforcement. Both are cheap:

1. **No dates in the UI layer.** `grep` for `toLocaleDateString`, `Intl.DateTimeFormat`,
   `formatDistance`, `daysAgo`, `new Date()` in `src/ui/` — timestamps enter and leave
   through `src/persistence/` only. Mirrors the existing eslint rule keeping
   `src/domain/` off the clock.
2. **Time-invariance snapshot.** Render home with the last session 1 day ago and 400 days
   ago; **the DOM must be byte-identical.** This is the mechanical statement of "returning
   after two weeks looks identical to returning after one day".

Extend the existing `noHexColors` test idea: **no hex colours anywhere in `src/ui/`**
outside the token file.
