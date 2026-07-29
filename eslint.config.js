// @ts-check
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

/**
 * The load-bearing part of this config is the `src/domain/**` block near the
 * bottom. `domain/` is the pure core: the progression engine and the content it
 * operates on. Its purity is what makes the engine trustworthy — it can be
 * simulated across hundreds of synthetic sessions with no DOM, no storage and
 * no clock.
 *
 * Purity enforced by comment decays. Purity enforced by a failing lint does not.
 */
export default tseslint.config(
  { ignores: ['dist/', 'dev-dist/', 'coverage/', 'node_modules/'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['src/**/*.{ts,tsx}'],
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
  // The pure core. See corpus/wiki/architecture.md for the dependency direction.
  // ---------------------------------------------------------------------------
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/persistence/**', '**/session/**', '**/ui/**'],
              message:
                'src/domain/ is the pure core and may not depend on the shell. ' +
                'Dependencies point ui → session → domain, never back. ' +
                'See corpus/wiki/architecture.md.',
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
            message: `src/domain/ may not touch browser APIs (${name}). Move this to the shell.`,
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
            'src/domain/ may not read the clock. Timestamps are parameters, not ambient state — ' +
            'the simulation harness depends on it.',
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message:
            'src/domain/ may not read the clock. Timestamps are parameters, not ambient state — ' +
            'the simulation harness depends on it.',
        },
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message:
            'src/domain/ must be deterministic. Randomness belongs in a test harness, ' +
            'passed in explicitly.',
        },
      ],
    },
  },

  // Config and script files run in Node and are not part of the app.
  {
    files: ['*.config.{js,ts}', 'scripts/**/*.{js,mjs,ts}'],
    rules: {
      'no-restricted-imports': 'off',
      'no-restricted-globals': 'off',
      'no-restricted-syntax': 'off',
    },
  },

  // ---------------------------------------------------------------------------
  // The state service (brief 11). Plain .mjs run directly by Node, never
  // bundled, and deliberately dependency-free — including no `globals` package,
  // hence the explicit list. It is not part of `src/`, so none of the pure-core
  // rules above apply to it.
  // ---------------------------------------------------------------------------
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
