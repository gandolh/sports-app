import type { DatabaseSync } from "node:sqlite";
import { isValidUsername, USERNAME_RULE } from "@sports-app/shared/username.ts";
import { createAccounts, createSqliteStore, createWardClient, createWardIdentities } from "../vendor/ward/ward-auth.js";
import { DEFAULT_ROLE, UNSUPPORTED_USERNAME } from "./plugins/auth/constants.ts";
import type { AuthConfig } from "./config.ts";
import type { Accounts, ResolvedSession, SessionVerdict, WardClient } from "../vendor/ward/ward-auth.js";

/**
 * Accounts and "Sign in with Ward", as this service wires them.
 *
 * ── What this file used to be ────────────────────────────────────────────────
 *
 * ~290 lines of hand-written Ward client: a JWKS-verified access token, an
 * introspection call with an app key, a 30-second cache, fail-closed. All of it
 * is the vendored library's job now (`vendor/ward/`, version in its README), and
 * the library does it from the other side: the app owns its accounts and its
 * sessions, and Ward is a second way in that this service reaches through
 * OpenID Connect. Local sign-in never calls Ward, so the service works while
 * Ward is down. This file is what is left: the configuration, and the two
 * decisions that are this app's own.
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

/** What the stream-linking helpers need from the snapshot store: the stream keys it holds. */
interface StreamKeys {
  usernames(): string[];
}

/**
 * Open the accounts on the snapshot store's own handle.
 *
 * `createSqliteStore` applies the library's migrations to the same database
 * file, in its own `auth_*` tables. It can run before or after anything else
 * here, because the two never touch each other's tables.
 */
export function openAccounts(db: DatabaseSync) {
  return createAccounts({ store: createSqliteStore(db) });
}

/** A Ward subject: 128 random bits, hex. What the stream key was between 2026-09-06 and accounts. */
const WARD_SUBJECT = /^[0-9a-f]{32}$/;

/**
 * Give every stream keyed by a Ward subject an account that Ward can find.
 *
 * From 2026-09-06 until accounts existed, the stream key was the session's Ward
 * **subject**, so a person who synced then has a stream named `3f9a…` (32 hex).
 * After the move their first "Sign in with Ward" would create a local `alice` with
 * an empty stream, and their history would sit under a name nobody can type. So for
 * each such key this creates a local user whose username *is* the key, linked to
 * that subject, and the next Ward sign-in finds it. No row is rewritten and no name
 * is matched: the key is the subject, which is the one thing the app knew.
 *
 * Idempotent (`findUserBySubject` first), and a key that already has a user, by id
 * or by username, is skipped even with no link, so a person who unlinked Ward is
 * never re-linked and a boot never trips on `UserIdTakenError`. One transaction per
 * user, and it needs no
 * Ward client — linking a subject does not call Ward. The honest cost: that
 * person's name is the hex string until it is renamed by hand, because renaming is
 * off here (`ALLOW_RENAME`) and a snapshot stream cannot be moved without rewriting
 * the documents inside it.
 *
 * Streams that are not a subject (`local`, a name typed before Ward) are left to
 * `orphanStreamNames` and the seed.
 *
 * Returns the subjects linked by this call.
 */
export async function linkWardStreams(store: StreamKeys, accounts: Accounts): Promise<string[]> {
  const identities = createWardIdentities({ accounts });
  const linked: string[] = [];
  for (const key of store.usernames()) {
    if (!WARD_SUBJECT.test(key)) continue;
    if ((await identities.findUserBySubject(key)) !== undefined) continue;
    // A user already owns this key, id or name, but has no Ward link: a migrated
    // user who unlinked Ward. Re-linking them is not ours to do (createLinkedUser
    // would throw, and the service would never start). Same rule as atrium.
    if ((await accounts.findUserById(key)) !== undefined) continue;
    if ((await accounts.findUserByUsername(key)) !== undefined) continue;
    await identities.createLinkedUser({
      subject: key,
      id: key,
      username: key,
      role: DEFAULT_ROLE,
    });
    linked.push(key);
  }
  return linked;
}

/**
 * Name the snapshot streams that no account owns.
 *
 * This is the data-migration seam, and it only reports. Snapshots are keyed by
 * username, and a stream written before the Ward cutover is keyed by whatever
 * name its owner typed then. It is read again the moment an account with that
 * exact username exists (`npm run seed`, then "Link Ward" in settings). A stream
 * whose key matches no account is not lost, only unreachable until then, so the
 * list is worth a line at startup rather than a warning.
 */
export async function orphanStreamNames(store: StreamKeys, accounts: Accounts): Promise<string[]> {
  const orphans: string[] = [];
  for (const username of store.usernames()) {
    if ((await accounts.findUserByUsername(username)) === undefined) orphans.push(username);
  }
  return orphans;
}

/**
 * The Ward client, or `undefined` when `WARD_OIDC_ISSUER` is not set and the
 * service runs with local accounts only.
 *
 * `createWardClient` checks the values and imports the key now, so a bad key
 * fails at startup. It does **not** contact Ward: discovery is lazy, so the
 * service starts while Ward is down.
 */
export async function openWardClient(
  config: AuthConfig,
  overrides: { fetch?: typeof fetch } = {},
): Promise<WardClient | undefined> {
  if (config.wardOptions === undefined) return undefined;
  return createWardClient({ ...config.wardOptions, ...overrides });
}

/**
 * The app's own session check, after the library's Ward one.
 *
 * It does no I/O and answers for every session, local or Ward: whichever way a
 * person got in, their username is a stream key, so it has to be one the
 * document schema accepts. Refused without ending the session, so the answer
 * stays visible (`reason` on `GET /api/auth/session`) instead of looping the
 * person through a sign-in that succeeds and is then silently discarded.
 */
export function requireSupportedUsername(resolved: ResolvedSession): SessionVerdict {
  if (isValidUsername(resolved.user.username)) return { ok: true };
  return { ok: false, reason: UNSUPPORTED_USERNAME };
}

/** For the seed script, which has to say the same thing before it creates anyone. */
export { USERNAME_RULE };
