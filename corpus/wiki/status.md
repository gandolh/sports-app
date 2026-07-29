---
summary: Dated snapshot of where every brief stands and what's next.
updated: 2026-07-29
---

# Status — 2026-07-29

**Where things stand:** design is settled and grilled, the corpus is bootstrapped,
and **briefs 01–05, 10 and 11 have shipped** — the engine, content, persistence and figures are all in — the app scaffolds, typechecks, lints, tests, builds a
service worker, and was verified installable and offline-capable in a real browser.
Nothing has been committed yet.

**Wave 3 is complete and its gate passed.** Verified on the whole tree: typecheck
clean, lint clean, **175 tests**, and `npm run build` still emits a working service
worker. Next: brief 04 (the engine) and brief 11 (the SQLite service), in parallel.

## Wave-3 gate — resolved 2026-07-29

`fixtures.ts` was authored in brief 02 before `ladders.ts` existed, and its ladder
states were **not reachable by replaying its own history**: rung indices that
disagreed with the 1-based rung ids in that same history, a `target: 13` above the rep
cap of 12, and a rung advance recorded at a sub-max target. Repaired, and the repair
was made *provable* rather than re-asserted:

- `midProgramStart` is now exported — the state before the first recorded session — so
  **brief 04 must assert `history.reduce(applySession, midProgramStart) === midProgram`.**
  That turns the fixture from a pile of numbers into a property the engine has to
  satisfy.
- Five new tests in `types.test.ts` catch the whole bug class without the engine:
  targets inside each ladder's range, targets on-step, ladder states in bounds, logged
  rung ids matching their index, and each pattern's first logged target matching its
  start state.
- One of brief 05's tests hardcoded fixture values instead of deriving them, so the
  repair broke a test that was really asserting the fixture back to itself. Rewritten
  to derive from `midProgram` — the coupling was the actual defect.

**Also decided here (see [progression-engine.md](progression-engine.md)):** the target
step for time-based ladders.

**Toolchain as built:** Vite 8.1.5 · React 19.2.8 · TypeScript **6.0.3** (not 7 —
`typescript-eslint` doesn't support it yet) · Vitest 4.1.10 · vite-plugin-pwa 1.3.0.
All dependencies exactly pinned. `npm run check` runs typecheck + lint + tests.

**The purity guard is live.** `eslint.config.js` fails the build if anything in
`src/domain/` imports the shell, touches a browser global, reads the clock, or calls
`Math.random()`. This is what makes brief 04's simulation harness possible — treat it
as infrastructure, not style.

## Briefs

| # | Brief | State | Depends on |
|---|---|---|---|
| 01 | [Project scaffold & toolchain](../briefs/done/01-project-scaffold.md) | **done** | — |
| 02 | [Domain types & state document](../briefs/done/02-domain-types.md) | **done** | 01 |
| 03 | [Ladder content data](../briefs/done/03-ladder-content.md) | **done** | 02 |
| 04 | [Progression engine + simulation](../briefs/done/04-progression-engine.md) | **done** | 02, 03 |
| 05 | [Persistence: store, codec, export](../briefs/done/05-persistence.md) | **done** | 02 |
| 06 | [Session player](../briefs/todo/06-session-player.md) | todo | 04, 05 |
| 07 | [Audio cues](../briefs/todo/07-audio-cues.md) | todo | 06 |
| 08 | [Guided warmup](../briefs/todo/08-guided-warmup.md) | todo | 06 |
| 09 | [Progress charts](../briefs/todo/09-progress-charts.md) | todo | **04** (needs `progress.ts`), 05 |
| 10 | [SVG figure system](../briefs/done/10-svg-figures.md) | **done** | 01 |
| 11 | [SQLite persistence service](../briefs/done/11-sqlite-persistence.md) | **done** | 05 |
| 12 | [Domain v2: no effort, 7-day cycle, mid-ladder starts](../briefs/done/12-domain-v2-no-effort.md) | **done** | 04 |
| 13 | [Cardio + floor-only content + extras pool](../briefs/todo/13-cardio-and-floor-only-content.md) | todo | 12 |
| 14 | [UI shell: router, pages, Base UI, screens](../briefs/todo/14-ui-shell-and-screens.md) | todo | 12 |

## Dependency waves

Intended execution order for `plan-split-dispatch` wave mode, with a
verify-and-checkpoint gate between waves:

```
wave 1   01                 scaffold                               ✔ done
wave 2   02                 the type contract                      ✔ done
wave 3   03 · 05 · 10       content, persistence, figures          ✔ done
wave 4   04 · 11            engine, SQLite service                 ✔ done
wave 5   12                 domain v2 — no effort, cardio cycle     ✔ done
wave 6   13 · 14            cardio content, UI shell                ← next
wave 7   07 · 08            audio, warmup  (revise for no effort tap)
```

**Briefs 06 and 09 are superseded by 14**, which absorbed the session player and the
progress screen into one coherent UI brief once the page structure, router and design
system were decided. Move them to `superseded/` when 14 lands rather than leaving three
briefs claiming the same files.

The engine (04) is the highest-value brief and the one worth the most care: if it
is wrong, nothing downstream matters. It lands in wave 4 only because it needs the
type contract and real ladder data to simulate against.

**Plan correction made 2026-07-29:** brief 09 was listed in wave 4, but it consumes
`progress.ts` from brief 04 — so it depends on 04 and moved to wave 5.

## Deliberately out of v1

Daily reminder notifications · deload logic · multiple programs · exercise
substitution · body-weight and measurement tracking · health-app export ·
onboarding assessment · social anything · a pull *strength* ladder (blocked on
equipment, by user choice).
