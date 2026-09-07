// @ts-check
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

/**
 * One flat config at the workspace root, covering all three workspaces.
 *
 * Deliberately not one config per workspace: the rules that earn ESLint its place
 * in this project are *boundary* rules, and a boundary is a statement about two
 * packages at once. Splitting them per workspace would also mean `shared/`'s
 * constraints could be relaxed by editing a file inside `shared/`, which is
 * precisely what they exist to prevent.
 *
 * The load-bearing parts are the two blocks in the middle:
 *
 *   1. **`shared/**`** — the wire contract. No `node:`, no DOM, no import from
 *      either runtime. It is a dependency of a browser bundle and of a Node
 *      service at the same time, so anything that assumes one breaks the other.
 *   2. **`client/src/domain/**`** — the pure core: the progression engine and the
 *      content it operates on. Its purity is what makes the engine trustworthy —
 *      it can be simulated across hundreds of synthetic sessions with no DOM, no
 *      storage and no clock.
 *
 * Purity enforced by comment decays. Purity enforced by a failing lint does not.
 */
export default tseslint.config(
  // `**/` prefixes rather than bare `dist/`: build output now lives inside a
  // workspace (`client/dist`, `client/dev-dist`) rather than at the root.
  //
  // The `docs/` entries are all GENERATED, and all of them are third-party
  // output rather than anything this repo wrote: Astro's type cache, TypeDoc's
  // bundled viewer scripts, and archify's self-contained diagram artifacts.
  // Linting them added 387 errors to a 6-error baseline and told us nothing —
  // they are build products that happen to be committed or cached, not source.
  // `docs/`'s own hand-written files (astro.config.mjs, scripts/) are NOT
  // ignored and do lint.
  {
    ignores: [
      '**/dist/',
      '**/dev-dist/',
      '**/coverage/',
      '**/node_modules/',
      'docs/.astro/',
      'docs/public/reference/',
      'docs/public/diagrams/',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['client/src/**/*.{ts,tsx}', 'shared/**/*.ts'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // ---------------------------------------------------------------------------
  // The wire contract. See corpus/wiki/architecture.md for the dependency
  // direction, and shared/types.ts for what is allowed in and what is not.
  //
  // This block is the answer to "how do you stop someone importing node:fs into
  // shared/". A comment saying "don't" is exactly the thing that stops being true.
  // ---------------------------------------------------------------------------
  {
    files: ['shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // `node:*` catches the prefixed form, which is the only form this
              // repo uses. The bare names are listed too, because `import 'fs'`
              // still resolves under Node and would be just as fatal in a browser.
              group: ['node:*', 'fs', 'path', 'url', 'crypto', 'sqlite', 'http', 'os'],
              message:
                'shared/ may not import from node:. It is a dependency of a browser bundle ' +
                'and of a Node service at the same time, so anything node-only breaks the ' +
                'client build. It belongs in server/. See corpus/wiki/architecture.md.',
            },
            {
              group: [
                '@sports-app/client',
                '@sports-app/client/**',
                '@sports-app/server',
                '@sports-app/server/**',
                '**/client/**',
                '**/server/**',
              ],
              message:
                'shared/ may not import from client/ or server/. It is the bottom of the ' +
                'dependency graph and depends on nothing — both runtimes point at it, never ' +
                'the other way round. See corpus/wiki/architecture.md.',
            },
          ],
        },
      ],

      // No DOM, and no Node ambient globals either. `shared/tsconfig.json` denies
      // the DOM lib as well, so most of these are a type error first — but a lint
      // message that states the reason is worth more than "cannot find name", and
      // the tsconfig cannot speak for `process` at all (there are no `@types/node`
      // in this repo, so it was never a name to begin with).
      'no-restricted-globals': [
        'error',
        ...[
          'window',
          'document',
          'localStorage',
          'sessionStorage',
          'navigator',
          'fetch',
          // `globalThis` is the back door: it is legal in both runtimes and would
          // let `globalThis.document` walk straight past every name above.
          'globalThis',
          'process',
          'Buffer',
          'require',
          '__dirname',
          '__filename',
        ].map((name) => ({
          name,
          message:
            `shared/ may not touch a runtime global (${name}). It has to behave identically ` +
            'in a browser and in Node, so it may assume neither.',
        })),
      ],

      // Data shapes and validation, never behaviour — and a clock or a random
      // number is behaviour. A contract that answers differently on two reads is
      // not a contract.
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message:
            'shared/ holds data shapes and validation, never behaviour. Reading the clock is ' +
            'behaviour — a timestamp is a parameter of whichever runtime supplies it.',
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message:
            'shared/ holds data shapes and validation, never behaviour. Reading the clock is ' +
            'behaviour — a timestamp is a parameter of whichever runtime supplies it.',
        },
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message:
            'shared/ must be deterministic. Randomness belongs to a runtime, not to a contract.',
        },
      ],
    },
  },

  // ---------------------------------------------------------------------------
  // The pure core. See corpus/wiki/architecture.md for the dependency direction.
  // ---------------------------------------------------------------------------
  {
    files: ['client/src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/persistence/**', '**/session/**', '**/ui/**'],
              message:
                'client/src/domain/ is the pure core and may not depend on the shell. ' +
                'Dependencies point ui → session → domain → shared, never back. ' +
                'See corpus/wiki/architecture.md.',
            },
            {
              // The core may import `shared/` — that is the whole point of it —
              // but the service is on the far side of an HTTP boundary.
              group: ['@sports-app/server', '@sports-app/server/**'],
              message:
                'client/src/domain/ may not import the service. The client reaches it over ' +
                'HTTP, from persistence/sync.ts. See corpus/wiki/architecture.md.',
            },
          ],
        },
      ],

      // No browser APIs in the pure core.
      'no-restricted-globals': [
        'error',
        ...['window', 'document', 'localStorage', 'sessionStorage', 'navigator', 'fetch'].map(
          (name) => ({
            name,
            message:
              `client/src/domain/ may not touch browser APIs (${name}). ` +
              'Move this to the shell.',
          }),
        ),
      ],

      // No clock. Every timestamp is passed in by the caller — that is what
      // makes the engine deterministic and its simulation reproducible.
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message:
            'client/src/domain/ may not read the clock. Timestamps are parameters, not ambient ' +
            'state — the simulation harness depends on it.',
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message:
            'client/src/domain/ may not read the clock. Timestamps are parameters, not ambient ' +
            'state — the simulation harness depends on it.',
        },
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message:
            'client/src/domain/ must be deterministic. Randomness belongs in a test harness, ' +
            'passed in explicitly.',
        },
      ],
    },
  },

  // Config and script files run in Node and are not part of the app. `**/`
  // because they now live inside workspaces (client/vite.config.ts,
  // server/vitest.config.mjs) as well as at the root (vitest.config.ts).
  {
    files: ['**/*.config.{js,mjs,ts}', 'scripts/**/*.{js,mjs,ts}'],
    rules: {
      'no-restricted-imports': 'off',
      'no-restricted-globals': 'off',
      'no-restricted-syntax': 'off',
    },
  },

  // ---------------------------------------------------------------------------
  // The state service (brief 11). Plain .mjs run directly by Node and never
  // bundled. The explicit globals list is here rather than a `globals` package
  // because the service was once dependency-free and that was worth preserving;
  // it now takes Fastify, but one dependency in the *linter* still buys nothing.
  // It is not under `client/src/`, so none of the pure-core rules above apply.
  //
  // This block predicted its own survival of brief 22 — it is about the
  // *runtime*, not the HTTP library — and it was right: the Fastify migration
  // left the service as `server/*.mjs` in place, so the glob never moved. Proved
  // by pointing it at a glob that matches nothing, which turns every `process`,
  // `Buffer` and `URLSearchParams` in the service into a `no-undef` error.
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Build-time scripts. Node globals, and deliberately a SEPARATE block from the
  // service's below rather than a widened glob: the service is a long-lived
  // runtime with a web-API surface (fetch, Response, Headers) and these are
  // one-shot generators that only ever read argv, write a file and log. Sharing
  // one block would hand `scripts/` a runtime vocabulary it has no business
  // reaching for, and would make the service's globals list stop describing the
  // service.
  // ---------------------------------------------------------------------------
  //
  // `docs/` joins this block rather than getting one of its own: its two build
  // scripts and its Astro config are exactly the same shape — one-shot generators
  // that read an env var, write files and log. `astro.config.mjs` is included by
  // name because it reads `process.env.DOCS_BASE` and nothing else.
  {
    files: ['scripts/**/*.mjs', 'docs/scripts/**/*.mjs', 'docs/astro.config.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly' },
    },
  },

  {
    files: ['server/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        fetch: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        Headers: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        queueMicrotask: 'readonly',
      },
    },
  },
)
