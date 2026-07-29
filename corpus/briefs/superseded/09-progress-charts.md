# Task 09 — Progress charts

## Context

A history screen showing progress per movement pattern.

**The one thing that must not be done here: charting raw reps.** In double
progression you climb 5 → 12 and then advance a rung, which resets reps to 5. A rep
chart therefore sawtooths and shows a *drop* at the exact moment the user got
stronger — the single most demoralising possible bug in a progress screen. Plot the
monotonic index from brief 04's `progress.ts` instead:

```
progressIndex = rungIndex × 8 + (target − targetMin)
```

**No charting library.** A few hundred data points do not justify the dependency, and
a hand-rolled SVG line will look better than a default Recharts theme. See
[decisions.md](../../wiki/decisions.md).

## Files you OWN

```
src/ui/ProgressScreen.tsx
src/ui/charts/LineChart.tsx        generic, hand-rolled SVG
src/ui/charts/__tests__/*
```

## Files you must NOT touch

`src/domain/**` — consume `progress.ts`'s series functions as they are. If a series
you need doesn't exist, note it in your outcome rather than adding it to `domain/`.

## What to do

1. **`LineChart.tsx`** — a small generic SVG line chart: series of
   `{ x, y, label? }`, a `viewBox` with `preserveAspectRatio`, and a `stroke` from
   `currentColor` so it themes for free in light and dark. No axes library; draw the
   two axis lines, ~4 y ticks and ~4 x ticks yourself. Must render sensibly with **0,
   1, and 2 points** — early sessions are exactly when you'll look at it most, and a
   one-point chart crashing is the most likely bug here.
2. **`ProgressScreen.tsx`**
   - One small chart per pattern (five), stacked, each labelled with the pattern and
     its **current rung name** — the rung name is the meaningful unit of progress, not
     the index.
   - Above the charts, a terse summary: `sessionsCompleted`, and per pattern the
     current rung and target.
   - **The pull row must carry its postural label**, consistent with brief 03. Do not
     present postural work as pull strength on a screen whose whole job is telling the
     truth about progress.
3. **Empty and sparse states.** With zero completed sessions, show something
   encouraging and factual — not an empty chart frame, and not a fake demo series.
   With 1–3 sessions, show the points without pretending there's a trend.
4. Annotate **rung advances** on the line — a dot or tick where `rungIndex` changed,
   with the new rung's name on hover/tap. These are the milestones; they are the most
   interesting thing on the screen.
5. Keep it readable on a phone in portrait. Five stacked charts means each is short
   and wide; sparklines with a labelled current value beat five cramped full charts.
6. Reachable from `HomeScreen` via one obvious control, and back again. **Do not add
   a router library** — conditional rendering on one piece of screen state is enough
   for this app.

## Acceptance

- `npm test` passes. Tests cover `LineChart` with 0, 1, 2 and many points, and assert
  the rendered path has the expected number of segments.
- A test asserts **no chart series is derived from raw reps** — e.g. feed a fixture
  spanning a rung advance and assert the plotted y-values are non-decreasing. This is
  the invariant the whole brief exists to protect, so it gets a test.
- Manual: with brief 02's mid-program fixture loaded, all five charts render, rung
  advances are visibly marked, and the layout is readable on a phone-width viewport.
- Manual: with a fresh empty document, the screen renders without errors.
- Dark and light both legible (verify `currentColor` is actually inherited).
- No new runtime dependency added to `package.json`.

---

## SUPERSEDED 2026-07-29 — the v2 grill

Charts are gone. A fixed schedule plotted against session number is a straight line
containing no information, which is the design being honest rather than a rendering
problem. `progressIndex` and `src/domain/progress.ts` are deleted by **brief 15**. The
account page instead shows milestones and cumulative work — **brief 20**.
