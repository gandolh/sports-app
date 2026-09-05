# Task 27 — The four screens, in the category standard

## Context

The last brief of the v3 direction round. Briefs 24–26 landed the contract, the
persistence and the tokens; this one rebuilds the interface on them.

Reference build — **open it, it is the spec, and it is running code**:
`https://claude.ai/code/artifact/819f0350-96a2-41c1-8993-4ccb83347460`

**Read first:** `corpus/CLAUDE.md` invariants (rewritten 2026-09-04),
`corpus/wiki/reversals.md`, and open questions 8 and 9.

## What you own

```
client/src/ui/App.tsx                  route tree gains /progress, /week becomes /plan
client/src/ui/routes/**                all five routes
client/src/ui/components/**            rebuilt; two NEW components below
client/src/ui/app.css                  DELETED
client/src/ui/__tests__/screens.test.tsx      rewritten
client/src/ui/__tests__/player.test.tsx       rewritten
client/src/ui/__tests__/sync.test.tsx         adapted
client/src/ui/__tests__/noDatesInUi.test.ts   DELETED
client/src/ui/__tests__/timeInvariance.test.tsx DELETED
client/package.json                    add motion + animejs
```

**Do NOT touch** `client/src/ui/figures/**`, `client/src/ui/ExerciseFigure.tsx`,
`client/src/ui/tokens.css`, `client/src/domain/**`, `client/src/persistence/**`,
`shared/**`, `server/**`.

**`figures/` is off limits because brief 23 is mid-flight in it** (the rig landed, the
crossfade has not been replaced yet). Consume `<ExerciseFigure rung={…} size={…} />`
exactly as it is today and let 23 finish underneath you.

## Delete these two tests, do not weaken them

`noDatesInUi.test.ts` and `timeInvariance.test.tsx` enforce rules that no longer exist.
**Delete the files.** A test kept alive after its rule is gone tells the next reader
something false, and weakening one to "mostly no dates" is worse than either option.

Add one line to each deletion's commit message pointing at `corpus/wiki/reversals.md`.

## The screens

`/` Today · `/plan` calendar · `/progress` · `/account` · `/login`.
Four-item bottom tab bar: Today, Plan, Progress, You. `/week` is gone — the plan screen
replaces it, and the seven-session projection it rendered moves into "Coming up".

**Today** — date + streak rail, day title, gradient ring at the weekly goal, three stat
tiles, a 42-day heatmap, the exercise rows, primary at the foot.

**Player** — figure, big rep target, set dots, the comparison strip (last time / change
/ est. 1RM), the stop rule, the cues. Logging offered in the footer and **never
demanded**: `Log 8` / `Log other` sit beside `Next set`, and skipping them is a
first-class path, not a dismissal.

**Plan** — a real month calendar with trained / missed / rest / today states, then
"Coming up" from the existing seven-session projection.

**Progress** — the push-target step chart, tiles, milestones from
`client/src/domain/milestones.ts`.

## The two components this world does not give you for free

These are open questions 8 and 9. They are the reason this brief is not a reskin.

**`<HonestNote>`** — a persistent labelled disclosure in the `warn` hue, its own drawn
icon, **never dismissible and never red**. The category standard's only warning
affordances are a red toast and a destructive confirm, and neither fits *"the gap is
real and this app does not pretend otherwise."* Three uses ship: `POSTURAL_NOTICE`
verbatim on Today and anywhere a pull exercise appears, the missed-day line on Plan
("Nothing. The rotation moves when you train…"), and what the Progress chart actually
plots ("The schedule, not your capability").

**`<StopRule>`** — renders `rung.stopRule` from brief 24, above the cues, outranked by
nothing on the page. `dang` hue, its own icon, its own box.

## Non-negotiables

- **44px minimum target, 48px rows, 56px primary.** Nothing below 44px to look tidier.
- **Icons are drawn** — one family, 1.6px stroke, 24px box, round caps and joins. The
  streak pill is exactly where an emoji would creep in. No emoji anywhere.
- **`tabular-nums` on every number that changes.**
- **The countdown may not go in an `aria-live` region** — `role="timer"`, `aria-hidden`
  the numeral, one polite announcement at set transitions, at 10s, and at 0.
- Targets read as prose: `aria-label="3 sets of 8 reps"`, never `3×8`.
- `prefers-reduced-motion: reduce` keeps press feedback and the countdown, stops the
  figure.
- **Offline-first survives.** `/login` must work with no network; nothing on the path to
  a first set may require one. The calendar renders from local history only.
- **The URL still holds player state** (`?v=&i=&d=`). A reload mid-plank resumes on the
  same exercise; there is a test and it must keep passing in spirit.

## Motion

`motion` (Framer) for component transitions, `animejs` 4.x for the ring fill and the
sparkline draw. **One authored moment per screen, not scattered effects** — the ring
filling on Today is that moment. No staggered entrance on every card.

## Acceptance

- `npm run typecheck && npm run lint && npm test` green from the repo root.
- `npm run build --workspace @sports-app/client` emits a working service worker at both
  `/` and under `SPORTS_APP_BASE=/sports-app/`.
- Every screen renders in light and dark, and under all eight accents.
- Logging a set persists through the codec and survives a reload; **not** logging is
  equally supported and is the default path through the player.
- `POSTURAL_NOTICE` appears verbatim on every screen a pull exercise appears on.
- A screen test asserts `<StopRule>` renders above the cue list, not inside it.

## Out of scope

`figures/**` and the brief-23 morph. Real authentication. Any change to `prescribe()`.
