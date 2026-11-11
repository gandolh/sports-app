---
paths:
  - "client/src/**"
---

# The client (`client/src`)

- `prescribe()` is a pure function of `sessionsDone` and nothing else. No logged value (reps, dates,
  streaks) may reach it. The progression engine's numbers depend on it.
- `client/src/domain/` reads no clock and no browser API. A date enters through `persistence/` and is
  passed in. ESLint fails the build on `Date.now()`, `new Date()` and `Math.random()` there.
- Dependencies point `ui` to `session` to `domain` to `shared`, never back. `domain/` imports nothing
  from `persistence/`, `session/` or `ui/`.
- Zero equipment: no bar, bands, rings or weights, and no rung that needs them.
- A ladder rung is one movement plus a modifier (tempo, pause, range, leverage, unilateral), never a
  different exercise.
- No hex colours outside `ui/tokens.css`. `noHexColors.test.ts` and `contrast.test.ts` read that file,
  so keep its shape.
- Base UI goes through wrappers under `ui/components/ui/`. Read the `base-ui` skill before adding one.
- Output goes through no `console`, apart from the sync warning, which is the user-visible log of a
  failed background save.
- Relative imports end in `.ts` or `.tsx`, and a type-only import is `import type`.
