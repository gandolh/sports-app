/**
 * Where a sign-in goes on to: the `next` search param of `/login`.
 *
 * A signed-out visit to `/plan` is sent to `/login?next=/plan`, and once the
 * session says signed in `/login` goes on to `/plan` instead of `/`. The Ward
 * button hands Ward a return to `<base>login?next=/plan`, so the round trip also
 * comes back through `/login`: that page stays the one place that writes the
 * cached username, which is what ends the sign-in loop (see `login.tsx`).
 *
 * `next` is a path inside the router, without the base path the app is served
 * from. Under a base path the router has already taken the base off
 * `location.pathname` by the time a guard reads it, and puts it back on when it
 * navigates, so nothing here knows the base. Only the Ward return, which is a path
 * on the origin, adds it (`wardReturnTo`).
 */
import { redirect } from '@tanstack/react-router'

/**
 * What `/login` keeps of its search: a `next` only when it is safe to go to.
 * `undefined` is allowed as well as absent because `validateLoginSearch` sets it
 * explicitly; see there.
 */
export interface LoginSearch {
  readonly next?: string | undefined
}

/**
 * The redirect a route guard throws for somebody with no cached username. `next`
 * is left off for `/`, so a plain visit still shows a clean `/login`.
 */
export function toLogin(location: { readonly pathname: string }) {
  const search: LoginSearch = location.pathname === '/' ? {} : { next: location.pathname }
  return redirect({ to: '/login', search })
}

/**
 * A path inside this app, or `null`: one leading `/` and no `//` anywhere (which a
 * browser reads as another host), no backslash (which some read as a slash), no
 * control characters, no query or fragment, and not `/login` itself, which would
 * only bring the person back here. A value that starts with a single `/` cannot
 * carry a scheme, so `https://evil.example` fails the first rule.
 *
 * The same rules as the vendored library's `isLocalPath`, which the service
 * applies to the Ward return, plus the last three.
 */
export function appPath(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (value.length === 0 || value.length > 512) return null
  if (!value.startsWith('/') || value.includes('//') || value.includes('\\')) return null
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return null
  if (value.includes('?') || value.includes('#')) return null
  if (value === '/login' || value === '/login/') return null
  return value
}

/**
 * `/login`'s `validateSearch`. An unsafe `next` is dropped, not an error: the
 * page still renders and a sign-in lands on `/`.
 *
 * The key is always set, to `undefined` when the value is unsafe. The router
 * hands a route its validated search spread **over** the raw one from the address
 * bar, so returning `{}` would leave the raw `next` in place for `useSearch()` to
 * read, unchecked. `signin.test.tsx` signs in past four bad values to pin this.
 */
export function validateLoginSearch(raw: Record<string, unknown>): LoginSearch {
  return { next: appPath(raw['next']) ?? undefined }
}

/**
 * The Ward return for a sign-in that should go on to `next`: `/login` on the
 * origin, under the base path the app is served from, carrying `next` along.
 * `import.meta.env.BASE_URL` is the same base `server/ward.mjs` builds
 * `afterSignInPath` from, so this is that page with one search param more.
 */
export function wardReturnTo(next: string): string {
  return `${import.meta.env.BASE_URL}login?next=${encodeURIComponent(next)}`
}
