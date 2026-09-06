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
    // 186 of free-exercise-db's 876: 188 are bodyweight, and two of those
    // (Side_Bridge, Side_Jackknife) ship with no instructions and are dropped.
    // Asserted as a number rather than described, so a re-import that silently
    // loses either filter fails here instead of shipping barbell rows into a
    // zero-equipment app, or rows that open onto nothing.
    expect(LIBRARY.length).toBe(186)
  })

  it('gives every entry a name, a category and at least one instruction', () => {
    for (const exercise of LIBRARY) {
      expect(exercise.name.length).toBeGreaterThan(0)
      expect(exercise.category.length).toBeGreaterThan(0)
      expect(exercise.level.length).toBeGreaterThan(0)
      expect(exercise.instructions.length).toBeGreaterThan(0)
    }
  })

  /**
   * `force` is why this source replaced the previous one, so it is worth an
   * assertion rather than a comment: push / pull / static is the axis the five
   * ladders are built on, and a re-import that dropped it would leave the
   * reference unable to agree with the programme about anything.
   */
  it('keeps force as push, pull, static or nothing at all', () => {
    const seen = new Set(LIBRARY.map((exercise) => exercise.force))
    for (const force of seen) {
      expect(['push', 'pull', 'static', null]).toContain(force)
    }
    // Non-vacuous: all three values really occur.
    expect(seen.has('push')).toBe(true)
    expect(seen.has('pull')).toBe(true)
    expect(seen.has('static')).toBe(true)
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
  /**
   * free-exercise-db DOES ship its images, so this is a choice rather than a
   * repair — which makes it more likely to be undone by a well-meaning
   * re-import than the previous version of this assertion was.
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
