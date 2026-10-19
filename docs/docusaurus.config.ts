import type { Config } from '@docusaurus/types'
import type * as Preset from '@docusaurus/preset-classic'

/**
 * sports-app's documentation site.
 *
 *   • Narrative  → authored in docs/: an orientation page, the service's routes,
 *                  and the state/sync model.
 *   • Corpus     → every corpus/wiki page plus log.md, synced into docs/wiki/ by
 *                  scripts/sync-corpus.mjs. This project's corpus carries the
 *                  training science and the programme design, which no docs site
 *                  should try to restate.
 *   • Reference  → TypeDoc over `shared/`, the TypeBox schemas that are the wire
 *                  contract for both the service and the client, in
 *                  static/reference/.
 *   • Diagrams   → archify, from the typed JSON in diagrams/, in static/diagrams/.
 */

// The deployed base path, baked in rather than injected at deploy time.
//
// vps-deploy ships what this repo already built and VERIFIES this base — it does
// not set it. A variable the deploy passes that changes nothing is a variable that
// can silently disagree, whereas a value baked here and checked there cannot.
// Build with `npm run docs`; a wrong base fails the deploy by name instead of
// shipping a page whose every asset 404s.
//
// DOCS_BASE still overrides it, for building a copy to serve from somewhere else.
const baseUrl = process.env.DOCS_BASE ?? '/sports-app/docs/'

const config: Config = {
  title: 'sports-app',
  tagline:
    'A zero-equipment calisthenics trainer, installed as an offline-first PWA. Its schedule never adapts to what you log, and that is the governing design decision.',
  url: 'https://gandolh.ro',
  baseUrl,
  // Directory-style URLs (/wiki/overview/ → wiki/overview/index.html): what the
  // Starlight site published, so every existing link keeps working.
  trailingSlash: true,
  future: { v4: true },
  onBrokenLinks: 'throw',
  onBrokenAnchors: 'warn',
  markdown: {
    // .md (the synced corpus) parses as CommonMark, .mdx (the three authored
    // pages) as MDX. As MDX the corpus does not compile: a bare `<` or `{` in
    // prose is JSX.
    format: 'detect',
    hooks: { onBrokenMarkdownLinks: 'throw' },
  },
  i18n: { defaultLocale: 'en', locales: ['en'] },
  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
        },
        blog: false,
        theme: { customCss: './src/css/custom.css' },
      } satisfies Preset.Options,
    ],
  ],
  // Local, offline search. Starlight shipped Pagefind; Docusaurus ships nothing.
  themes: [
    [
      '@easyops-cn/docusaurus-search-local',
      { hashed: true, docsRouteBasePath: '/', indexBlog: false, indexPages: false },
    ],
  ],
  themeConfig: {
    // One theme, and it is light — design-system.md doctrine 4. With
    // disableSwitch the inline script hard-codes the mode: no toggle renders,
    // and a stored preference is never read.
    colorMode: { defaultMode: 'light', disableSwitch: true, respectPrefersColorScheme: false },
    navbar: {
      title: 'sports-app',
      items: [{ href: 'https://github.com/gandolh/sports-app', label: 'GitHub', position: 'right' }],
    },
  } satisfies Preset.ThemeConfig,
}

export default config
