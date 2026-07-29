// Runs in the default `node` environment — no DOM needed, this just reads
// source text. A hardcoded hex colour in any figure or overlay breaks dark
// mode (the whole app inverts via `currentColor`/`var(--accent)`, never a
// literal value), so this is a build-breaking check, not a style nit.
//
// Uses Vite's `import.meta.glob` raw-string import rather than `node:fs` so
// this test needs no `@types/node` addition to the shared tsconfig.
const sources = import.meta.glob(['../*.ts', '../*.tsx'], {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/

describe('figure sources never hardcode a colour', () => {
  it('found figure source files to check (guards against an empty/misconfigured glob)', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(0)
    expect(Object.keys(sources).some((path) => path.endsWith('/index.ts'))).toBe(true)
  })

  for (const [path, source] of Object.entries(sources)) {
    it(`${path} contains no hex colour literal`, () => {
      expect(source).not.toMatch(HEX_COLOR)
    })
  }
})
