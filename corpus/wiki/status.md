---
summary: Dated snapshot of where every brief stands and what's next.
updated: 2026-09-06
---

# Status — 2026-09-06

**Where things stand: the app is the category standard, it is green, and it builds.**
Briefs 24–27 shipped on 2026-09-04 on branch `v3-category-standard` — schema v4 with
optional logging, a Tailwind v4 token system carrying eight accents across light and
dark, and four rebuilt screens. **1115 tests** (704 at baseline), typecheck and lint
clean, and the client builds at both `/` and under `SPORTS_APP_BASE=/sports-app/`.

**The repo had not built since 2026-08-13** and nobody noticed: `0d7d4f3` left
`Prone.tsx` half-converted while `figures/index.ts` still imported the component it
deleted. Vitest does not typecheck and no test renders a prone figure, so the suite
stayed green over a tree that could not be built. Fixed by restoring the component
alongside the rig; see [`../log.md`](../log.md).

**Nothing is committed.** The branch holds the work; the deploy has still never been run.

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
| 23 | [Figure rig + morph](../briefs/todo/23-figure-rig-and-morph.md) | **in flight** — rig + `Prone.tsx` landed in `0d7d4f3`; the crossfade still renders | 18 |
| 24 | [Schema v4: logging + stop rule](../briefs/done/24-schema-v4-logging-and-stop-rule.md) | **done** | — |
| 25 | [Persistence v4](../briefs/done/25-persistence-v4.md) | **done** | 24 |
| 26 | [Tailwind + canon tokens](../briefs/done/26-tailwind-and-canon-tokens.md) | **done** | — |
| 27 | [The four screens](../briefs/done/27-the-four-screens.md) | **done** | 24, 25, 26 |

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

- **Commit the branch.** `v3-category-standard` is unpushed and uncommitted.
- **Run the deploy.** Still never executed against the box. Everything below the first
  run is unverified: SSH, the Node version check, `npm ci`, pm2, the Caddy reload.
- **Finish brief 23 or revert `0d7d4f3`.** The rig is authored and tested but nothing
  renders it, and `Prone.tsx` now carries both the rig and the restored component.
- **Decide the malformed-`logged` policy.** A hand-edit typo in a display-only field
  currently blocks training until repaired. Consistent with `cyclePosition`, and it
  surfaces the typo rather than hiding it — but it cuts against "arrive with the answer
  already made". See [`../log.md`](../log.md).
- **Open questions 8 and 9 were answered in the build** (`<HonestNote>` and `<StopRule>`),
  but 9's data half is not: `stopRule` is now its own field, so nothing is left implicit.
  Question 7 — the step between rungs — is still open and is still content, not code.
- **The theme has not been looked at on a phone.** Contrast is enforced across all
  sixteen palettes by test, which is a different claim from "it looks right in a bright
  room at arm's length".

## The deploy, in one paragraph

Static PWA → `/var/www/sports-app`, served at `https://gandolh.ro/sports-app/`. Fastify
state service → pm2 `sports-app-api` on `127.0.0.1:8794`, proxied at `/sports-app-api`
(**not** its default 8787 — farm-valley holds that port). The sqlite file lives at
`/srv/sports-app-api/data/app.db`, outside the rsync tree, protected by an anchored
`--exclude=/data`; the service's own default would have put it *inside* the mirror where
`rsync --delete` destroys it on the second deploy. Serving under a sub-path needed one
source change here: `SPORTS_APP_BASE` now drives the Vite `base`, the PWA manifest
`start_url`/`scope`/`id`, the service worker's `navigateFallback` and the router
`basepath` together.

## Deliberately out of v2

**Note on the zero-dependency service:** it was a locked decision until 2026-07-29 and is
now reversed. Deploying the service stops being a file copy and gains an install step —
that was the decision's actual value, and it was traded knowingly.

Charts of any kind · audio cues · a guided warmup · the extras pool · a rest timer ·
adaptive progression · deload logic · streaks or a calendar heatmap · exercise
substitution · body-weight tracking · health-app export · onboarding assessment ·
real authentication · a pull *strength* ladder (blocked on equipment, by user choice).
