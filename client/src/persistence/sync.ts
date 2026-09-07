/**
 * Sync: the state document over HTTP, against the service in `server/`.
 *
 * ── This module may never break a workout ────────────────────────────────────
 *
 * Nothing on the session-critical path may require network
 * (corpus/wiki/architecture.md § "Offline posture"). `push` is the function that
 * runs right after a session is saved, and it is written so that *every*
 * outcome — offline, DNS failure, 500, wrong secret, a captive-portal login page
 * where JSON was expected — returns a value rather than throwing. It never
 * rejects, so `void push(doc)` cannot produce an unhandled rejection, and it is
 * called *after* `store.save` has already succeeded, so a failure here costs
 * nothing but a log line. The same is true of `login`, which is why a wrong
 * secret cannot lock anybody out of their own offline history.
 *
 * ── The username travels in the URL, the secret in a header ──────────────────
 *
 * `/api/state` is keyed by `?user=<username>` on **both** `GET` and `PUT`
 * (`server/state-server.mjs`), and a `PUT` whose body disagrees with `?user=` is
 * refused with a 400. This module fills both from the *same* place — the
 * document's own `username` on push, the caller's requested username on pull — so
 * that mismatch is unreachable from this client rather than merely unlikely.
 *
 * The secret goes in `x-sync-secret`, never in the URL: a URL ends up in proxy
 * logs, browser history, and referrers.
 *
 * ── `navigator.onLine` is not consulted. Anywhere. ───────────────────────────
 *
 * Brief 01 observed it reporting `true` while the network was demonstrably
 * offline — which is exactly the documented behaviour: `false` is reliable,
 * `true` only means "there is a network interface", not "the internet is
 * reachable". Gating on it would have skipped a push that would have worked. So
 * the request is always attempted and the failure is caught. There is a test
 * asserting the property is never read.
 *
 * ── `push` is gated on `isReadOnly(username)` ────────────────────────────────
 *
 * The store goes read-only for a user when their locally stored document could
 * not be parsed. In that state the app is holding something it does not
 * understand, and uploading it would put a document the app never validated into
 * the one place that is meant to be a safe copy — overwriting the last good
 * snapshot with it. A read-only app does not push. The latch is per username, so
 * one person's broken file does not stop another's sync.
 *
 * ── Conflicts prompt; they never silently resolve ────────────────────────────
 *
 * Comparison is on `history.length`, which is also what the service records as
 * `sessions_completed` and hands back in a `PUT` receipt (`server/README.md`).
 * v2 compared `sessionsCompleted`, a counter that never reset; v3 deleted it
 * because it was derivable, and the honest replacement is the length of the list.
 * The cost is that a history pruned by hand looks *behind* — and that is the safe
 * direction: it produces a prompt, never a silent overwrite. Comparing
 * `cyclePosition` instead would be monotonic, but it would disagree with the
 * number the service reports, and two answers to "how many sessions" is worse
 * than one answer that a hand-edit can lower.
 *
 *   - **Local ahead, or equal** → last-write-wins is *correct*, not lazy. A
 *     stream belongs to one person training on one device at a time, so the remote
 *     holds a prefix of what this device has and overwriting it discards nothing.
 *   - **Remote ahead** → stop. The remote holds sessions this device has never
 *     seen, which means training happened on another device. Pushing would bury
 *     them; pulling might discard local ones. `checkSync` returns both numbers
 *     and **writes nothing in either direction** — the UI shows them and the
 *     user chooses. Discarding sessions someone knows they did is the one
 *     unacceptable outcome, and it is not a decision this module gets to make.
 *
 * A pulled document is written through `store.save`, never straight to storage,
 * so it gets the same verify-before-promote treatment as any local save. And
 * replacing a *corrupt* local document requires `allowOverwriteCorrupt: true`,
 * exactly like import — the corrupt text may be the only copy of something
 * hand-repairable.
 */
import type { StateDoc, SyncSettings } from '@sports-app/shared/types.ts'
import { parse, serialise } from './codec.ts'
import type { SaveResult, StoreOptions } from './store.ts'
import { isReadOnly, save } from './store.ts'

// ─── Wire contract (mirrors server/state-server.mjs) ────────────────────────

export const STATE_PATH = '/api/state'
export const HEALTH_PATH = '/api/health'

/**
 * Ward's login page, for the one thing this client can do about a 401.
 *
 * A path, never an absolute URL: Ward validates `next` against the estate's own
 * path roots and refuses anything absolute.
 */
export const WARD_LOGIN_PATH = '/ward/login'

/**
 * Long enough for a slow phone on a slow connection, short enough that a
 * black-holed TCP connection does not leave a promise pending for minutes. A
 * push that times out is simply retried by the next completed session; there is
 * no queue and no timer, on purpose.
 */
export const DEFAULT_TIMEOUT_MS = 10_000

export interface SyncOptions {
  /** Injected in tests. Defaults to the global `fetch`. */
  readonly fetchImpl?: typeof fetch | undefined
  readonly timeoutMs?: number | undefined
  /** Injected in tests. Defaults to `console.warn`. */
  readonly log?: ((message: string, cause?: unknown) => void) | undefined
}

/**
 * `settings.sync.baseUrl` may legitimately be empty — that is the same-origin
 * case, which is how the Vite dev proxy and a co-hosted service both work.
 * Trailing slashes are stripped so `http://host:8787/` and `http://host:8787`
 * behave identically.
 */
export function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.trim().replace(/\/+$/, '')}${path}`
}

/**
 * `/api/state`. It names no user, and that absence is the change.
 *
 * The username used to travel here as `?user=`, because the service had no way
 * to know who was calling — one shared secret authenticated the installation
 * and the query parameter chose the stream. The service reads the **session's**
 * subject now, so there is nothing to name and nothing to percent-encode: a
 * caller reads their own stream because it is the only one they can reach.
 *
 * The parameter is not sent at all rather than sent and ignored. Sending it
 * would suggest it still selected something.
 */
export function stateEndpoint(baseUrl: string): string {
  return endpoint(baseUrl, STATE_PATH)
}

// ─── push ───────────────────────────────────────────────────────────────────

export type PushFailure =
  /** `settings.sync` is null. Not an error — sync is optional. */
  | 'not-configured'
  /** The local document could not be parsed, so it must not be uploaded. */
  | 'read-only'
  /** `serialise` threw. Should be impossible; a silent skip would not be. */
  | 'serialise-failed'
  /** Request never completed: offline, DNS, timeout, TLS, CORS. */
  | 'network'
  /** The service answered, and said no. */
  | 'rejected'

export type PushOutcome =
  | { readonly ok: true; readonly status: number; readonly bytes: number }
  | { readonly ok: false; readonly reason: PushFailure; readonly error: string }

/**
 * Upload the document. Fire-and-forget: never throws, never rejects.
 *
 * One push per completed session is the entire cadence — no polling, no timers,
 * no background sync, no retry queue. A dropped push is picked up by the next
 * session, and the export file is the real backup either way.
 *
 * The subject is `doc.username`, for both `?user=` and the body, so the two
 * cannot disagree. Callers on the session path should write `void push(doc)` and
 * move on.
 */
export async function push(doc: StateDoc, options: SyncOptions = {}): Promise<PushOutcome> {
  const log = options.log ?? warn
  const target = doc.settings.sync

  if (target === null) {
    // Silent: an unconfigured optional feature is not a failure to report.
    return { ok: false, reason: 'not-configured', error: 'Sync is not configured.' }
  }

  if (isReadOnly(doc.username)) {
    log(
      'Sync push skipped: the app is read-only because the stored document could not be read. ' +
        'Refusing to upload a document that was never validated.',
    )
    return {
      ok: false,
      reason: 'read-only',
      error:
        'The app is read-only because the saved document could not be read, so nothing was uploaded.',
    }
  }

  let text: string
  try {
    text = serialise(doc)
  } catch (cause) {
    log('Sync push skipped: the document could not be serialised.', cause)
    return { ok: false, reason: 'serialise-failed', error: messageOf(cause) }
  }

  let response: Response
  try {
    // No onLine check. See the header.
    response = await send(target, stateEndpoint(target.baseUrl), options, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: text,
    })
  } catch (cause) {
    // The session is already saved locally. This is a log line, not an error
    // the user has to acknowledge.
    log('Sync push failed; the session is saved locally and will sync later.', cause)
    return { ok: false, reason: 'network', error: messageOf(cause) }
  }

  if (!response.ok) {
    log(`Sync push refused by the service with status ${response.status}.`)
    return {
      ok: false,
      reason: 'rejected',
      error: describeStatus(response.status),
    }
  }

  return { ok: true, status: response.status, bytes: text.length }
}

// ─── pull ───────────────────────────────────────────────────────────────────

export type PullFailure =
  /** This user has no snapshot on the service. The new-device case. */
  | 'empty'
  /** Wrong or missing secret. */
  | 'unauthorized'
  | 'network'
  /** Answered, but the body is not a document this build understands. */
  | 'invalid'
  | 'rejected'

export type PullOutcome =
  | { readonly ok: true; readonly doc: StateDoc; readonly text: string }
  | { readonly ok: false; readonly reason: PullFailure; readonly error: string }

/**
 * Download and validate `username`'s remote document. Never throws.
 *
 * Validation is the codec's: a remote document is no more trusted than a
 * hand-edited file, and it may well have been written by a different build. On
 * top of that the document's own `username` must be the one we asked for — the
 * client mirror of the service's mismatch check, so that adopting a remote copy
 * can never silently switch which account this device is showing.
 *
 * Writes nothing. Applying a pulled document is a separate, explicit step
 * (`applyRemote`) because it is destructive.
 */
export async function pull(
  target: SyncSettings,
  username: string,
  options: SyncOptions = {},
): Promise<PullOutcome> {
  const log = options.log ?? warn

  let response: Response
  try {
    response = await send(target, stateEndpoint(target.baseUrl), options, {
      method: 'GET',
    })
  } catch (cause) {
    log('Sync pull failed.', cause)
    return { ok: false, reason: 'network', error: messageOf(cause) }
  }

  if (response.status === 404) {
    return {
      ok: false,
      reason: 'empty',
      error: 'The sync service has no document stored yet for this user.',
    }
  }
  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      reason: 'unauthorized',
      error: 'The sync service rejected the secret. Check the secret in Settings.',
    }
  }
  if (!response.ok) {
    return { ok: false, reason: 'rejected', error: describeStatus(response.status) }
  }

  let text: string
  try {
    text = await response.text()
  } catch (cause) {
    log('Sync pull failed while reading the response body.', cause)
    return { ok: false, reason: 'network', error: messageOf(cause) }
  }

  const parsed = parse(text, { username })
  if (!parsed.ok) {
    // The codec's message, verbatim — it names the JSON path that is wrong,
    // which is the only useful thing to show for a document that came from
    // another build or a proxy that returned a login page.
    return {
      ok: false,
      reason: 'invalid',
      error: `The document from the sync service could not be read, so nothing was changed.\n\n${parsed.error}`,
    }
  }
  if (parsed.doc.username !== username) {
    return {
      ok: false,
      reason: 'invalid',
      error:
        `The sync service returned a document belonging to "${parsed.doc.username}" ` +
        `when "${username}" was requested, so nothing was changed.`,
    }
  }

  return { ok: true, doc: parsed.doc, text }
}

// ─── login ──────────────────────────────────────────────────────────────────

/**
 * The result of `checkSession`.
 *
 * `ok` carries nothing: the service knows who the caller is from the session,
 * so there is no username for it to echo and nothing for this client to
 * compare. That echo used to be a real check — the old `/api/login` could
 * answer about a *different* name than the one sent — and it is gone because
 * the question is gone.
 */
export type SessionCheckOutcome =
  | { readonly ok: true }
  | {
      readonly ok: false
      readonly reason: 'not-configured' | 'network' | 'unauthorized' | 'rejected'
      readonly error: string
    }

/**
 * Check that the service is reachable and that this browser holds a session it
 * accepts. **Advisory: the answer must never gate entry to the app.**
 *
 * This replaces `login`, and the difference is the whole cutover. That function
 * posted a username and a password to `/api/login`, which checked neither — it
 * validated the shape of the name, discarded the password unread, and echoed
 * the name back (corpus/wiki/technical-decisions.md, "Authentication is a
 * nameplate"). Signing in is Ward's now, at one page for the estate, so there is
 * nothing here to post.
 *
 * What is left is worth keeping: telling somebody their **service address** is
 * wrong, or that they are not signed in, at the moment they are most likely to
 * be looking at Settings. A failure still means "sync will not work", never
 * "you may not train" — training offline has to work and trivially does, because
 * nothing here is consulted to open the app.
 *
 * Never throws.
 */
export async function checkSession(
  target: SyncSettings | null,
  options: SyncOptions = {},
): Promise<SessionCheckOutcome> {
  if (target === null) {
    return { ok: false, reason: 'not-configured', error: 'Sync is not configured.' }
  }

  let response: Response
  try {
    // `GET /api/state` rather than a dedicated probe: it is the route sync
    // actually uses, so this exercises the same gate, the same cookie and the
    // same origin. A dedicated endpoint would be a second answer to "will sync
    // work", free to disagree with the first.
    response = await send(target, stateEndpoint(target.baseUrl), options, { method: 'GET' })
  } catch (cause) {
    ;(options.log ?? warn)('Session check failed; the app works offline regardless.', cause)
    return { ok: false, reason: 'network', error: messageOf(cause) }
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, reason: 'unauthorized', error: describeStatus(response.status) }
  }

  /*
   * 404 is success here. It means the service answered, accepted the session,
   * and holds no document for this person yet — which is exactly the state a
   * new device is in, and the state somebody checking their settings for the
   * first time will most often see.
   */
  if (response.status === 404 || response.ok) return { ok: true }

  return { ok: false, reason: 'rejected', error: describeStatus(response.status) }
}

/** Ward's login page, returning to wherever the person is now. */
export function wardLoginUrl(): string {
  const next =
    typeof window === 'undefined' ? '/' : window.location.pathname + window.location.search
  return `${WARD_LOGIN_PATH}?next=${encodeURIComponent(next)}`
}

// ─── Comparison and the conflict prompt ─────────────────────────────────────

export type Comparison = 'local-ahead' | 'equal' | 'remote-ahead'

/** Two session counts, compared. See the header for which count and why. */
export function compareSessions(localSessions: number, remoteSessions: number): Comparison {
  if (localSessions > remoteSessions) return 'local-ahead'
  if (localSessions < remoteSessions) return 'remote-ahead'
  return 'equal'
}

export type SyncStatus =
  | { readonly kind: 'not-configured' }
  | { readonly kind: 'failed'; readonly reason: PullFailure; readonly error: string }
  /** Nothing stored remotely for this user yet — pushing is safe and loses nothing. */
  | { readonly kind: 'remote-empty'; readonly localSessions: number | null }
  /**
   * No readable local document but a good remote one: the new-device case, and
   * the only case where adopting the remote copy discards nothing.
   */
  | { readonly kind: 'adopt-remote'; readonly remote: StateDoc; readonly remoteSessions: number }
  | { readonly kind: 'in-sync'; readonly sessions: number }
  /** Safe to push: the remote holds a prefix of what this device has. */
  | {
      readonly kind: 'local-ahead'
      readonly localSessions: number
      readonly remoteSessions: number
    }
  /**
   * **Prompt, do not resolve.** The remote holds sessions this device has never
   * seen. Both counts are here so the UI can state the choice in plain numbers,
   * and `remote` is here so accepting it needs no second request.
   */
  | {
      readonly kind: 'conflict'
      readonly localSessions: number
      readonly remoteSessions: number
      readonly remote: StateDoc
    }

/**
 * Compare one user's local and remote documents and return what should happen.
 * **Writes nothing.**
 *
 * That is the load-bearing property, not a detail of the implementation: this
 * function cannot overwrite anything, so no reachable path through it can
 * discard a session. Every destructive step is a separate call the UI makes
 * after the user has seen the numbers.
 *
 * @param username whose stream to compare. Required even when `local` is null,
 *   which is the whole point of the new-device case.
 * @param local the current document, or `null` when storage held none for them
 */
export async function checkSync(
  username: string,
  local: StateDoc | null,
  target: SyncSettings | null,
  options: SyncOptions = {},
): Promise<SyncStatus> {
  if (target === null) return { kind: 'not-configured' }

  const remote = await pull(target, username, options)

  if (!remote.ok) {
    if (remote.reason === 'empty') {
      return { kind: 'remote-empty', localSessions: local?.history.length ?? null }
    }
    return { kind: 'failed', reason: remote.reason, error: remote.error }
  }

  const remoteSessions = remote.doc.history.length

  if (local === null) {
    return { kind: 'adopt-remote', remote: remote.doc, remoteSessions }
  }

  const localSessions = local.history.length
  switch (compareSessions(localSessions, remoteSessions)) {
    case 'equal':
      return { kind: 'in-sync', sessions: localSessions }
    case 'local-ahead':
      return { kind: 'local-ahead', localSessions, remoteSessions }
    case 'remote-ahead':
      return { kind: 'conflict', localSessions, remoteSessions, remote: remote.doc }
  }
}

// ─── Applying a pulled document ─────────────────────────────────────────────

export interface ApplyOptions extends StoreOptions {
  /**
   * Required to replace a local document that could not be parsed. Only pass it
   * after the user has confirmed, exactly like import — the unreadable text may
   * be the only copy of a hand-repairable history.
   */
  readonly allowOverwriteCorrupt?: boolean | undefined
  /**
   * The sync settings to keep, overriding whatever the pulled document carried.
   *
   * `settings.sync` is inside the document, so a naive pull would replace *this*
   * device's service address and secret with the other device's. Those are a
   * property of how this device reaches the service — the phone may use a LAN
   * address where the desktop uses `localhost` — not a property of the training
   * history, and adopting the other device's copy would break sync on this one
   * as a side effect of using it. Pass the target that was used for the pull.
   *
   * Omit to keep whatever the remote document contained.
   */
  readonly preserveSync?: SyncSettings | null | undefined
}

/**
 * Write a pulled document to local storage, destructively.
 *
 * Goes through `store.save` rather than touching storage, so it inherits
 * verify-before-promote, the refusal to overwrite an unreadable document, and the
 * guarantee that the document lands under *its own* username's key.
 * This function is where "replace this device with the remote copy" happens and
 * it should only ever be called from a confirmed user action.
 */
export function applyRemote(doc: StateDoc, options: ApplyOptions = {}): SaveResult {
  const outgoing =
    options.preserveSync === undefined
      ? doc
      : { ...doc, settings: { ...doc.settings, sync: options.preserveSync } }
  return save(outgoing, options)
}

// ─── The session-path call site ─────────────────────────────────────────────

/**
 * Save locally, then upload — in that order, and only in that order.
 *
 * This exists so the ordering is written down once instead of being re-derived
 * at every call site:
 *
 *   1. `store.save` first, synchronously. The local document is the source of
 *      truth and the only write that is allowed to be able to fail visibly.
 *   2. `push` only if the save succeeded. A document the store refused is a
 *      document that did not verify, and uploading it would put an unverified
 *      document into the one place that is supposed to be a safe copy.
 *   3. The push is **not awaited**. It cannot reject, so `void` is safe, and the
 *      caller returns to the UI at local-save speed regardless of the network.
 *
 * The `SaveResult` is returned unchanged: as far as the caller is concerned, the
 * outcome of finishing a workout is the outcome of the local save. Whether the
 * upload worked is not part of it.
 */
export function saveAndPush(doc: StateDoc, options: ApplyOptions & SyncOptions = {}): SaveResult {
  const result = save(doc, options)
  if (result.ok) void push(doc, options)
  return result
}

// ─── Transport ──────────────────────────────────────────────────────────────

interface SendInit {
  readonly method: 'GET' | 'PUT' | 'POST'
  readonly headers?: Readonly<Record<string, string>>
  readonly body?: string
}

/**
 * `_target` is unused and kept in the signature deliberately.
 *
 * It carried the shared secret, which was the only per-target value a request
 * needed; the credential is now Ward's cookie, which the browser attaches
 * without being asked. Every call site already has the target and reads
 * naturally passing it, and a future per-target concern — a header, a timeout
 * override — belongs here rather than being threaded back in.
 */
async function send(
  _target: SyncSettings,
  url: string,
  options: SyncOptions,
  init: SendInit,
): Promise<Response> {
  const doFetch = options.fetchImpl ?? globalThis.fetch
  if (typeof doFetch !== 'function') {
    throw new Error('This environment has no fetch(), so sync is unavailable.')
  }

  const signal = timeoutSignal(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)

  const request: RequestInit = {
    method: init.method,
    headers: { ...init.headers },
    cache: 'no-store',
    /*
     * `include`, where this used to be `omit`.
     *
     * The credential is Ward's `ward_session` cookie, and the service is a
     * different origin whenever `baseUrl` is set — which is the ordinary
     * deployment. Without this the cookie is dropped and every request 401s,
     * while a same-origin build works perfectly: the worst kind of split to
     * debug.
     */
    credentials: 'include',
    ...(init.body === undefined ? {} : { body: init.body }),
    ...(signal === null ? {} : { signal }),
  }

  return doFetch(url, request)
}

/**
 * `AbortSignal.timeout` is guarded rather than assumed: it is missing in older
 * WebViews, and a missing timeout is a slower failure, not a broken one.
 */
function timeoutSignal(timeoutMs: number): AbortSignal | null {
  try {
    const factory = AbortSignal as { timeout?: (ms: number) => AbortSignal }
    return typeof factory.timeout === 'function' ? factory.timeout(timeoutMs) : null
  } catch {
    return null
  }
}

function describeStatus(status: number): string {
  if (status === 401) {
    return 'You are not signed in. Sign in again to sync.'
  }
  if (status === 403) {
    // A live session with no `sports-app` grant. Signing in again cannot fix
    // it, so the message must not suggest it.
    return 'This account does not have access to sync. Ask the administrator to grant it.'
  }
  if (status === 503) {
    // Ward is unreachable. The distinction from 401 is the whole reason the
    // service answers 503: this is worth retrying, and signing out is not the
    // remedy.
    return 'The sign-in service is temporarily unavailable. Sync will retry.'
  }
  if (status === 413) {
    return `The sync service refused the document as too large (${status}).`
  }
  if (status === 415) {
    return `The sync service refused the request's content type (${status}).`
  }
  if (status === 400) {
    return `The sync service rejected the document (${status}).`
  }
  return `The sync service answered with status ${status}.`
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function warn(message: string, cause?: unknown): void {
  if (cause === undefined) console.warn(message)
  else console.warn(message, cause)
}
