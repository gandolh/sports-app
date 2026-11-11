# sports-app

A zero-equipment calisthenics trainer: an offline-first PWA (`client/`) plus a small state service
(`server/`), sharing one wire contract (`shared/`). Read [corpus/index.md](corpus/index.md) first.

## Commands

- `npm run dev`: the client with Vite. `npm run server`: the state service.
- `npm run check`: typecheck, lint, format check, conventions, tests. Run it before every hand-back.
- `npm run check:fast`: the typecheck, then ESLint on the changed files. The Stop hook runs it.
- `npx vitest run <file>`: one test file.
- `npm run format`: Prettier writes every file it covers (Markdown stays out).
- `npm run seed`: a local account.

## Places that mislead

- `SPORTS_APP_PUBLIC_ORIGIN` must be set, or the service refuses to start.
- `.env` is read from the repo root, not from `server/`.
- The server is plain `.mjs` and has no tsconfig yet, so `tsc` never sees it.
- Relative imports end in `.ts`, not `.js`: Node strips types and runs `shared/` source directly.
- `vendor/house-style/`, `client/vendor/` and `server/vendor/` are generated copies. Never edit them;
  `npm run house-style:sync` refreshes the first.
- `docs/` is a Docusaurus workspace with its own build (`npm run docs -w @sports-app/docs-site`).

## Invariants

- **The prescription never adapts to what you logged.** `prescribe()` is a pure function of
  `sessionsDone`; no logged value may reach it.
- **Zero equipment, no purchases.**
- **`client/src/domain/` reads no clock and no browser API.** Dates come in through `persistence/`.

The full list is in [corpus/CLAUDE.md](corpus/CLAUDE.md).

## Hard rules

- Code comments don't cite brief numbers, this repo's or Ward's. Say what the code does and why; the
  history belongs in `corpus/log.md`.
- No secrets in the repo or the corpus. Name a secret by its variable.
- No CI: don't add GitHub Actions, runners or other GitHub-specific automation.
- No pushes: commit locally; the owner pushes.
- Deploys, git hooks and git settings are owner steps. Write the exact commands down and hand them over.

## brief-board

Brief progress goes on brief-board. Run `brief-board guide` before you
start or resume a brief, and follow it.
