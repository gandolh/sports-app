import { Link, Outlet, createRootRoute } from '@tanstack/react-router'
import { currentUsername } from '../../persistence/session.ts'
import { Shell, ShellBody, ShellRail, ShellTitle } from '../components/Shell.tsx'

/**
 * The root route. It does two things and deliberately renders no chrome of its
 * own.
 *
 * **No shared header, no shared nav, no layout.** Each of the five screens owns
 * its own rail, because the rail's contents are different on every one of them
 * and a shared shell would mean five conditionals inside one component instead of
 * one honest strip inside each. `Shell`/`ShellRail`/`ShellFooter` in
 * `../components/Shell.tsx` is the shared part; it is a set of components rather
 * than a layout route, so a screen that needs to break the band structure can.
 *
 * The one thing it does own is **who this browser is acting as**, resolved once
 * per navigation and handed down as route context. `currentUsername` reads one
 * key of `localStorage` and returns `null` for anything it does not recognise, so
 * this cannot fail; the worst case is a trip through `/login`, which creates
 * nothing.
 */
export const rootRoute = createRootRoute({
  beforeLoad: () => ({ username: currentUsername() }),
  component: () => <Outlet />,
  /**
   * Five routes, one of which is the app, so there is nothing here worth a
   * designed 404 — one sentence and the way back. No `<TabBar>`: an address that
   * matched no route is not one of the four destinations either.
   */
  notFoundComponent: () => (
    <Shell>
      <ShellRail>Not found</ShellRail>
      <ShellTitle title="There is no page at that address." size="movement" />
      <ShellBody>
        <p className="text-body text-tx2">
          <Link to="/" className="text-accent underline">
            Go to today&rsquo;s session.
          </Link>
        </p>
      </ShellBody>
    </Shell>
  ),
})
