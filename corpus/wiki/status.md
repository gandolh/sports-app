---
summary: Dated snapshot of where every brief stands and what's next.
updated: 2026-07-29
---

# Status — 2026-07-29

**Where things stand:** a second design grill replaced the adaptive engine with a fixed
schedule, and the corpus has been rewritten to match. Briefs 15–20 are filed and the
build has not started. Six briefs were superseded.

The v1 tree is committed as a baseline (`3dd4c49`, first commit in the repo) and the
rewrite runs on branch `v2-fixed-schedule`. **The v1 code as committed was verified
green**: typecheck clean, lint clean, 407 tests, `npm run build` emitting a working
service worker, `db/` gitignored. That is the state brief 15 starts from and the state
any regression should be compared against.

## What changed, in one paragraph

The app measures nothing: no counter, no completion signal, no adaptation. Progression
is one law — a rung takes ~6 weeks, and the step is the span divided by the sessions in
it — which reproduces all three step sizes the user specified independently. State
collapses to one integer per pattern, so rung and target are interpolated rather than
stored, and top-of-ladder cycling falls out for free. The rotation is Push · Legs ·
Cardio with a core-and-posture block every day. Four screens, weak multi-user auth, no
date anywhere in the UI. Full detail in
[progression-engine.md](progression-engine.md) and [programme.md](programme.md).

## Briefs

| # | Brief | State | Depends on |
|---|---|---|---|
| 01 | [Project scaffold & toolchain](../briefs/done/01-project-scaffold.md) | **done** | — |
| 02 | [Domain types & state document](../briefs/done/02-domain-types.md) | **done** (v1 contract, replaced by 15) | 01 |
| 03 | [Ladder content data](../briefs/done/03-ladder-content.md) | **done** (edited by 15) | 02 |
| 04 | [Progression engine + simulation](../briefs/done/04-progression-engine.md) | **done** (deleted by 15) | 02, 03 |
| 05 | [Persistence: store, codec, export](../briefs/done/05-persistence.md) | **done** (revised by 16) | 02 |
| 06 | [Session player](../briefs/superseded/06-session-player.md) | superseded by 19 | — |
| 07 | [Audio cues](../briefs/superseded/07-audio-cues.md) | superseded — out of v2 scope | — |
| 08 | [Guided warmup](../briefs/superseded/08-guided-warmup.md) | superseded — dropped | — |
| 09 | [Progress charts](../briefs/superseded/09-progress-charts.md) | superseded by 20 | — |
| 10 | [SVG figure system](../briefs/done/10-svg-figures.md) | **done** (animated by 18) | 01 |
| 11 | [SQLite persistence service](../briefs/done/11-sqlite-persistence.md) | **done** (revised by 17) | 05 |
| 12 | [Domain v2: no effort, 7-day cycle, mid-ladder starts](../briefs/done/12-domain-v2-no-effort.md) | **done** (superseded in substance by 15) | 04 |
| 13 | [Cardio + floor-only content + extras](../briefs/superseded/13-cardio-and-floor-only-content.md) | superseded — content moved into 15 | — |
| 14 | [UI shell v1](../briefs/superseded/14-ui-shell-and-screens.md) | superseded by 19 | — |
| 15 | [Domain v3: the fixed schedule](../briefs/todo/15-domain-v3-fixed-schedule.md) | **todo** | — |
| 16 | [Persistence v3](../briefs/todo/16-persistence-v3.md) | todo | 15 |
| 17 | [Multi-user server + login](../briefs/todo/17-multi-user-server.md) | todo | — |
| 18 | [Animated figures](../briefs/todo/18-animated-figures.md) | todo | — |
| 19 | [UI shell: four screens](../briefs/todo/19-ui-shell-and-four-screens.md) | todo | 15, 16, 18, 20 |
| 20 | [Milestones + total work](../briefs/todo/20-milestones-and-total-work.md) | todo | 15 |

## Dependency waves

```
wave 1   15                 the v3 contract — blocks 16, 19, 20
wave 2   16 · 17 · 18 · 20  persistence, server, figures, milestones   (17 and 18 could
                            start in wave 1: 17 touches only server/, 18 only figures)
wave 3   19                 the four screens
```

**Brief 15 is the keystone and worth the most care.** Four briefs code against the
types it lands, and it is the one that has to get the interpolation right — if that is
wrong, every prescription in the app is wrong and no test downstream will notice.

Brief 15 will deliberately leave `src/persistence/**` and `src/ui/**` broken by
deleting `engine.ts` and `progress.ts`. That is expected, and briefs 16 and 19 repair
their own side. **The tree does not typecheck between wave 1 and wave 3** — do not treat
that as a regression.

## Deliberately out of v2

Charts of any kind · audio cues · a guided warmup · the extras pool · a rest timer ·
adaptive progression · deload logic · streaks or a calendar heatmap · exercise
substitution · body-weight tracking · health-app export · onboarding assessment ·
real authentication · a pull *strength* ladder (blocked on equipment, by user choice).
