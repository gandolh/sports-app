import { createWardIdentities } from "../../../vendor/ward/ward-auth.js";
import type { Accounts } from "../../../vendor/ward/ward-auth.js";
import { DEFAULT_ROLE } from "./constants.ts";

/** What the stream-linking helpers need from the snapshot store: the stream keys it holds. */
interface StreamKeys {
  usernames(): string[];
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
