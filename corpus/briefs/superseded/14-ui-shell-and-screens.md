# Task 14 — UI shell: router, pages, Base UI, and the real screens

## Context

`src/ui/App.tsx` is still brief 01's placeholder. This brief builds the actual app.

**Read [design-system.md](../../wiki/design-system.md) first and treat it as binding.** It
carries the tokens, the doctrine, the anti-pattern list and the accessibility floor, all
derived from shipped apps in the category plus WCAG 2.2. Also read
[decisions.md](../../wiki/decisions.md) — especially *The app stays simple* and *No effort
input anywhere*, both of which constrain what may appear on screen.

Depends on **brief 12** (domain v2: no effort, 7-position cycle with cardio, mid-ladder
starts). Code against the post-12 API, not the shipped one.

## Stack, decided by the user — do not substitute

- **TanStack Router** for real multi-page routing.
- **TanStack Query** for the sync endpoints.
- **Base UI (`@base-ui/react`, v1.6.0)** — headless. **Note the package name**: `@base-ui/react`,
  NOT `@base-ui-components/react`, which is an older name stuck at `1.0.0-rc.0`.
- Hand-rolled SVG for the countdown ring, the segmented rail, sparklines and ladder rails.
  Base UI's `Progress` does neither segments nor rings.
- Pin exact versions, matching the project's existing posture.

**On Query specifically:** its value here is thin and that is expected — local storage is
the source of truth and sync is one fire-and-forget `PUT` plus one manual `GET`. Use it for
the sync calls and do **not** route local state through it. `push` must remain
fire-and-forget and must never block or fail a workout.

## Files you OWN

```
src/ui/**            (except src/ui/figures/** — see below)
src/ui/tokens.css    the single source of design tokens
src/routes/**        route tree
src/main.tsx         router wiring
index.html           font preload
package.json         the three dependencies
```

`src/ui/figures/**` and `ExerciseFigure.tsx` are yours **only** for the reduced-motion fix
below. Do not otherwise redesign the figure system.

## Files you must NOT touch

`src/domain/**`, `src/persistence/**`, `server/**`. Consume them.

## Routes

```
/                      Today          — the session, pre-resolved. Zero taps to know what today is.
/session               Player         — full-screen, chromeless, never scrolls.
/session/complete      Finish         — one number, auto-returns after 6s.
/progress              Progress       — cycle position, sessions count, 5 ladders, sparklines.
/exercise/$rungId      Exercise       — figure, all cues, ladder position, that rung's history.
/settings              Settings       — reached from the bottom of /progress, not from home.
```

**No bottom tab bar.** Two non-session destinations do not justify one, and a persistent
bottom bar puts mis-tap targets directly under the 96px primary action on a floor phone.
Home gets one 48px icon button top-right → `/progress`.

`/session` is a real route, not a modal: refresh, Android back and PWA app-switching all
have to behave, and a modal loses state on reload.

## Home (`/`)

Header (56px): wordmark left, one 48px icon button right. **No date, no greeting, no name.**

Then: eyebrow `DAY B` in accent · title `Legs` at `--fs-display` · meta
`About 12 minutes · 2 min warmup` · two exercise cards · `142 sessions` as the *entire*
progress surface.

**Cards show all cues expanded** (user decision). To keep one-tap-to-begin, **`Start` is a
sticky bottom dock**, geometrically identical to the player's primary — 96px tall,
`--r-lg`, accent fill — so expanded cues scroll *behind* it and it is never off-screen.
This is why the tradeoff between readable cues and a visible Start does not exist.

A postural ladder's card must carry its disclosure chip: `POSTURAL — upper-back endurance,
not pull strength`, in `--warn`. `Ladder.kind` is a required field precisely so this cannot
be forgotten, and omitting it is a safety misrepresentation.

Cardio day: one card, `5 × (60s hard / 90s easy)`, no figure.

In-progress state is the only variation: `Resume — set 2 of 6` plus a ghost `Start over`.

## Player (`/session`)

`100dvh`, **never scrolls**, CSS Grid `auto 1fr var(--dock-h)`. Reserve the dock height at
all times so nothing reflows between states.

**Zone A — status rail.** No back button; leaving mid-session is deliberate, not
incidental. One 48px `×` top-right → Base UI `AlertDialog` with **"Keep going"
default-focused** and "End" destructive. **Segmented progress, not a percentage bar** — one
4px segment per set. "43% complete" is not actionable; two of six segments filled answers
the only question a sweating user has.

**Zone B, working set.** Figure left; then exercise name at `--fs-title` *sentence case*
(uppercase at 28px is slower to read out of the corner of your eye); the **target as the
hero number** at `--fs-hero` with `tabular-nums`; and `Last time: 3×7` beneath it — **never
coloured, no arrow, no up/down indicator.** Cues below as a real `<ul>`, each with a 3px
accent tick (a rule — not a dot, never an emoji).

**Zone B, rest.** Auto-entered on set completion. Ring + seconds remaining, and **`NEXT`
plus the upcoming exercise** — that last part is the single best pattern in the category
and the one most apps omit.

**Zone C — action dock.** One 96px full-width accent button, `--r-lg`. **The only saturated
block of colour on screen**, which is how it dominates without being absurd. Label by
state: `Done` / `Skip rest` / `Skip warmup` / `Finish`. Same size and position always —
muscle memory. Secondary 48px row above it: `+30s` during rest, `Adjust reps` during a set.

**Tap hardening, all of it:**
- `touch-action: manipulation`, no `user-select`, no tap highlight.
- Press state on **`pointerdown`**, not click.
- **Debounce the primary at 350ms.** A double-tap must never log two sets — the single
  highest-value defensive line on the screen.
- No `:hover` styles (they stick on touch).
- No interactive element within 120px of the primary except the secondary row.

**`Adjust reps`** replaces the secondary row *in place* — no dialog; dialogs on a floor
phone are hostile. `− 8 +` with 64×64 controls, writing `SetResult.actualValue`. Done means
"hit target", so the default path stays one tap.

**Abandonment:** leaving mid-session writes no partial `SessionResult` and does not advance
the cycle. A phantom completed session corrupts the engine's counters, which is worse than
losing one workout's data.

## Rest timer and the locked screen

- Timestamp-based elapsed, recomputed from a stored start time. **Never accumulate
  `setInterval` ticks** — backgrounded tabs throttle to once a minute or stop entirely.
  Returning to the foreground must show the correct elapsed, including "rest already over".
- `navigator.wakeLock` acquired on entering `/session`, released on exit, re-acquired on
  `visibilitychange`. Behind a capability check with a working no-op fallback. **Known
  limit:** wake lock was broken in installed iOS PWAs until iOS 18.4.
- **The ring steps once per second** (`transition: stroke-dashoffset 160ms linear`). A
  smooth sweep reads as a loading spinner; a stepped ring reads as a clock.
- Audio is brief 07's; emit the events it needs and do not import it.

## The ExerciseFigure reduced-motion fix

Currently, under `prefers-reduced-motion`, the animated end-frame is set to `opacity: 0`,
so **only the start pose renders** — silently discarding the movement information the two
frames exist to convey. An accessibility setting must not cost information. Fix: render
both phases side by side at 50% width with small `1` / `2` labels. Same information, zero
motion.

## Progress (`/progress`)

`142` at `--fs-mono` with `tabular-nums`, label `sessions completed`. **No date range, no
"since".** Cycle position as pills with the *next* one filled. Five ladder rows: pattern
name, rung name, a vertical rung rail drawn as an actual ladder, current target, and a
sparkline — **40px, no axes, no gridlines, no dots except the last point, x axis is session
index and never time.** Settings as a plain text row at the bottom.

**No calendar, no heatmap, no bar-per-week, no dates.**

## Accessibility — non-negotiable

- **Never put the per-second countdown in an `aria-live` region** — it would announce 60
  times per rest. `role="timer"`, `aria-hidden` the numeral, and one polite announcement at
  set transitions, at 10s, and at 0.
- `aria-label="3 sets of 8 reps"`, not `3×8` (announced "3 x 8").
- Focus: 3px accent outline, 2px offset, never removed.
- The postural disclosure must be in the row's accessible name, not colour-only.

## Acceptance

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all clean.
- **The two enforcement tests from the design system**, both of which must genuinely fail
  when violated:
  1. No `toLocaleDateString`, `Intl.DateTimeFormat`, `formatDistance`, `daysAgo` or
     `new Date()` anywhere in `src/ui/`.
  2. Render home with the last session 1 day ago and 400 days ago — **the DOM must be
     byte-identical.** This is the mechanical form of "returning after two weeks looks
     identical to returning after one day".
- Extend the existing `noHexColors` test: no hex colours in `src/ui/` outside `tokens.css`.
- Component tests for the player state machine, the abandonment path, and the timer
  reporting correct elapsed after a simulated 90-second gap in ticks.
- **Drive it in a real browser and report, with counted numbers:** taps to complete a full
  session (must be ≤10), whether `Start` is visible without scrolling at 360×640 with cues
  expanded, and whether the ring and hero numeral are legible at arm's length.
- Report which anti-patterns from the design system you were tempted by and rejected.

---

## SUPERSEDED 2026-07-29 — the v2 grill

Six routes became four, charts and the extras pool were dropped, the effort picker
returned as a per-session load dial, and the player mechanics changed completely.
Enough of the spec is now wrong that editing it would be less honest than replacing it.
Successor is **brief 19**, which keeps this brief's two mechanical enforcement tests
(no dates in `src/ui/`, home DOM identical at 1 day vs 400 days) and its Base UI /
TanStack choices.
