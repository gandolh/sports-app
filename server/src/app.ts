import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import type { SnapshotStore } from "./db/store.ts";
import { DEFAULT_MAX_BODY_BYTES } from "./config.ts";
import type { AuthConfig } from "./config.ts";
import type { Log } from "./lib/http.ts";
import type { Accounts, WardClient } from "../vendor/ward/ward-auth.js";
import { errorsPlugin } from "./plugins/errors.ts";
import { headersPlugin } from "./plugins/headers.ts";
import { authPlugin } from "./plugins/auth/index.ts";
import { healthRoutes } from "./features/health/index.ts";
import { stateRoutes } from "./features/state/index.ts";

/**
 * The state service: three routes, one table, and Fastify underneath.
 *
 * ── What this is not ─────────────────────────────────────────────────────────
 *
 * Not a backend in the usual sense. There is no ORM, no migration runner of its
 * own, and no route that returns anything other than the one JSON document the app
 * already produces. A person's username names a stream of snapshots; "conflict
 * resolution" is a comparison of two integers, done on the client. The one thing
 * it does hold beyond that is accounts, and those are the vendored library's
 * (`vendor/ward/`), kept in `auth_*` tables of the same database file.
 *
 * ── The routes ───────────────────────────────────────────────────────────────
 *
 *   GET  /api/health      liveness. No auth, no database read, no information.
 *   GET  /api/state       the caller's newest snapshot bytes, or 404.
 *   PUT  /api/state       validate shallowly, store verbatim, prune to the cap.
 *   ...  /api/auth/...    the library's: login, logout, session, password, and
 *                         "Sign in with Ward" (see `vendor/ward/README.md`).
 *
 * Anything else is a 404. No static files, no directory listing, no fallback
 * handler — a service whose only job is to hold documents has no business
 * serving anything else, and every route that does not exist is a route that
 * cannot be wrong.
 *
 * ── Who the caller is: the signed-in account ─────────────────────────────────
 *
 * The app owns its accounts. `wardAuth` (the vendored library's Fastify plugin)
 * is registered first and guards **every** route but the allowlist: a request
 * needs a live session in the `sports_app_session` cookie, which the library
 * set after a local sign-in or after "Sign in with Ward". The signed-in user's
 * **username is the stream key**. Nothing on the request names whose document
 * is wanted — a `?user=` is ignored — so a caller can read and write only their
 * own history.
 *
 * No session is a `401` with no hint at what exists. A session that began with
 * Ward is checked against Ward at most every 30 seconds, and while Ward cannot
 * answer it is a `401` whose `reason` is `ward_unavailable`; a local session is
 * never checked and keeps working. See `plugins/auth/` for the prefixes and for the
 * one rule that is this app's own (a username has to fit the document schema).
 *
 * ── Fastify, and what the framework is NOT allowed to do ──────────
 *
 * The Fastify move replaced hand-rolled `node:http` routing with Fastify without
 * changing the REST contract, and the tests beside the code are written against
 * the wire, not the implementation. Five things a framework does helpfully by
 * default and must not do here, each load-bearing and each pinned by a test:
 *
 *   1. **`GET /api/state` returns the stored bytes verbatim.** Fastify will parse
 *      and re-serialise JSON for you, which would destroy the codec's layout while
 *      still being "valid JSON". So, **inside the state routes' own scope**, the JSON body parser is replaced
 *      with one that hands the handler the **raw string** (`parseAs: 'string'`, no `JSON.parse`),
 *      the stored document goes out as a `Buffer`, and there is deliberately no
 *      `response` schema on that route's 200 — a serialiser attached to it would
 *      rewrite the very bytes it exists to preserve. The client's crash-safe save
 *      round-trips through a byte comparison, so this is not cosmetic. The scope
 *      matters: the library's `/api/auth/*` routes need Fastify's ordinary parsed
 *      JSON, so the raw parser must not be instance-wide.
 *   2. **The session is checked before any validation.** The library's guard is
 *      an app-wide `onRequest` hook, the earliest point in Fastify's lifecycle —
 *      ahead of body parsing and schema validation. A caller without a session
 *      gets a 401 and never a 400 that would say anything about the document, and
 *      the same 401 for a path that does not exist, so an unauthorised caller
 *      cannot tell a 405 on `/api/state` from a 404.
 *   3. **A document whose `username` is not the session's username is a `400`,
 *      not a `409`,** and stores nothing. It refuses a write into somebody
 *      else's stream as well as a confused client.
 *   4. **Usernames are rejected, never case-folded.** Folding would make the
 *      stream key disagree with the document's own `username`, which is exactly
 *      what (3) refuses. The rule lives in `shared/username.ts` and says why.
 *   5. **Paths match exactly.** `ignoreTrailingSlash` stays off and
 *      `exposeHeadRoutes` is switched **off** — otherwise Fastify would helpfully
 *      add `HEAD /api/state`, which is a `405`.
 *
 * And one more, the loudest: **Fastify logs requests by default.** `logger: false`
 * turns the framework's logging off completely, so there is no logger for a request
 * body to reach even in principle. The only log in this process is the `log`
 * callback below, which is called with fixed strings the caller composes.
 *
 * ── Validation is schema-driven, from `shared/api.ts` ────────────────────────
 *
 * The wire shapes are TypeBox declarations in `@sports-app/shared/api.ts`, so the
 * same declaration that guards this service also types the client. Fastify's AJV
 * reads them for response serialisation; the `PUT` body is checked here with
 * `TypeCompiler`, because it must stay a raw string (see 1 above) and a body
 * schema would require Fastify to have parsed it first. One declaration, two
 * entry points into it — not two declarations.
 *
 * ── Why validation here is deliberately shallow ──────────────────────────────
 *
 * The server checks that the body is a JSON object with a numeric
 * `schemaVersion`, a valid `username`, and an array `history`. That is all, and
 * `StateDocumentEnvelope` in `shared/api.ts` says so in three lines.
 *
 * It is tempting to re-implement the codec's validation here as a second line of
 * defence. That would be a mistake: `client/src/persistence/codec.ts` is the single
 * source of truth for the document's shape, and a second, drifting validator
 * would eventually reject a document the app considers perfectly good — turning
 * this service from a safety net into a way to *lose* a workout. It would also
 * reject a document from a future `schemaVersion` this build has never heard of,
 * which the service is supposed to store blindly. The three fields it does check
 * are exactly the three the service itself needs: `schemaVersion` for the indexed
 * column, `username` because it must match the stream key, and `history` because
 * its length is what the `sessions_completed` column holds now that the v3
 * document no longer carries a `sessionsCompleted` field.
 *
 * A 400 leaves the database completely untouched. The newest snapshot after a
 * rejected `PUT` is byte-for-byte the newest snapshot from before it.
 *
 * ── Configuration ────────────────────────────────────────────────────────────
 *
 * Accounts need an origin and a prefix, and "Sign in with Ward" needs the five
 * `WARD_OIDC_*` values; `config.ts` reads them, says what each is, and explains why
 * the cookie's `Path` and Ward's redirect URI both come from configuration rather
 * than from a literal. With no `WARD_OIDC_ISSUER` the service runs with local
 * accounts only and the sign-in page offers no Ward button. **No key is committed
 * anywhere in this repository.**
 *
 * ── Binding ──────────────────────────────────────────────────────────────────
 *
 * `127.0.0.1` by default, so running it cannot accidentally expose anyone's
 * training history to a network. Host and port are environment variables.
 */

/** The process's own options for the server underneath: the timeouts, which `server.ts` sets. */
export interface AppOptions {
  connectionTimeout?: number;
  requestTimeout?: number;
  keepAliveTimeout?: number;
}

export interface AppDeps {
  store: SnapshotStore;
  accounts: Accounts;
  auth: AuthConfig;
  wardClient?: WardClient | undefined;
  maxBodyBytes?: number;
  log?: Log;
}

/**
 * The whole service, built and never listening: the plugins in a fixed order, then the features.
 * Every dependency arrives in `deps`, so a test passes its own store and its own accounts.
 */
export function buildApp(deps: AppDeps, options: AppOptions = {}): FastifyInstance {
  const { store, accounts, auth, wardClient } = deps;
  const maxBodyBytes = deps.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const log = deps.log ?? (() => {});

  if (accounts === undefined || auth === undefined) {
    // Refusing here rather than defaulting is the point, and it is the same
    // point the shared secret used to make: a service with no way to identify
    // its callers looks authenticated and is not.
    throw new Error("createStateServer requires accounts and an auth config");
  }

  const app = Fastify({
    // The whole of the framework's logging, off. Not "configured to omit bodies" —
    // absent, so there is no logger a body could reach through a future option
    // change. The `log` callback above is the only output this process produces and
    // it is only ever handed fixed strings.
    logger: false,
    // Fastify would otherwise synthesise `HEAD` for every `GET` route, which would
    // turn today's `HEAD /api/state` 405 into a 200 with the document's headers.
    exposeHeadRoutes: false,
    bodyLimit: maxBodyBytes,
    ...options,
  });

  // The error handler first, so every scope created below inherits it, then the headers, then the
  // guard: **before every route**, because Fastify copies hooks into a child context when the child
  // is created, and a route registered earlier would be unguarded.
  app.register(errorsPlugin, { maxBodyBytes, log });
  app.register(headersPlugin);
  app.register(authPlugin, { accounts, auth, wardClient });

  app.register(healthRoutes);
  app.register(stateRoutes, { store, maxBodyBytes, log });

  return app;
}
