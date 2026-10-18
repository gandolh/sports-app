# Task 31 — Move the docs site from Starlight to Docusaurus

## Context

On 2026-10-18 the owner decided to move every project's docs site from Astro
Starlight to Docusaurus. `docs/` (`@sports-app/docs-site`, served at
`/sports-app/docs/`) is one of them.

The recipe is written and verified. The `corpus-docs-site` skill
(personal-skills v0.31.0, source in
`~/projects/my-personal-skills/skills/corpus-docs-site/`) now scaffolds
Docusaurus 3.10, and `references/migrating-from-starlight.md` beside it holds
the file, config and content maps plus ten gotchas, each hit during a real
port. **Read that guide first.** The files this brief tells you to copy are in
the same folder. If the installed plugin is older than v0.31.0, read them from
the source path.

What the site has today (2026-10-18):
- base `/sports-app/docs/` (`DOCS_BASE ??`), **light only** (doctrine 4 in
  `design-system.md`; both `Theme*.astro` overrides), 20 sidebar links, with the
  TypeDoc "Wire contract" link opening in a new tab;
- three authored pages, `index.mdx` (a `Diagram`, a raw `<dl>`), `api.mdx` and
  `state.mdx`, with 18 `:::note` and one `:::caution`;
- `src/styles/theme.css` (227 lines, 38 `--sl-*` tokens, Archivo via
  `@fontsource`);
- `scripts/sync-corpus.mjs` with a hand-kept list of 16 pages, and
  `scripts/build-diagrams.mjs` (one archify diagram);
- TypeDoc (`../shared/api.ts` → `public/reference`);
- `eslint.config.js` that knows the Astro layout: it ignores `docs/.astro/`
  (around line 47) and lints `docs/astro.config.mjs` with the scripts
  (around line 275).

**Built through Docusaurus on 2026-10-18.** All 16 corpus pages built through
the new sync in `markdown.format: 'detect'` mode. In MDX mode the corpus does
not compile. Two findings:
- `corpus/wiki/decisions-identity.md` has three links into
  `../../../wzd_auth/corpus/wiki/…` (for example `decisions-oidc.md`, line 15).
  Docusaurus fails the build on them. Starlight's sync had turned them into
  404ing GitHub URLs under this repo's `corpus/`.
- **One broken anchor**, reported as a warning. `progression-engine.md` links
  `decisions.md#the-governing-decision--the-app-measures-nothing`. That
  heading was replaced on 2026-09-04 (see `reversals.md`). Point the link at
  the current governing invariant.

## What to do

1. **Baseline.** `npm run docs -w @sports-app/docs-site`, then save
   `(cd docs/dist && find . -name index.html | sort) > /tmp/sa-routes-before.txt`.
2. **Config.** Write `docs/docusaurus.config.ts` from the skill's reference.
   Set baseUrl `process.env.DOCS_BASE ?? '/sports-app/docs/'`,
   `trailingSlash: true`, `routeBasePath: '/'`, `markdown.format: 'detect'`,
   light-only `colorMode`, local search, and the GitHub navbar item. Port the
   20-link sidebar to `docs/sidebars.ts`. "Wire contract" becomes
   `{ type: 'link', href: 'pathname:///reference/' }`. Content lives in
   `docs/docs/`. `docs/README.md`, `docs/getting-started.md` and
   `docs/images/` stay where they are, and the build ignores them.
3. **package.json** per the guide: no `"type": "module"`, keep the
   `browserslist`, and add `start`/`docs`/`typecheck`. Keep `typedoc` and
   `@fontsource-variable/archivo`. Drop `astro`, `@astrojs/starlight`, `cookie`
   and `sharp`; grep the repo first for any other importer of either.
4. **Content.** Move the three `.mdx` pages to `docs/docs/`. `index.mdx` gets
   `slug: /`. Replace the `tableOfContents` keys. Use the skill's
   `Diagram.tsx`. `git mv public/diagrams static/diagrams`, and point
   `build-diagrams.mjs` at it.
5. **Sync.** Use the skill's `sync-corpus.mjs`, with `GITHUB_REPO` set to this
   repo's GitHub URL and
   `OTHER_REPOS = { wzd_auth: 'https://github.com/gandolh/ward-auth' }`.
   Discovery renders every wiki page. Check the set against the old list and
   the sidebar. TypeDoc's `"out"` becomes `"static/reference"`.
6. **Theme.** Port `theme.css` to `src/css/custom.css` with the guide's token
   and selector maps (the skill's `references/custom.css` header). Keep the
   doctrine comments.
7. **Lint config.** In `eslint.config.js`, ignore `docs/.docusaurus/`,
   `docs/dist/`, `docs/docs/wiki/` and `docs/static/reference/`, and fix the
   comment around line 32. The scripts block (around line 275) loses
   `docs/astro.config.mjs`. Either lint `docs/docusaurus.config.ts`,
   `docs/sidebars.ts` and `docs/src/**/*.tsx` under the repo's TypeScript
   rules, or ignore them by name with a comment. No silent gap.
8. **Wiring.** `docs/.gitignore`: `.astro/` → `.docusaurus/`,
   `src/content/docs/wiki/` → `docs/wiki/`, `public/reference/` →
   `static/reference/`. Fix the anchor in `progression-engine.md`. Update
   `README.md` line 64 ("The Starlight docs site") and `docs/README.md`
   lines 10–14 (Starlight, `astro.config.mjs`).

## Files you OWN

- `docs/` (the site files: config, `scripts/`, `src/`, `public/`→`static/`,
  `package.json`, `tsconfig.json`, `.gitignore`, `README.md`)
- `eslint.config.js` (the docs ignores and the scripts block)
- `package-lock.json`
- `README.md` (line 64) and the one anchor fix in `corpus/wiki/progression-engine.md`

## Must NOT touch

- `client/`, `server/`, `shared/`. TypeDoc reads `shared/api.ts`; it does not
  change it.
- `corpus/wiki/*.md` link text, except the one anchor fix.
- vps-deploy. Its brief 11 switches the `sports-app` docs stack's check from
  `_astro/` to `assets/`.

## Acceptance checks

- `npm run docs -w @sports-app/docs-site` exits 0 with `onBrokenLinks: 'throw'`
  and no broken-anchor warning.
- Route parity: the new route list equals `/tmp/sa-routes-before.txt` plus
  `./search/index.html`.
- `grep -c '/sports-app/docs/assets/' docs/dist/index.html` is non-zero, and
  `grep -rl '_astro' docs/dist` finds nothing.
- `decisions-identity`'s Ward links point at `github.com/gandolh/ward-auth`.
- `npm run lint`, `npm run typecheck` and `npm test` pass at the root, and
  `npm run typecheck -w @sports-app/docs-site` passes.
- Browser check, with `docs/dist` served at `/sports-app/docs/` by a plain
  static server (not `docusaurus serve`):
  - the landing page, `/state/` and `/api/` render in the app's look;
  - the diagram and `/reference/` load;
  - there is no theme toggle;
  - search returns results.
  Screenshot the landing page.
- `bash corpus/lint.sh` passes.

## Out of scope

Deploying. The owner deploys after vps-deploy brief 11 flips the `sports-app`
docs stack.
