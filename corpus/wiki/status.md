---
summary: Dated snapshot (2026-11-13) of sports-app, per area. The Up first redesign (2026-11-13: new tokens, a top bar from 840 px, the first exercise open on Today, Playwright checks). The fixed schedule (v2, 2026-07-29), the category-standard rebuild with logging and the token system (2026-09-04), the rigged figures (2026-10-02), the in-between rungs (2026-10-07), local accounts with Ward as a second way in (2026-10-13), the docs site on Docusaurus and the sign-in fixes (2026-10-19 to 2026-10-28); 1,252 client and server tests plus the Playwright specs; what is still open and left for the owner; what is deliberately out.
updated: 2026-11-13
---

# Status — 2026-11-13

`main` is pushed through `7bb5541` (2026-11-01). The app runs on the VPS as a
container stack of `vps-deploy`, which depends on Ward; deploying is the
owner's step there. **1,223 tests** pass; typecheck and lint are clean. No brief
is open; brief numbering restarted at 01 on 2026-11-02 (see [`../log.md`](../log.md)).
Base UI is on 1.9.0 (brief 01, 2026-11-10, built, awaiting deploy). Brief 03 (2026-11-11): Base UI sits behind
`components/ui/` wrappers, the theme is Light / Dark / System with light on a first visit, `check-base-ui` is strict;
awaiting deploy.
Brief 04 (2026-11-11): the service is TypeScript in `server/src/`, built with `tsc` to `server/dist`, in the
code structure ([server-structure.md](server-structure.md)); 1,235 tests; awaiting deploy (`server` phase).
The house style is in (2026-11-11): Prettier at 120 columns, the house ESLint
config, `npm run check` with knip and dependency-cruiser, a root `CLAUDE.md`
and `.claude/rules/` ([technical-decisions.md](technical-decisions.md)).
Brief 05 (2026-11-13, done): the redesign "Up first" is built: new tokens, a 64 px top bar from 840 px (phones keep the
bottom bar), Today with the first exercise open and the rest in one list, the player and Progress rebuilt, every other
screen on the new tokens, and Playwright 1.63.0 with the Floor specs in `client/e2e/`
([design-system.md](design-system.md#the-up-first-redesign-2026-11-13)); awaiting deploy (`deploy` phase, client only).

## By area

- **The fixed schedule** (2026-07-29). The prescription is one law — a rung
  takes about six weeks and the step is the span divided by the sessions in it —
  and never adapts to what is logged. The rotation is Push · Legs · Cardio with
  a core-and-posture block every day ([progression-engine.md](progression-engine.md),
  [programme.md](programme.md)).
- **Workspaces and the service** (2026-07-29). npm workspaces with `shared/`;
  the state service on Fastify, one hand-editable JSON document per user in
  SQLite ([architecture.md](architecture.md), [technical-decisions.md](technical-decisions.md)).
- **The category standard** (2026-09-04). Schema v4 with optional logging and
  the stop rule, a Tailwind v4 token system carrying eight accents in light and
  dark, and four rebuilt screens: `/`, `/plan`, `/progress`, `/library`, plus
  `/account` ([design-system.md](design-system.md), [reversals.md](reversals.md)).
- **The Up first redesign** (2026-11-13). The owner approved the direction on the estate redesign board; two lines of
  [decisions.md](decisions.md) are changed, dated, with the old lines kept (the top bar from 840 px, and no tracked
  capitals).
- **Figures** (2026-10-02). Rigged figures that morph between poses; the
  crossfade is gone.
- **In-between rungs** (2026-10-07). Three rungs at the three big steps, with
  schema v5 and a state migration.
- **Identity** (2026-10-13, fixes to 2026-10-28). Local accounts on the state
  service with "Sign in with Ward" as a linked second way in; the sign-in loop
  on a fresh browser fixed; a sign-in, and a Ward retry, return to the screen
  that was asked for; ward-auth 0.7.0 with rename off
  ([decisions-identity.md](decisions-identity.md)).
- **Docs** (2026-10-19). The docs site at `/sports-app/docs` on Docusaurus.
- **Copy** (2026-10-19). The Account page's total-work note says logged sets
  are not counted.

## Open

- **Watch the figures move on a phone.** The rigged morph was checked as frozen
  frames in headless Chrome, not watched live. Easing the turnaround waits on
  that look.
- **The theme on a phone.** Contrast is enforced across all sixteen palettes by
  test, which is not the same as "it looks right in a bright room".
- **The malformed-`logged` policy.** A hand-edit typo in a display-only field
  blocks training until repaired. Consistent with `cyclePosition`, and it
  surfaces the typo, but it cuts against "arrive with the answer already made".
- **Milestones after a rung insertion** (left on purpose, owner, 2026-10-07):
  milestones replay history on today's ladders, so a migrated document past an
  insertion lists the new rung as reached
  ([progression-engine.md](progression-engine.md#inserting-a-rung-moves-people-so-it-needs-a-migration)).
- **The live Ward round trips.** A sign-in through Ward that returns to the
  asked screen, and a refusal at Ward then a retry, were checked with a faked
  service, not a running Ward: open `/plan` signed out, start "Sign in with
  Ward", refuse, try again, sign in, and `/plan` shows.

## Deliberately out

Charts of any kind · audio cues · a guided warmup · the extras pool · a rest
timer · adaptive progression · deload logic · exercise substitution ·
body-weight tracking · health-app export · onboarding assessment · a pull
*strength* ladder (blocked on equipment, by the owner's choice). Dates, streaks
and a calendar came back on 2026-09-04 as display only ([reversals.md](reversals.md)).
