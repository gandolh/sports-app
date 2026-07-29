# Task 01 — Project scaffold & toolchain

## Context

Greenfield repo. Currently contains only [`SPEC.md`](../../../SPEC.md) and
`corpus/` — no `package.json`, no commits. Everything else is blocked on this.

Target is an offline-first installable PWA: Vite + React + TypeScript, per
[decisions.md](../../wiki/decisions.md). Read
[architecture.md](../../wiki/architecture.md) for the module layout this must
create, and honor the dependency direction it specifies — `src/domain/` importing a
browser API is a design violation, not a style nit.

## Files you OWN

```
package.json  tsconfig.json  vite.config.ts  vitest.config.ts (or vitest in vite config)
index.html  .gitignore  .npmrc
src/main.tsx  src/ui/App.tsx  src/vite-env.d.ts
src/domain/.gitkeep  src/persistence/.gitkeep  src/session/.gitkeep  src/ui/figures/.gitkeep
public/manifest.webmanifest  public/icons/*
```

## Files you must NOT touch

`SPEC.md`, anything under `corpus/`. Do not author domain types, ladder content, or
any engine logic — briefs 02–04 own those. Do not build UI beyond a placeholder
`App.tsx` that renders the app name.

## What to do

1. Scaffold Vite + React + TypeScript. **Pin exact dependency versions** (no `^`).
2. `tsconfig.json` in strict mode. Enable `noUncheckedIndexedAccess` — the engine
   indexes into ladder arrays constantly and an off-by-one there is exactly the bug
   class we cannot afford.
3. Add **Vitest** with a `test` and `test:watch` script. `src/domain/` must be
   testable with no DOM environment; use the `node` environment by default and opt
   into `jsdom` per-file only where a component test needs it.
4. Add the PWA layer: `vite-plugin-pwa` with `registerType: 'autoUpdate'`,
   precaching the app shell. Web manifest with `display: standalone`, a name, a
   theme colour, and 192/512 icons. **Placeholder icons are fine** — generate flat
   solid-colour PNGs; do not spend time on iconography.
5. Enforce the layering with a lint rule rather than a comment: add ESLint with
   `no-restricted-imports` forbidding `src/domain/**` from importing
   `../persistence`, `../session`, `../ui`. If wiring an ESLint import-boundary
   rule proves fiddly, a tiny `scripts/check-layers.mjs` grep run in `npm test` is
   an acceptable substitute — but the check must exist and must fail loudly.
6. Scripts: `dev`, `build`, `preview`, `test`, `typecheck`, `lint`.
7. Create the empty module directories from
   [architecture.md](../../wiki/architecture.md) with `.gitkeep` files so later
   briefs drop into a known structure.
8. `.gitignore`: `node_modules/`, `dist/`, `.env*`, `*.local`, `.codegraph/`.

## Acceptance

- `npm install && npm run typecheck && npm run lint && npm test && npm run build`
  all pass from a clean checkout.
- `npm run build` emits a service worker and the manifest into `dist/`.
- `npm run preview`, opened in a browser, is installable (Chrome shows the install
  affordance) and renders the placeholder App.
- The layer check **fails** when you temporarily add
  `import '../ui/App'` to a file in `src/domain/`. Demonstrate this, then revert.
- No dependency in `package.json` uses a range specifier.

---

## Outcome — 2026-07-29

Shipped as specified. All acceptance criteria verified, not assumed.

**TypeScript pinned to 6.0.3, not 7.0.2.** `typescript-eslint@8.65.0` peer-requires
`typescript >=4.8.4 <6.1.0`, and the import-boundary rule is the entire reason
ESLint is in this project — so the newest TS would have cost the guard it exists to
enforce. Revisit when typescript-eslint supports 7.

**`brace-expansion` overridden to 5.0.8.** The initial install reported 8 high-severity
advisories, all collapsing to one root cause: a DoS reachable via `workbox-build`'s
build-time chain (`ejs → jake → filelist → minimatch → brace-expansion`). Build-time
only, nothing shipped to the browser, but a one-line `overrides` entry fixed it
outright — `npm audit` is now clean and the production build (including workbox
precache generation) verified working with the override in place.

**The purity guard is stronger than the brief asked for.** Beyond forbidding
`domain → ui/session/persistence` imports, `eslint.config.js` also blocks browser
globals (`window`, `document`, `localStorage`, `navigator`, `fetch`), `new Date()`,
`Date.now()`, and `Math.random()` inside `src/domain/`. Demonstrated: a file with all
five violations produced 5 errors with actionable messages, then was reverted.
This is what makes brief 04's simulation harness possible, so it is enforced rather
than documented.

**Verified in a real browser, not inferred from the build log:** service worker
registered at `/sw.js`, manifest valid with a maskable icon, `display: standalone`.
Then set the browser offline and reloaded — page rendered fully from cache with 7
precache entries. Confirmed the emulation was genuine by asserting an *uncached*
fetch rejected.

**Finding for brief 11:** `navigator.onLine` reported `true` while the network was
demonstrably offline. Do not gate sync on it — attempt the request and catch.

Not done, deliberately: nothing committed (the user controls when corpus and code
land in git). Icons are flat solid-colour placeholders, as specified.
