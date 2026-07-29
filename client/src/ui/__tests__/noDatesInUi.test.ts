// Runs in the default `node` environment — it only reads source text.
//
// **The mechanical statement of a product invariant**, not a style rule. No date
// appears anywhere in this app: no streak, no heatmap, no missed day, no "3 days
// ago". Returning after two weeks must feel identical to returning after one day,
// because that is when the app most needs to feel easy
// (corpus/wiki/decisions.md). History *does* store `completedAt` — the domain
// needs it and the export file benefits from it — so the invariant cannot be
// enforced by leaving the data out. It is enforced here instead: a timestamp
// enters and leaves through `client/src/persistence/`, and nothing under `client/src/ui/` may
// read one.
//
// It mirrors the eslint rule that keeps `client/src/domain/` off the clock, and it is the
// reason `nowIso()` lives in `client/src/session/useSession.ts` rather than being called
// where it is used.
//
// `__tests__` is excluded, so this file's own literals are not scanned.
const sources = import.meta.glob(['../**/*.ts', '../**/*.tsx', '!../**/__tests__/**'], {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

/**
 * Assembled from fragments rather than written as one literal, so that the list
 * itself could not match if the exclusion above were ever loosened. Each entry is
 * a real way a date has previously been smuggled into a UI layer.
 */
const FORBIDDEN: readonly string[] = [
  'toLocale' + 'DateString',
  'toLocale' + 'TimeString',
  'toLocale' + 'String',
  'Intl.' + 'DateTimeFormat',
  'Intl.' + 'RelativeTimeFormat',
  '.getMonth' + '(',
  '.getDay' + '(',
  '.getFullYear' + '(',
  'new ' + 'Date(',
  'Date.' + 'now(',
  'formatDistance',
  'daysAgo',
]

describe('no dates anywhere in src/ui', () => {
  it('found UI source files to check (guards against an empty or misconfigured glob)', () => {
    const paths = Object.keys(sources)
    expect(paths.length).toBeGreaterThan(10)
    expect(paths.some((path) => path.endsWith('/routes/index.tsx'))).toBe(true)
    expect(paths.some((path) => path.endsWith('/components/Player.tsx'))).toBe(true)
    // The exclusion must not have swallowed the tree it is meant to narrow.
    expect(paths.some((path) => path.includes('__tests__'))).toBe(false)
  })

  for (const [path, source] of Object.entries(sources)) {
    it(`${path} reads no date or clock`, () => {
      const hits = FORBIDDEN.filter((needle) => source.includes(needle))
      expect(hits).toEqual([])
    })
  }
})
