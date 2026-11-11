import type { DatabaseSync } from "node:sqlite";
import { isValidUsername } from "@sports-app/shared/username.ts";
import { createAccounts, createSqliteStore } from "../../../vendor/ward/ward-auth.js";
import type { ResolvedSession, SessionVerdict } from "../../../vendor/ward/ward-auth.js";
import { UNSUPPORTED_USERNAME } from "./constants.ts";

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
