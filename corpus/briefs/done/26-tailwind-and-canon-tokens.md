# Task 26 — Tailwind v4 and the canon token system

## Context

The 2026-09-04 direction round replaced the white "Instrument" world with **the category
standard**, executed straight at openGym's craft bar: near-black ground, one accent
chosen from eight, light and dark at parity, drawn iconography, Inter.

This brief lands the **token and build layer only**. It ships no screens.

Reference build (open it, it is the spec):
`https://claude.ai/code/artifact/819f0350-96a2-41c1-8993-4ccb83347460`

## What you own

```
client/package.json                          add tailwindcss + @tailwindcss/vite
client/vite.config.ts                        the plugin, nothing else
client/src/ui/tokens.css                     REWRITTEN — the canon palette + @theme
client/src/ui/__tests__/noHexColors.test.ts  update the glob; KEEP the test
client/src/ui/__tests__/contrast.test.ts     extend to 8 accents x 2 themes
```

**Do NOT touch** `client/src/ui/app.css` (brief 27 deletes it), any route, any
component, `client/src/ui/figures/**`, or anything outside `client/`.

## Tailwind v4, CSS-first

Use `@tailwindcss/vite`, not PostCSS. **`tokens.css` stays the single source of colour
truth** — Tailwind reads it through `@theme`, so the palette does not move into a JS
config and `noHexColors.test.ts` keeps working. That is the whole reason for this shape;
do not put colours in a `tailwind.config.js`.

```css
@import "tailwindcss";
:root { /* the palette, as today */ }
@theme inline { --color-surface-1: var(--s1); … }
```

## The palette

Three theme states, exactly as the reference build does it, and this ordering is
load-bearing:

1. bare `:root` defines the **complete light palette**;
2. `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }`
   redefines only the tokens;
3. `:root[data-theme="dark"] { … }` redefines them again.

A colour whose only definition lives inside a media or `[data-theme]` block never
applies in the unstamped state. Declare every token in bare `:root` first.

Roles: `bg`, `s1`–`s3`, `tx`, `tx2`, `tx3`, `line`, `line2`, `accent`, `accent-2`,
`on-accent`, `warn`, `warn-bg`, `dang`, `dang-bg`, `grid0`. Radii, and a shadow scale —
**the no-shadow rule is gone with the old world**; a card on near-black needs real
offset and blur to read as a card.

**Eight accents.** Mint, Azure, Violet, Magenta, Coral, Amber, Lime, Slate. Each ships
its **own `on-accent` ink** — one shared ink cannot clear contrast against all eight, and
that is exactly the failure the contrast test exists to catch. The accent is set by a
`[data-accent="…"]` stamp on the root.

`warn` and `dang` are **separate hues and never the accent**. That separation is what
lets the accent be any of the eight without breaking a warning.

## The two tests

**`noHexColors.test.ts` survives.** Update its glob for the new file layout and keep the
"found sources / excluded exactly one token file" guard — that assertion is what caught
this test running vacuously for its whole life. Its regex already catches Tailwind
arbitrary values like `bg-[#123456]`, which is a bonus, not an accident; say so in a
comment.

**`contrast.test.ts` is the load-bearing one and it gets harder.** It must now assert,
pair by pair, across **both themes and all eight accents**:

- body and placeholder text ≥ 4.5:1 on the surface it is actually painted on;
- non-text UI ≥ 3:1;
- every `on-accent` against its own accent;
- `warn` on `warn-bg` composited over its real backdrop, and the same for `dang`.

That is 8 × 2 × (the pair list) — generate it, do not hand-write it. Keep the existing
"parsed the token file and it was non-empty" assertion; a test that greps a file it
failed to open is green and worthless, and this repo has shipped that bug three times.

**If a pair fails, change the colour, not the threshold.** Report any pair you cannot
get over the line rather than lowering it.

## Acceptance

- `npm run typecheck && npm run lint && npm test` green from the repo root.
- `npm run build --workspace @sports-app/client` emits a working bundle.
- Every existing test that is not about the palette still passes untouched. Brief 27
  owns the ones that break because `app.css` classes changed; **if a screen test fails
  in this brief, you have gone out of scope.**
- The contrast test fails if you deliberately break one accent's `on-accent`. Check this
  by hand once, then put it back.

## Out of scope

Any screen, any component, any route. Deleting `app.css`. Fonts beyond declaring the
Inter face.
