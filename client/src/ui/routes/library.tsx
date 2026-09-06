import { Suspense, lazy, useDeferredValue, useMemo, useState } from 'react'
import { Link, createRoute, redirect } from '@tanstack/react-router'
import { rootRoute } from './__root.tsx'
import { Eyebrow, Shell, ShellBody, ShellRail, ShellTitle } from '../components/Shell.tsx'
import { HonestNote } from '../components/HonestNote.tsx'

/**
 * `/library` — a bodyweight exercise reference, and the only page in the app
 * that lists movements it will never ask you to do.
 *
 * ── Why this is not a tab ───────────────────────────────────────────────────
 *
 * It is reached from `/account`, not from the tab bar, and that is the whole
 * design of it. This app's thesis is that it arrives with the answer already
 * made and that **there is nothing to browse on the way to a set**; a fifth tab
 * would make browsing a primary destination and quietly turn the trainer into a
 * catalogue. Account is where everything that is *about* your training rather
 * than *part of* it already lives.
 *
 * ── Why the data is lazily loaded ───────────────────────────────────────────
 *
 * `domain/library.ts` is ~228 KB of content data — a third again the size of the
 * whole app bundle — for a page most sessions never open. A static import would
 * put it in the critical path of the one screen that must paint fast on a phone
 * on a floor. The dynamic import puts it in its own chunk; Workbox precaches
 * `**\/*.js`, so it is still available offline, which is the requirement that
 * actually binds here (`corpus/wiki/architecture.md`).
 *
 * ── The invariant it must not break ─────────────────────────────────────────
 *
 * Nothing here is prescribed, and nothing here may become an input to
 * `prescribe()`. That is asserted structurally in
 * `domain/__tests__/library.test.ts` by import graph, so the guard trips before
 * anyone can write the line that reads it.
 */

const LibraryList = lazy(async () => {
  const { LIBRARY } = await import('../../domain/library.ts')
  return { default: () => <List exercises={LIBRARY} /> }
})

export const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/library',
  beforeLoad: ({ context }) => {
    if (context.username === null) throw redirect({ to: '/login' })
    return { username: context.username }
  },
  component: LibraryRoute,
})

function LibraryRoute() {
  return (
    <Shell>
      <ShellRail
        trailing={
          <Link to="/account" className="text-meta font-semibold text-accent">
            Account
          </Link>
        }
      >
        Reference
      </ShellRail>
      <ShellTitle title="Exercise reference" subtitle="Bodyweight movements, for looking things up" />
      <ShellBody>
        <HonestNote label="What this list is not">
          A reference, not a plan. Nothing here is scheduled, and opening this page changes
          nothing about what you are asked to do next — the programme is still the five
          ladders, on the same fixed clock.
        </HonestNote>

        <Suspense
          fallback={
            <p className="mt-[var(--sp-4)] text-body text-tx2" role="status">
              Loading the reference…
            </p>
          }
        >
          <LibraryList />
        </Suspense>
      </ShellBody>
    </Shell>
  )
}

interface Entry {
  readonly id: string
  readonly name: string
  readonly bodyPart: string
  readonly target: string
  readonly majorMuscle: string | null
  readonly secondaryMuscles: readonly string[]
  readonly steps: readonly string[]
}

/**
 * `useDeferredValue` on the query, not a debounce timer: filtering 325 rows is
 * fast enough that a timer would only add latency, but typing must never block
 * the caret. React keeps the input responsive and renders the stale list until
 * the new one is ready, which is the same behaviour a debounce approximates
 * badly and with a magic number.
 */
function List({ exercises }: { readonly exercises: readonly Entry[] }) {
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)

  const matches = useMemo(() => {
    const needle = deferred.trim().toLowerCase()
    if (needle === '') return exercises
    return exercises.filter(
      (e) =>
        e.name.toLowerCase().includes(needle) ||
        e.target.toLowerCase().includes(needle) ||
        e.bodyPart.toLowerCase().includes(needle) ||
        (e.majorMuscle ?? '').toLowerCase().includes(needle),
    )
  }, [exercises, deferred])

  return (
    <>
      <label className="mt-[var(--sp-5)] block">
        <span className="sr-only">Search the exercise reference</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name, muscle or body part"
          className="min-h-[var(--tap-row)] w-full rounded border border-line2 bg-s1 px-[var(--sp-3)] text-body text-tx placeholder:text-tx3"
        />
      </label>

      <p className="mt-[var(--sp-2)] text-label text-tx3" role="status" aria-live="polite">
        {matches.length === exercises.length
          ? `${exercises.length} bodyweight exercises`
          : `${matches.length} of ${exercises.length}`}
      </p>

      {matches.length === 0 ? (
        <p className="mt-[var(--sp-5)] text-body text-tx2">
          Nothing matches “{deferred.trim()}”. This reference is bodyweight only, so anything
          needing a bar, a bench or a machine is deliberately absent.
        </p>
      ) : (
        <ul className="mt-[var(--sp-3)] grid gap-[var(--sp-2)]">
          {matches.map((exercise) => (
            <Row key={exercise.id} exercise={exercise} />
          ))}
        </ul>
      )}
    </>
  )
}

/**
 * `<details>` rather than a modal or a second route. The steps are the reason to
 * open a row and there is nothing to protect focus from, so the disclosure the
 * platform already ships is the right control — it is keyboard-operable and
 * findable by in-page search without any of it being written here.
 */
function Row({ exercise }: { readonly exercise: Entry }) {
  // Deduplicated, because upstream frequently repeats the major muscle inside
  // the secondary list — "hip flexors · hip flexors · lower back" is what the
  // raw record gives for a 3/4 sit-up. A Set keeps first-seen order, so the
  // major muscle stays first without sorting it there.
  const muscles = [
    ...new Set(
      [exercise.majorMuscle, ...exercise.secondaryMuscles].filter(
        (muscle): muscle is string => muscle !== null && muscle.length > 0,
      ),
    ),
  ]
  return (
    <li>
      <details className="rounded border border-line bg-s1">
        <summary className="flex min-h-[var(--tap-row)] cursor-pointer items-center justify-between gap-[var(--sp-3)] px-[var(--sp-3)] py-[var(--sp-2)]">
          <span>
            <span className="block text-body font-semibold capitalize">{exercise.name}</span>
            <span className="block text-label text-tx3 capitalize">
              {exercise.target} · {exercise.bodyPart}
            </span>
          </span>
        </summary>
        <div className="border-t border-line px-[var(--sp-3)] py-[var(--sp-3)]">
          {muscles.length === 0 ? null : (
            <>
              <Eyebrow>Muscles</Eyebrow>
              <p data-testid="muscles" className="mt-[var(--sp-1)] text-meta text-tx2 capitalize">
                {muscles.join(' · ')}
              </p>
            </>
          )}
          <ol className="mt-[var(--sp-3)] grid gap-[var(--sp-2)]">
            {exercise.steps.map((step, index) => (
              <li
                key={index}
                className="grid grid-cols-[1.3rem_minmax(0,1fr)] gap-[var(--sp-1)] text-meta text-tx2"
              >
                <span className="font-bold text-tx3 tabular-nums">{index + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </details>
    </li>
  )
}
