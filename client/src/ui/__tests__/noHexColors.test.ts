// Runs in the default `node` environment — it only reads source text.
//
// One palette, in one file. `ui/tokens.css` is the only place a colour literal
// may appear; everything else references `var(--…)` or, since brief 26, a
// Tailwind utility that resolves to one. This is what stops a one-off `#1a1a1a`
// in a component from forking the palette — the failure mode is not that it looks
// slightly wrong, it is that the design system stops being the source of truth
// and nobody notices for six months.
//
// **Brief 26 widened the glob from `ui/` to the whole of `src/`.** Adopting
// Tailwind is exactly the moment a colour would escape: the framework's own
// palette (`bg-slate-800`) is one word away, and a `tailwind.config.js` holding
// hexes would sit outside the old glob entirely. The CSS-first `@theme inline`
// shape in `tokens.css` is what keeps this test able to work at all, and widening
// it costs nothing — `src/index.css`, `domain/` and `persistence/` were already
// clean, so the new coverage is a ratchet rather than a migration.
//
// The regex catches Tailwind's arbitrary-value escape hatch (`bg-[#123456]`,
// `text-[#fff]`) for free, because that syntax puts the literal in the source
// text like any other. Worth stating out loud: it is now the single most likely
// way a hex re-enters this codebase, and it is covered by accident of the rule
// being about *text* rather than about CSS grammar.
//
// Extends the same idea `figures/__tests__/noHexColors.test.ts` applies to the
// drawings, from that directory to the whole client source tree.
const sources = import.meta.glob(
  [
    '../../**/*.ts',
    '../../**/*.tsx',
    '../../**/*.css',
    '!../../**/__tests__/**',
    '!../../ui/tokens.css',
  ],
  { eager: true, query: '?raw', import: 'default' },
) as Record<string, string>

const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/

describe('no hex colour outside the token file', () => {
  // The guard that caught this test running vacuously for its whole life: with
  // `css: false` in the Vitest config, every `?raw` CSS import is stubbed to an
  // empty string while the glob still returns the right *keys*, so the loop below
  // greps nothing and passes with flying colours. Counting the sources, confirming
  // the exclusion landed on exactly one file, and checking the values are actually
  // non-empty is what makes that visible.
  //
  // It asserts that *some* `.css` file was found rather than naming `app.css`,
  // because brief 27 deletes that file and a guard that dies with it is no guard.
  it('found UI sources to check, and excluded exactly one token file', () => {
    const paths = Object.keys(sources)
    expect(paths.length).toBeGreaterThan(10)
    expect(paths.filter((path) => path.endsWith('.css')).length).toBeGreaterThan(0)
    expect(paths.filter((path) => path.endsWith('/tokens.css'))).toEqual([])
    expect(Object.values(sources).every((source) => source.length > 0)).toBe(true)
  })

  for (const [path, source] of Object.entries(sources)) {
    it(`${path} contains no hex colour literal`, () => {
      expect(source).not.toMatch(HEX_COLOR)
    })
  }
})
