---
summary: The rules that keep the design system honest — the banned patterns, the floor-phone accessibility floor, and the four tests that enforce both mechanically.
updated: 2026-07-30
---

# Design guardrails

Split out of [design-system.md](design-system.md) on 2026-07-30 when that page passed the
200-line cap. That page is the **vocabulary** — the tokens and the doctrine governing
them. This one is the **constraints**: what may never appear, the accessibility floor the
tokens exist to satisfy, and the tests that stop all of it from decaying into a comment.

The order matters. A banned pattern is cheap to state and expensive to remove once
shipped, and an accessibility floor that only exists in prose is an accessibility floor
that has already been breached somewhere.

## Anti-patterns — none of these may appear

**Generic-AI tells:** Inter or Roboto · lavender/indigo accent · centred hero · three
rounded cards in a row · glassmorphism / `backdrop-filter` · glowing borders · purple
gradient orbs · one huge rounded icon above a heading · uniform fade-ins · buttons that
snap instead of ease · `box-shadow` of any kind.

**Fitness-specific tells:** photography of a model mid-lunge (**this app contains zero
photography**) · emoji as iconography · gradient progress rings with a glow · anatomy
heatmaps · motivational copy ("Crush it!", "Beast mode") — copy is imperative and factual
· per-pattern colour palettes · cards inside cards · inconsistent radii · pill-shaped tiny
buttons where one big button belongs · a bottom tab bar on a two-destination app ·
**skeleton loaders** (everything is local and synchronous; a skeleton means an
architecture bug) · `font-weight: 300` anywhere.

**And, enforcing the product constraints:** any date, any calendar, any heatmap, any
"3 days ago", any % of a weekly goal, any trophy.

## Accessibility — target sizes and reach

*Rewritten 2026-07-30. **The floor-phone sizing model is retired.** The user scoped the
app to phones and desktops — "they got good accuracy" — so the oversized targets it
justified are gone. What replaced them is ordinary, and the reasoning below is kept because
the deleted version is the kind of thing that gets reinvented.*

Standards floor is 24×24 (WCAG 2.2 AA 2.5.8), 44×44 (AAA), 48dp (Material). **This app
uses 44px minimum, 48px secondary rows and inputs, 56px primary** — conventional sizes for
its two target devices, with 44px as a hard floor because that is WCAG's AAA target size.
Nothing may go below it to look tidier; that is an accessibility regression wearing a style
argument.

- ≥12px between targets. No mandated dead space and no exclusion zone — footer spacing is
  rhythm now, not a safety margin.
- **The primary button's radius is `--r-md` (14px), not `--r-lg`.** At the old 96px height
  20px read as a physical key; on a 56px block it is within 4px of a pill, which
  [design-system.md](design-system.md) names as a template tell.
- **The reach model survives, because it costs nothing.** A reaching arm occludes
  top-centre, so priority runs bottom-centre → bottom edges → top-right → top-left →
  **top-centre (worst)**. Primary lives bottom-centre; destructive close lives top-right;
  top-centre carries only a thin status rail that is glanced at, never aimed at.
- **The footer stays sticky**, and that is a separate claim from any of the above: the next
  action is always in the same place without scrolling, on screens whose cue list is taller
  than the viewport. Do not conflate retiring the tap-size model with loosening this.

### What was here before, and the two ways it went wrong

The original model was a **floor phone**: a sweaty finger aiming at a device on the ground,
viewed obliquely mid-exhale, which justified a 96px primary, 24px of mandated dead space,
and no interactive element within 120px of the primary.

It failed twice, and the second failure is the instructive one.

1. **It was calibrated for a context that was never confirmed.** Plausible for this app,
   and wrong — the devices are a phone in the hand and a desktop.
2. **The first fix made it worse by preserving it.** A `(pointer: fine)` media query
   shrank the primary on desktop and left phones at 96px. That reads as careful responsive
   work and is actually two sizes to maintain, plus a number nobody wanted still shipping
   on the device the app is mostly used on. **When a rule's justification is wrong, change
   the rule — do not add a breakpoint that hides it on one device.**

There is now no per-device override of control sizes anywhere, deliberately. `hover: hover`
in `app.css` remains, because a hover *affordance* genuinely only exists on one of the two.
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

## Four tests that enforce this mechanically

Intent is not enforcement. All four are cheap:

1. **No dates in the UI layer.** `grep` for `toLocaleDateString`, `Intl.DateTimeFormat`,
   `formatDistance`, `daysAgo`, `new Date()` in `client/src/ui/` — timestamps enter and leave
   through `client/src/persistence/` only. Mirrors the existing eslint rule keeping
   `client/src/domain/` off the clock.
2. **Time-invariance snapshot.** Render home with the last session 1 day ago and 400 days
   ago; **the DOM must be byte-identical.** This is the mechanical statement of "returning
   after two weeks looks identical to returning after one day".
3. **No hex colours anywhere in `client/src/ui/`** outside the token file
   (`client/src/ui/__tests__/noHexColors.test.ts`). This is what made the dark→white switch a one-file
   edit rather than an archaeology exercise.
4. **Every colour pair clears its contrast floor** (`client/src/ui/__tests__/contrast.test.ts`, added
   2026-07-30). It parses `tokens.css`, composites the `rgba()` washes over their real
   backdrops, and asserts 4.5:1 for text and 3:1 for meaningful non-text — pair by pair,
   against the surface each token is actually painted on. It also asserts the *ceiling* on
   the countdown ring's track, so the documented sub-3:1 exception cannot be "fixed" by a
   later accessibility sweep.

**Test 3 was passing vacuously until 2026-07-30 and nobody noticed for its whole life.**
Vitest stubs CSS modules to an empty string by default, and it does so by module id, so
`app.css?raw` came back as `''` — the glob returned the right filenames and no content, and
a grep over nothing passes. `css: true` in `client/vite.config.ts` is what makes both 3 and
4 read real bytes. Worth remembering as a shape: **a test that greps files it failed to
open is green and worthless**, so assert that the input is non-empty.
