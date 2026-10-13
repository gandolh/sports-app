import { configureAuth } from '../../vendor/ward/ward-auth-react.js'

/**
 * Where the sign-in routes are, as the **browser** reaches them.
 *
 * The state service lives at `<prefix>/api`: the prefix is empty in development,
 * where the dev server proxies `/api`, and `/sports-app-api` in the deploy, where
 * a reverse proxy strips it. The session cookie is scoped to that same path, so
 * this has to be the one value the service was configured with —
 * `SPORTS_APP_API_PREFIX` — and `vite.config.ts` bakes it in as a constant.
 *
 * **Not `settings.sync.baseUrl`.** That address is typed per browser, lives in the
 * saved document, and is meant for a service on another origin; signing in has to
 * work before any document exists and always talks to the origin that served the
 * app, because the cookie is `SameSite=Lax` and rides no further.
 */
export const API_PREFIX: string = __SPORTS_APP_API_PREFIX__

export const AUTH_BASE_PATH = `${API_PREFIX}/api/auth`

/**
 * Point the vendored hooks at the service. Called once, at module load of the
 * app, **before the router reads the address bar**: after a Ward round trip the
 * library takes `?ward_error=` out of the URL here, once, and the page's
 * `useWardSignIn().error` starts as it.
 *
 * Tests call `configureAuth` themselves with a fake `fetch`, which replaces this.
 */
export function configureSessionAuth(): void {
  configureAuth({ basePath: AUTH_BASE_PATH })
}
