# sports-app docs

Start with the [main README](../README.md). This folder holds the docs site's workspace and the files the README links to.

| File | What it covers |
|---|---|
| [getting-started.md](getting-started.md) | Full local setup: env vars, an account, the dev server, the state service, Ward, tests |
| [images/](images/shots.md) | The GIF and screenshots in the README, and how each was made |

The rest of this folder is the docs site, a Docusaurus workspace deployed at `/sports-app/docs/`. Build it with `npm run docs -w @sports-app/docs-site`; the output is `dist/`.

| Path | What it is |
|---|---|
| `docusaurus.config.ts`, `sidebars.ts` | Site config and base path; the sidebar |
| `docs/` | The pages. `index.mdx`, `api.mdx` and `state.mdx` are written here; `wiki/` is rendered from every page in `../corpus/wiki/` plus `log.md` by `scripts/sync-corpus.mjs` |
| `src/css/custom.css` | The theme: the app's tokens on Infima, light only |
| `diagrams/architecture.json` | archify source for the architecture diagram; `scripts/build-diagrams.mjs` renders it to `static/diagrams/architecture.html` |
| `typedoc.json` | TypeDoc over `shared/`, published under `/reference/` |

Going deeper:

- Site pages worth starting with: [the programme](../corpus/wiki/programme.md), [the progression engine](../corpus/wiki/progression-engine.md), [the API routes](docs/api.mdx), [state and sync](docs/state.mdx)
- The state service: [server/README.md](../server/README.md)
- Project wiki: [corpus/](../corpus/index.md), with decisions, status and the briefs that built the app
