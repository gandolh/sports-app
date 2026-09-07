// @ts-check
import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

/**
 * sports-app's documentation site.
 *
 *   • Narrative  → authored here: an orientation page, the four-route wire
 *                  contract, and the state/sync model.
 *   • Corpus     → sixteen pages synced by scripts/sync-corpus.mjs. This project's
 *                  corpus carries the training science and the programme design,
 *                  which no docs site should try to restate.
 *   • Reference  → TypeDoc over `shared/`, the TypeBox schemas that are the wire
 *                  contract for both the service and the client.
 *   • Diagrams   → archify, from the typed JSON in diagrams/.
 *
 * Deployed at https://gandolh.ro/sports-app/docs/.
 */
// The deployed base path, baked in rather than injected at deploy time.
//
// vps-deploy ships what this repo already built and VERIFIES this base — it does
// not set it. That is the estate's rule for the case that matters most (Ward's
// UI does the same, see vps-deploy/stacks/ward.ts): a variable the deploy passes
// that changes nothing is a variable that can silently disagree, whereas a value
// baked here and checked there cannot. Build with `npm run docs`; a wrong base
// fails the deploy by name instead of shipping a page whose every asset 404s.
//
// DOCS_BASE still overrides it, for building a copy to serve from somewhere else.
const base = process.env.DOCS_BASE ?? '/sports-app/docs/'

export default defineConfig({
  base,
  site: 'https://gandolh.ro',
  integrations: [
    starlight({
      title: 'sports-app',
      description:
        'A zero-equipment calisthenics trainer, installed as an offline-first PWA. It measures nothing, and that is the governing design decision.',
      tagline: 'An instrument, not a coach.',
      customCss: ['./src/styles/theme.css'],
      // One theme, and it is light — design-system.md doctrine 4. The toggle is
      // removed rather than disabled.
      components: {
        ThemeProvider: './src/components/ThemeProvider.astro',
        ThemeSelect: './src/components/ThemeSelect.astro',
      },
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/gandolh/sports-app' }],
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'What sports-app is', link: '/' },
            { label: 'Overview', link: '/wiki/overview/' },
            { label: 'Architecture', link: '/wiki/architecture/' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'The four routes', link: '/api/' },
            { label: 'State and sync', link: '/state/' },
            { label: 'Wire contract (TypeDoc) ↗', link: '/reference/', attrs: { target: '_blank' } },
          ],
        },
        {
          label: 'The product',
          items: [
            { label: 'The programme', link: '/wiki/programme/' },
            { label: 'The progression engine', link: '/wiki/progression-engine/' },
            { label: 'Training science', link: '/wiki/training-science/' },
            { label: 'Adherence', link: '/wiki/adherence/' },
            { label: 'Reversals', link: '/wiki/reversals/' },
          ],
        },
        {
          label: 'Design',
          items: [
            { label: 'Design system', link: '/wiki/design-system/' },
            { label: 'Guardrails', link: '/wiki/design-guardrails/' },
          ],
        },
        {
          label: 'Decisions and state',
          items: [
            { label: 'Decisions', link: '/wiki/decisions/' },
            { label: 'Identity', link: '/wiki/decisions-identity/' },
            { label: 'Technical decisions', link: '/wiki/technical-decisions/' },
            { label: 'Licensing', link: '/wiki/licensing/' },
            { label: 'Open questions', link: '/wiki/open-questions/' },
            { label: 'Status', link: '/wiki/status/' },
            { label: 'Change log', link: '/wiki/log/' },
          ],
        },
      ],
    }),
  ],
})
