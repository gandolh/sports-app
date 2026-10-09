# sports-app docs

Start with the [main README](../README.md). This folder holds the docs site's workspace and the files the README links to.

| File | What it covers |
|---|---|
| [getting-started.md](getting-started.md) | Full local setup: Ward, env vars, the dev server, the state service, tests, and the sign-in workaround |
| [images/](images/shots.md) | The GIF and screenshots in the README, and how each was made |

The rest of this folder is the docs site, a Starlight workspace deployed at <https://gandolh.ro/sports-app/docs/>:

| Path | What it is |
|---|---|
| `astro.config.mjs` | Site config, base path and sidebar |
| `src/content/docs/` | The pages. `index.mdx`, `api.mdx` and `state.mdx` are written here; `wiki/` is copied from `../corpus/` by `scripts/sync-corpus.mjs` |
| `diagrams/architecture.json` | archify source for the architecture diagram; `scripts/build-diagrams.mjs` renders it to `public/diagrams/architecture.html` |
| `typedoc.json` | TypeDoc over `shared/`, published under `/reference/` |

Going deeper:

- Site pages worth starting with: [the programme](https://gandolh.ro/sports-app/docs/wiki/programme/), [the progression engine](https://gandolh.ro/sports-app/docs/wiki/progression-engine/), [the API routes](https://gandolh.ro/sports-app/docs/api/), [state and sync](https://gandolh.ro/sports-app/docs/state/)
- The state service: [server/README.md](../server/README.md)
- Project wiki: [corpus/](../corpus/index.md), with decisions, status and the briefs that built the app
