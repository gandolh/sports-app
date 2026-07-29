/**
 * Which username this browser is currently acting as.
 *
 * ── Why this is its own module ───────────────────────────────────────────────
 *
 * v3 made the app multi-user, so almost every other function in the shell needs
 * to know *whose* document it is working on. If each of them read the answer for
 * itself there would be no single place to change when a user logs out mid-save,
 * and `store.ts` in particular would silently pick a subject rather than being
 * told one. So this module is the only thing that answers the question, and
 * `store.ts` takes a username parameter instead of importing it.
 *
 * ── What is stored, and what is not ─────────────────────────────────────────
 *
 * One key, holding one username in plain text. Not a token, not a session id, not
 * a password — there is nothing to store, because there is nothing to verify:
 * the username identifies a state document and the password is discarded in the
 * service's request handler (corpus/wiki/technical-decisions.md, "Authentication
 * is a nameplate, not a boundary"). That is also why "logging in" works offline
 * and why `clearCurrentUsername` is the whole of logging out.
 *
 * It is deliberately *not* in the state document. A document is exported, synced
 * and hand-edited; "which account this browser is showing" is a property of the
 * browser, and putting it inside the document would mean importing somebody
 * else's export silently switched who you were.
 */
import { USERNAME_RULE, isValidUsername } from '@sports-app/shared/username.ts'
import type { StoreOptions } from './store.ts'
import { resolveStorage } from './store.ts'

/**
 * Versioned with the schema generation, like the document keys, so a build that
 * changes what this holds cannot misread what the previous one wrote.
 */
export const SESSION_KEY = 'sports-app.session.v3'

export type SetUsernameResult =
  /** `username` is the stored (trimmed) form — use it, do not re-derive it. */
  | { readonly ok: true; readonly username: string }
  | { readonly ok: false; readonly error: string }

/**
 * Who this browser is acting as, or `null` when nobody is logged in.
 *
 * A stored value that is not a valid username reads as `null` and is left in
 * place: the only consequence is a trip through the login screen, which costs
 * nothing and creates nothing, so there is no repair worth attempting and no
 * warning worth showing. (Contrast `store.load`, which is loud about an
 * unreadable *document* — that one is irreplaceable.)
 */
export function currentUsername(options: StoreOptions = {}): string | null {
  const storage = resolveStorage(options)
  if (!storage) return null
  let text: string | null
  try {
    text = storage.getItem(SESSION_KEY)
  } catch {
    return null
  }
  return isValidUsername(text) ? text : null
}

/**
 * Record who this browser is acting as. Never throws.
 *
 * Surrounding whitespace is trimmed and **nothing else is normalised**. Trimming
 * is safe because a space cannot appear in a valid username, so it can never
 * merge two different accounts; case-folding is *not* safe in that way, which is
 * why `Alice` is rejected rather than quietly turned into `alice` — the same
 * decision the service makes, for the same reason (`server/db.mjs`). A client that
 * folded would let two people believe they had separate accounts while sharing one
 * document.
 */
export function setCurrentUsername(username: string, options: StoreOptions = {}): SetUsernameResult {
  const trimmed = typeof username === 'string' ? username.trim() : ''
  if (!isValidUsername(trimmed)) {
    return { ok: false, error: `That username will not work: expected ${USERNAME_RULE}.` }
  }

  const storage = resolveStorage(options)
  if (!storage) {
    // Not fatal, and not silent either. The app can run for this tab — every
    // other function takes the username as a parameter — but it will be forgotten
    // on reload, which is exactly what `store.load` will also be saying.
    return {
      ok: false,
      error:
        'Browser storage is unavailable, so this browser cannot remember who you are. ' +
        'Private browsing or blocked cookies are the usual cause.',
    }
  }

  try {
    storage.setItem(SESSION_KEY, trimmed)
  } catch (cause) {
    return {
      ok: false,
      error: `Could not remember the username: ${cause instanceof Error ? cause.message : String(cause)}`,
    }
  }
  return { ok: true, username: trimmed }
}

/**
 * Log out. Removes the session key and **nothing else** — every document stays
 * exactly where it is, because logging out is not a request to delete a training
 * history, and the same person will log back in.
 */
export function clearCurrentUsername(options: StoreOptions = {}): void {
  const storage = resolveStorage(options)
  if (!storage) return
  try {
    storage.removeItem(SESSION_KEY)
  } catch {
    // Nothing to do and nothing worth reporting: the caller is on its way to the
    // login screen either way, and the next successful write replaces this value.
  }
}
