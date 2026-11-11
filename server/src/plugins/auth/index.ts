import fp from "fastify-plugin";
import { HEALTH_PATH } from "@sports-app/shared/api.ts";
import { wardAuth } from "../../../vendor/ward/ward-auth.js";
import type { Accounts, WardClient } from "../../../vendor/ward/ward-auth.js";
import type { AuthConfig } from "../../config.ts";
import { requireSupportedUsername } from "./accounts.ts";
import { ALLOW_RENAME, ROUTE_PREFIX } from "./constants.ts";

/**
 * Accounts and "Sign in with Ward", as this service wires them.
 *
 * ── What this folder used to be ──────────────────────────────────────────────
 *
 * ~290 lines of hand-written Ward client: a JWKS-verified access token, an
 * introspection call with an app key, a 30-second cache, fail-closed. All of it
 * is the vendored library's job now (`vendor/ward/`, version in its README), and
 * the library does it from the other side: the app owns its accounts and its
 * sessions, and Ward is a second way in that this service reaches through
 * OpenID Connect. Local sign-in never calls Ward, so the service works while
 * Ward is down. This folder is what is left: the wiring, and the two
 * decisions that are this app's own (`config.ts` reads the settings).
 *
 * ── The two prefixes, and why there are two ──────────────────────────────────
 *
 * Fastify sees `/api/...` in every environment. What differs is what the
 * **browser** sees in front of it: nothing in development (Vite proxies `/api`
 * and strips nothing), `/sports-app-api` behind the deploy's reverse proxy,
 * which strips that and forwards `/api/...`. The session cookie's `Path` and
 * Ward's redirect URI both have to be the browser's view, so both come from
 * configuration and **never** from a literal:
 *
 *   - `ROUTE_PREFIX` — Fastify's own, `/api/auth`, constant.
 *   - `SPORTS_APP_API_PREFIX` — what the browser puts in front of `/api`:
 *     empty by default, `/sports-app-api` in the deploy. The cookie's `Path` is
 *     `${prefix}/api`.
 *   - `WARD_OIDC_REDIRECT_URI` — registered at Ward and set per environment. The
 *     library refuses to start unless its path ends in `/api/auth/ward/callback`
 *     and sits under the cookie's `Path`, so the two cannot drift apart unnoticed.
 *
 * ── Usernames are this app's rule, not the library's ─────────────────────────
 *
 * The snapshot stream is keyed by the signed-in user's username, and
 * `shared/username.ts` says what a username may be: lowercase, at most 32
 * characters. The library accepts far more (Ward's own limit). Since 0.5.0 it
 * has a hook to reshape a name it creates on a first Ward sign-in
 * (`usernameFor`), but this service does not pass one yet. So a person whose
 * Ward name is `Alice` gets a local user the document schema cannot hold. That
 * session is refused with `unsupported_username`, which the login page words,
 * rather than being signed in to an app whose every save would be a 400.
 *
 * The same key is why renaming is off (`ALLOW_RENAME`).
 */

export interface AuthOptions {
  accounts: Accounts;
  auth: AuthConfig;
  wardClient?: WardClient | undefined;
}

/**
 * The accounts, the sessions and the guard. Wrapped in `fastify-plugin` so the guard (an `onRequest`
 * hook) reaches every route, and registered before any route.
 */
export const authPlugin = fp<AuthOptions>(
  async (app, options) => {
    const { accounts, auth, wardClient } = options;

    // ── Accounts, and the guard ───────────────────────────────────────────────
    //
    // **First, before every route and every other plugin.** The guard is an
    // `onRequest` hook on this instance, and Fastify copies hooks into a child
    // context when the child is created, so anything registered earlier would be
    // unguarded. The state routes below live in a child scope for that reason too
    // — see "the body arrives as a string" there.
    //
    // `routePrefix` and `cookiePath` are two views of one address: Fastify sees
    // `/api/auth/...` everywhere, and the browser sees it behind whatever the
    // deploy's proxy strips. `config.ts` explains where each comes from.
    app.register(wardAuth, {
      accounts,
      cookieName: auth.cookieName,
      cookiePath: auth.cookiePath,
      publicOrigin: auth.publicOrigin,
      routePrefix: ROUTE_PREFIX,
      // No `POST /api/auth/username`: a stream is keyed by the username (constants.ts).
      allowRename: ALLOW_RENAME,
      // The one route with no session: liveness needs no credential. `GET` covers
      // `HEAD`, which the route also answers.
      publicRoutes: [`GET ${HEALTH_PATH}`],
      validateSession: requireSupportedUsername,
      ...(wardClient === undefined
        ? {}
        : {
            ward: {
              client: wardClient,
              loginPath: auth.loginPath,
              settingsPath: auth.settingsPath,
              afterSignInPath: auth.afterSignInPath,
            },
          }),
    });
  },
  { name: "auth" },
);
