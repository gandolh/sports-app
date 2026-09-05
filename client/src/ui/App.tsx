import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import type { RouterHistory } from '@tanstack/react-router'
import { rootRoute } from './routes/__root.tsx'
import { indexRoute } from './routes/index.tsx'
import { planRoute } from './routes/plan.tsx'
import { progressRoute } from './routes/progress.tsx'
import { accountRoute } from './routes/account.tsx'
import { loginRoute } from './routes/login.tsx'

/**
 * Router and query wiring, and nothing else. Every screen owns its own layout —
 * see `routes/__root.tsx` for why there is no shell component.
 *
 * ── Code-based routes, not file-based ───────────────────────────────────────
 *
 * TanStack Router's file-based mode needs a Vite plugin and a generated
 * `routeTree.gen.ts` in the repo. Five routes do not justify a codegen step, a
 * generated file in review diffs, or a build plugin that has to agree with this
 * project's explicit `.ts`/`.tsx` import extensions. The tree below is the whole
 * thing and it is readable in one screen.
 *
 * ── Why the router and the query client are factories ───────────────────────
 *
 * `createAppRouter` takes a history so tests can drive a memory history and assert
 * on real URLs — which is how "a reload mid-session resumes on the same exercise"
 * is tested, rather than by poking at component state. And a query client per test
 * is what stops one test's cached document from leaking into the next.
 */

const routeTree = rootRoute.addChildren([
  indexRoute,
  planRoute,
  progressRoute,
  accountRoute,
  loginRoute,
])

/**
 * The sub-path the app is served from, without its trailing slash, or `undefined`
 * at the domain root.
 *
 * `import.meta.env.BASE_URL` is Vite's echo of `base` in `vite.config.ts`, so
 * this cannot drift from the asset URLs or the service-worker scope. It is
 * `'/'` in dev and in every test, which normalises to `undefined` — the router
 * then behaves exactly as it did before this existed.
 *
 * Without it the router at `https://gandolh.ro/sports-app/` reads its own
 * location as `/sports-app/`, matches no route, and renders the 404 on every
 * screen while the assets around it load perfectly.
 */
const basepath = import.meta.env.BASE_URL.replace(/\/+$/, '') || undefined

export function createAppRouter(history?: RouterHistory) {
  return createRouter({
    routeTree,
    ...(basepath === undefined ? {} : { basepath }),
    ...(history === undefined ? {} : { history }),
    // Nothing to preload: every route reads the same synchronous local document,
    // so a preload would be work with no latency to hide.
    defaultPreload: false,
  })
}

export const router = createAppRouter()

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

/**
 * Every read in this app is a synchronous `localStorage` read, so retries,
 * refetch-on-focus and staleness are all answers to problems that do not exist
 * here. Turning them off is not tuning — a refetch would re-run `store.load`,
 * which is harmless but would make the query devtools imply the app is talking to
 * something.
 */
export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        gcTime: Infinity,
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
      mutations: { retry: false },
    },
  })
}

export function AppRoot({
  router: appRouter,
  queryClient,
}: {
  readonly router: ReturnType<typeof createAppRouter>
  readonly queryClient: QueryClient
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={appRouter} />
    </QueryClientProvider>
  )
}

const queryClient = createAppQueryClient()

export function App() {
  return <AppRoot router={router} queryClient={queryClient} />
}
