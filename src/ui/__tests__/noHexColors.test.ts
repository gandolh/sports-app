// Runs in the default `node` environment — it only reads source text.
//
// One palette, in one file. `ui/tokens.css` is the only place a colour literal
// may appear; everything else references `var(--…)`. This is what stops a one-off
// `#1a1a1a` in a component from forking the palette — the failure mode is not that
// it looks slightly wrong, it is that the design system stops being the source of
// truth and nobody notices for six months.
//
// Extends the same idea `figures/__tests__/noHexColors.test.ts` applies to the
// drawings, from that directory to the whole of `src/ui/`.
const sources = import.meta.glob(
  ['../**/*.ts', '../**/*.tsx', '../**/*.css', '!../**/__tests__/**', '!../tokens.css'],
  { eager: true, query: '?raw', import: 'default' },
) as Record<string, string>

const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/

describe('no hex colour outside the token file', () => {
  it('found UI sources to check, and excluded exactly one token file', () => {
    const paths = Object.keys(sources)
    expect(paths.length).toBeGreaterThan(10)
    expect(paths.some((path) => path.endsWith('/app.css'))).toBe(true)
    expect(paths.some((path) => path.endsWith('/tokens.css'))).toBe(false)
  })

  for (const [path, source] of Object.entries(sources)) {
    it(`${path} contains no hex colour literal`, () => {
      expect(source).not.toMatch(HEX_COLOR)
    })
  }
})
