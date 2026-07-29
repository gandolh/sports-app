---
summary: Dated snapshot of where every brief stands and what's next.
updated: 2026-07-29
---

# Status — 2026-07-29

**Where things stand: the v2 rebuild is complete and green, and the service is on
Fastify.** Briefs 15–20 shipped in three waves; 21 split the tree into workspaces and 22
migrated the HTTP layer. **614 tests**, typecheck and lint clean, `npm audit` clean, and
`npm run build` emits a working service worker. Offline was proven rather than assumed —
a full Push session played to the finish screen with the network down.

Nothing is deployed. The remaining known work is listed under *What is left* below.

The v1 tree is committed as a baseline (`3dd4c49`, the first commit in the repo) and the
rebuild runs on branch `v2-fixed-schedule`, one commit per brief. v1 as committed was
green at 407 tests — that is the state to compare a regression against.

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
| 15 | [Domain v3: the fixed schedule](../briefs/done/15-domain-v3-fixed-schedule.md) | **done** | — |
| 16 | [Persistence v3](../briefs/done/16-persistence-v3.md) | **done** | 15 |
| 17 | [Multi-user server + login](../briefs/done/17-multi-user-server.md) | **done** | — |
| 18 | [Animated figures](../briefs/done/18-animated-figures.md) | **done** | — |
| 19 | [UI shell: four screens](../briefs/done/19-ui-shell-and-four-screens.md) | **done** | 15, 16, 18, 20 |
| 20 | [Milestones + total work](../briefs/done/20-milestones-and-total-work.md) | **done** | 15 |
| 21 | [npm workspaces + shared](../briefs/done/21-npm-workspaces-and-shared.md) | **done** | — |
| 22 | [Fastify API](../briefs/done/22-fastify-api.md) | **done** | 21 |

## How it ran

```
wave 1   15 ‖ 17            ✔  the v3 contract · the multi-user service
wave 2   16 ‖ 18 ‖ 20       ✔  persistence · figures · milestones
wave 3   19                 ✔  the four screens
```

`17` moved up to wave 1 because it owns only `server/**`. Brief 15 deliberately left
`client/src/persistence/**` and `client/src/ui/**` broken by deleting `engine.ts` and `progress.ts`;
16 and 19 repaired their own side, and the only file failing typecheck between waves was
`SettingsScreen.tsx`, which 19 deleted.

**The most valuable output of the run was not code.** Each brief was asked to report an
honest verdict on something it could not be tested on, and four of the six found a real
problem: brief 15 caught that declared caps were asymptotes and that the step *between*
rungs exceeds what the variant can absorb; brief 18 found `design-system.md`
contradicting the code it governs; brief 19 found five layout defects that only appear
when the app is operated rather than rendered; brief 20 found `programme.md` claiming a
per-side side-plank dose the code splits between sides.

## What is left

- **Deploy integration** in `/home/gandolh/projects/vps-deploy/projects/sports-app/` —
  not started. The DB path must sit outside the rsync tree, **and brief 22 added a second
  requirement: the service now needs `npm ci --omit=dev` on the server** before
  `node state-server.mjs` will start. Copying files is no longer enough. See
  [technical-decisions.md](technical-decisions.md#the-api-is-fastify-and-the-rest-contract-is-unchanged).
- **Two design decisions brief 19 left open rather than patching**: `POSTURAL_NOTICE`
  outweighs the plan it annotates on `/` and is far below the fold on the pull player
  page; and long rung names wrap to three lines beside the figure, which is the norm
  rather than an exception since a rung is one movement plus a modifier.
- **Open questions 1, 2, 3, 5, 6 and 7** — see
  [open-questions.md](open-questions.md). Question 1 (is six weeks per rung right?) is
  the only number in the programme with no evidence behind it.

## Deliberately out of v2

**Note on the zero-dependency service:** it was a locked decision until 2026-07-29 and is
now reversed. Deploying the service stops being a file copy and gains an install step —
that was the decision's actual value, and it was traded knowingly.

Charts of any kind · audio cues · a guided warmup · the extras pool · a rest timer ·
adaptive progression · deload logic · streaks or a calendar heatmap · exercise
substitution · body-weight tracking · health-app export · onboarding assessment ·
real authentication · a pull *strength* ladder (blocked on equipment, by user choice).
