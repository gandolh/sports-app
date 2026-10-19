import type { SidebarsConfig } from '@docusaurus/plugin-content-docs'

// The same twenty links the Starlight sidebar had, in the same order. Doc items
// are checked at build time, so an entry for a page that does not exist fails
// the build instead of rendering a dead link. Ids are paths under docs/ without
// the extension (docs/wiki/status.md → 'wiki/status').
//
// Every synced corpus page is listed by hand, because the sidebar is curated:
// its own labels and groups. A new wiki page is still built (sync-corpus.mjs
// discovers pages) and reachable by its links; add it here to put it in the
// sidebar.
const sidebars: SidebarsConfig = {
  docs: [
    {
      type: 'category',
      label: 'Start here',
      collapsible: false,
      items: [
        { type: 'doc', id: 'index', label: 'What sports-app is' },
        { type: 'doc', id: 'wiki/overview', label: 'Overview' },
        { type: 'doc', id: 'wiki/architecture', label: 'Architecture' },
      ],
    },
    {
      type: 'category',
      label: 'Reference',
      collapsible: false,
      items: [
        { type: 'doc', id: 'api', label: 'The three routes' },
        { type: 'doc', id: 'state', label: 'State and sync' },
        // TypeDoc's HTML in static/, not a Docusaurus route: `pathname://` makes it
        // a plain link (new tab, baseUrl still applied) instead of a router
        // navigation that would 404.
        { type: 'link', label: 'Wire contract (TypeDoc) ↗', href: 'pathname:///reference/' },
      ],
    },
    {
      type: 'category',
      label: 'The product',
      collapsible: false,
      items: [
        { type: 'doc', id: 'wiki/programme', label: 'The programme' },
        { type: 'doc', id: 'wiki/progression-engine', label: 'The progression engine' },
        { type: 'doc', id: 'wiki/training-science', label: 'Training science' },
        { type: 'doc', id: 'wiki/adherence', label: 'Adherence' },
        { type: 'doc', id: 'wiki/reversals', label: 'Reversals' },
      ],
    },
    {
      type: 'category',
      label: 'Design',
      collapsible: false,
      items: [
        { type: 'doc', id: 'wiki/design-system', label: 'Design system' },
        { type: 'doc', id: 'wiki/design-guardrails', label: 'Guardrails' },
      ],
    },
    {
      type: 'category',
      label: 'Decisions and state',
      collapsible: false,
      items: [
        { type: 'doc', id: 'wiki/decisions', label: 'Decisions' },
        { type: 'doc', id: 'wiki/decisions-identity', label: 'Identity' },
        { type: 'doc', id: 'wiki/technical-decisions', label: 'Technical decisions' },
        { type: 'doc', id: 'wiki/licensing', label: 'Licensing' },
        { type: 'doc', id: 'wiki/open-questions', label: 'Open questions' },
        { type: 'doc', id: 'wiki/status', label: 'Status' },
        { type: 'doc', id: 'wiki/log', label: 'Change log' },
      ],
    },
  ],
}

export default sidebars
