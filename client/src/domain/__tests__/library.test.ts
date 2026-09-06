// Runs in the default `node` environment — content data and source text only.
//
// The library is REFERENCE content, and every assertion here defends one of the
// three things that were true at import time and are easy to lose on a re-run of
// `scripts/import-library.mjs`: it stays bodyweight, it stays image-free, and it
// stays disconnected from the engine.
import { LIBRARY } from '../library.ts'

const sources = import.meta.glob(['../*.ts', '!../library.ts'], {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

describe('the exercise reference library', () => {
  it('imported the bodyweight subset and nothing else', () => {
    // 325 of openGym's 1324. The number is asserted rather than described so a
    // re-import that silently loses the equipment filter fails here rather than
    // shipping barbell rows into a zero-equipment app.
    expect(LIBRARY.length).toBe(325)
  })

  it('gives every entry a name, a target and at least one step', () => {
    for (const exercise of LIBRARY) {
      expect(exercise.name.length).toBeGreaterThan(0)
      expect(exercise.target.length).toBeGreaterThan(0)
      expect(exercise.steps.length).toBeGreaterThan(0)
    }
  })

  it('keeps every id unique, so a re-import can be diffed against this one', () => {
    const ids = new Set(LIBRARY.map((exercise) => exercise.id))
    expect(ids.size).toBe(LIBRARY.length)
  })

  /**
   * openGym's records name `.jpg` and `.gif` assets that its repository does not
   * contain, and no binary was copied here. A reference that resolves to nothing
   * is worse than no reference, so the fields were dropped at import — this is
   * what stops them coming back.
   */
  it('carries no image or animation reference', () => {
    const serialised = JSON.stringify(LIBRARY)
    expect(serialised).not.toMatch(/\.(?:jpg|jpeg|png|gif|webp|svg)\b/i)
    expect(serialised).not.toMatch(/"(?:img|gif|image|thumbnail)"\s*:/i)
  })

  /**
   * THE STRUCTURAL GUARD, and the reason this file reads source text.
   *
   * The governing invariant is that the prescription is a pure function of
   * `sessionsDone` (corpus/CLAUDE.md). `schedule.test.ts` proves logged values
   * cannot change it; this proves the same for reference content, one step
   * earlier — by import graph rather than by behaviour, because the cheapest
   * moment to catch "the library now feeds the engine" is before anyone can
   * write the line that reads it.
   *
   * Content data may import nothing; the engine may not import content it does
   * not prescribe.
   */
  it('is imported by nothing in the domain layer', () => {
    const importers = Object.entries(sources)
      .filter(([, source]) => /from\s+'\.\/library\.ts'/.test(source))
      .map(([path]) => path)
    expect(importers).toEqual([])
  })

  it('found the domain sources it claims to have checked', () => {
    // A grep over files that failed to open is green and worthless — this repo
    // has shipped that bug three times.
    const paths = Object.keys(sources)
    expect(paths.length).toBeGreaterThan(2)
    expect(paths.some((path) => path.endsWith('/schedule.ts'))).toBe(true)
    expect(paths.some((path) => path.endsWith('/library.ts'))).toBe(false)
  })
})
