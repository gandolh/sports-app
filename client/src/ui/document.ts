/**
 * The state document, as seen by the UI. One TanStack Query cache entry per
 * username, and every write goes through a mutation that updates it.
 *
 * ── Why a query cache for something synchronous ─────────────────────────────
 *
 * `store.load` is synchronous — that is a deliberate property of using
 * `localStorage` rather than IndexedDB — so nothing here is about awaiting I/O.
 * It is about there being **one** copy of the document in the running app.
 * `/account` and `/week` read the same key the player writes, so finishing a
 * session on `/` updates the milestone list without either screen knowing the
 * other exists. Before this, that was a prop threaded through four screens or a
 * manual refresh.
 *
 * Because the read is synchronous, `initialData` fills the cache on the first
 * render and there is **no loading state anywhere in this app**. That is
 * deliberate and it is why there are no skeletons: a skeleton here would be
 * announcing a wait that does not exist, and the design system lists them as a
 * sign of an architecture bug rather than a missing feature.
 *
 * ── The four states `load` can return, and what each one owes the user ──────
 *
 *   `loaded` / `recovered` — train. A recovered shadow is promoted immediately so
 *       the next launch is an ordinary load.
 *   `empty`     — first ever run. Create and save an empty document; there is
 *       nothing to confirm, because there is nothing to lose.
 *   `migrated`  — a pre-accounts document was found and converted, and **nothing
 *       has been written**. On a shared browser it may not be this person's, and
 *       v2 recorded no owner to check against, so this asks instead of assuming
 *       (`pendingLegacy`).
 *   `corrupt`   — the stored text is unreadable. `doc` stays **null**: showing a
 *       fresh empty document here would silently present a reset ladder as the
 *       user's history, and they would train against it. The banner says so, the
 *       store stays read-only, and `rawText` is carried through so `/account` can
 *       hand the untouched bytes back before anything offers to replace them.
 *   `unavailable` — storage itself is unreachable (private browsing, blocked
 *       cookies). The app runs in memory so the session still works; the banner
 *       says nothing will be saved.
 */
import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SessionResult, StateDoc, SyncSettings } from '@sports-app/shared/types.ts'
import type { Prescription } from '../domain/schedule.ts'
import { recordSession, toSessionResult } from '../domain/schedule.ts'
import {
  emptyDoc,
  isReadOnly,
  load,
  readOnlyReason,
  requestPersistentStorage,
  save,
} from '../persistence/store.ts'
import { checkSync, push, saveAndPush } from '../persistence/sync.ts'
import type { SyncStatus } from '../persistence/sync.ts'
import { nowIso } from '../session/useSession.ts'

export const DOCUMENT_QUERY_ROOT = 'state-document'

export function documentQueryKey(username: string): readonly [string, string] {
  return [DOCUMENT_QUERY_ROOT, username]
}

export interface DocumentSnapshot {
  /** `null` only when the stored text could not be read — see the header. */
  readonly doc: StateDoc | null
  /** A converted pre-accounts document awaiting the user's yes or no. */
  readonly pendingLegacy: StateDoc | null
  /** `store.readOnlyReason`, verbatim, when the store will refuse to write. */
  readonly readOnly: string | null
  /** A one-off failure message, verbatim. */
  readonly error: string | null
  /**
   * The unreadable stored bytes, exactly as they are on disk, and only in the
   * corrupt case. It is what makes the escape hatch on `/account` an export
   * rather than a shrug: the text is usually repairable by hand, so it must be
   * recoverable *before* anything offers to overwrite it.
   */
  readonly rawText: string | null
}

function usable(username: string, doc: StateDoc, error: string | null = null): DocumentSnapshot {
  return {
    doc,
    pendingLegacy: null,
    readOnly: isReadOnly(username) ? readOnlyReason(username) : null,
    error,
    rawText: null,
  }
}

/** Read one user's document and settle every recoverable case. Never throws. */
export function readDocument(username: string): DocumentSnapshot {
  const result = load(username)
  switch (result.status) {
    case 'loaded':
      return usable(username, result.doc)

    case 'recovered': {
      // A complete shadow copy with no live key: a save was interrupted between
      // staging and promotion. Promote it now so this is a one-time event rather
      // than a state the app keeps re-entering.
      const saved = save(result.doc)
      return usable(username, result.doc, saved.ok ? null : saved.error)
    }

    case 'empty': {
      const fresh = emptyDoc(username)
      const saved = save(fresh)
      return usable(username, fresh, saved.ok ? null : saved.error)
    }

    case 'migrated':
      return {
        doc: null,
        pendingLegacy: result.doc,
        readOnly: null,
        error: null,
        rawText: null,
      }

    case 'corrupt':
      return {
        doc: null,
        pendingLegacy: null,
        readOnly: readOnlyReason(username),
        error: result.error,
        rawText: result.rawText,
      }

    case 'unavailable':
      // In memory, for this tab only. Training works; saving does not, and the
      // banner is the honest version of that.
      return {
        doc: emptyDoc(username),
        pendingLegacy: null,
        readOnly: readOnlyReason(username) ?? result.error,
        error: result.error,
        rawText: null,
      }
  }
}

export function useDocument(username: string) {
  return useQuery({
    queryKey: documentQueryKey(username),
    queryFn: () => readDocument(username),
    // Synchronous read, so the first render already has the answer. See header.
    initialData: () => readDocument(username),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  })
}

/**
 * What the player logged, keyed by index into `Prescription.items`.
 *
 * Keyed by the *item* index rather than by pattern or by position in
 * `SessionResult.exercises`, because that is the only index the player actually
 * has: it walks `prescription.items`, and on a cardio slot the two lists are
 * different lengths. `attachLogs` below is what reconciles them, once.
 */
export type SessionLogs = ReadonlyMap<number, readonly number[]>

export interface CompleteSessionInput {
  readonly doc: StateDoc
  readonly prescription: Prescription
  /** Absent or empty is the normal case: logging is optional. See `attachLogs`. */
  readonly logs?: SessionLogs
}

/**
 * Fold the player's logs into the domain's `SessionResult`.
 *
 * ── Why this is here and not in `toSessionResult` ───────────────────────────
 *
 * `toSessionResult` lives in `client/src/domain/` and does not attach logs, on
 * purpose. It defines what a *prescription* records — the shape of the session
 * that was asked for — and the domain has no business knowing that a person
 * typed a number into a field. Widening it would also put captured data inside
 * the pure core, one import away from `prescribe()`, which is the one thing the
 * governing invariant forbids (corpus/CLAUDE.md). So the UI layer maps over its
 * output instead, here, where the captured half of the record enters and can be
 * seen entering.
 *
 * ── The three-valued field, held correctly ──────────────────────────────────
 *
 * `logged` absent, `logged: []` and `logged: [8, 8, 6]` are three different
 * values and the codec keeps all three (`shared/types.ts`). Absent is the
 * normal case and means "not logged"; `[]` means the person logged that they
 * did nothing. `exactOptionalPropertyTypes` is on, so the key is spread in
 * conditionally — `{ logged: logs ?? undefined }` is a *type error* here and
 * would also serialise the wrong thing if it were not.
 *
 * ── Alignment ───────────────────────────────────────────────────────────────
 *
 * `SessionResult.exercises` is `items.filter(type === 'exercise')`, so its Nth
 * entry is the Nth *exercise* item and not the Nth item. The index list below is
 * built by the same filter so the two cannot drift; deriving it by counting
 * would silently mis-assign every log on a cardio day, where the slot's own work
 * is not an exercise.
 */
export function attachLogs(
  result: SessionResult,
  prescription: Prescription,
  logs: SessionLogs,
): SessionResult {
  if (logs.size === 0) return result
  const exerciseItemIndices = prescription.items.flatMap((item, index) =>
    item.type === 'exercise' ? [index] : [],
  )
  return {
    ...result,
    exercises: result.exercises.map((exercise, nth) => {
      const itemIndex = exerciseItemIndices[nth]
      const logged = itemIndex === undefined ? undefined : logs.get(itemIndex)
      return logged === undefined ? exercise : { ...exercise, logged }
    }),
  }
}

/**
 * Finishing a session: `toSessionResult` → `attachLogs` → `recordSession` →
 * save, then upload.
 *
 * `toSessionResult` is the domain's, not a hand-built literal, because it defines
 * the shape of a recorded session and a shape defined twice drifts. It also
 * skips the cardio item — a cardio slot trains no ladder of its own, so its
 * `exercises` is the daily block alone.
 *
 * `saveAndPush` writes locally first and fires the upload without awaiting it: no
 * session-critical path may wait on the network, and the push cannot reject. A
 * failed *local* save throws, so the finish screen can say so instead of quietly
 * losing the session.
 */
export function useCompleteSession(username: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ doc, prescription, logs }: CompleteSessionInput) => {
      const result = attachLogs(
        toSessionResult(prescription, nowIso()),
        prescription,
        logs ?? new Map(),
      )
      const next = recordSession(doc, result)
      const saved = saveAndPush(next)
      if (!saved.ok) throw new Error(saved.error)
      return next
    },
    onSuccess: (next) => {
      queryClient.setQueryData(documentQueryKey(username), usable(username, next))
      // What makes /account and /week correct without either of them knowing a
      // session just happened.
      void queryClient.invalidateQueries({ queryKey: [DOCUMENT_QUERY_ROOT] })
    },
  })
}

/**
 * Answer the "is this pre-accounts history yours?" question.
 *
 * `keep: false` writes a fresh document under this username and **leaves the
 * legacy text exactly where it is** — `store.ts` never removes those keys, so
 * saying no here is not destructive to whoever it does belong to.
 */
export function useAdoptLegacy(username: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ doc, keep }: { readonly doc: StateDoc; readonly keep: boolean }) => {
      const target = keep ? doc : emptyDoc(username)
      const saved = save(target)
      if (!saved.ok) throw new Error(saved.error)
      return target
    },
    onSuccess: (doc) => {
      queryClient.setQueryData(documentQueryKey(username), usable(username, doc))
      void queryClient.invalidateQueries({ queryKey: [DOCUMENT_QUERY_ROOT] })
    },
  })
}

/**
 * Write `settings.sync`, and nothing else in the document.
 *
 * A plain `save`, not `saveAndPush`: configuring sync must not upload anything as
 * a side effect. The user has not yet been told whether the address they typed
 * even resolves, and pushing to a wrong address is how a document lands in
 * somebody else's cabinet. Uploading is `useBackupNow`, and it is a separate tap
 * taken after `useSyncCheck` has said what is at the other end.
 *
 * `null` turns sync off, which is also the only way to remove a stored secret —
 * see the note on write-only secrets in `components/SyncSettings.tsx`.
 */
export function useSaveSync(username: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      doc,
      sync,
    }: {
      readonly doc: StateDoc
      readonly sync: SyncSettings | null
    }) => {
      const next: StateDoc = { ...doc, settings: { ...doc.settings, sync } }
      const saved = save(next)
      if (!saved.ok) throw new Error(saved.error)
      return next
    },
    onSuccess: (next) => {
      queryClient.setQueryData(documentQueryKey(username), usable(username, next))
    },
  })
}

/**
 * Ask what is at the other end. **Writes nothing, in either direction.**
 *
 * That is `checkSync`'s own guarantee and this hook preserves it: a connection
 * check is the one thing a user can safely do to a service they have just typed
 * an address for, and every destructive step is a separate, later tap. A
 * `conflict` result is reported and left alone — the remote holding sessions this
 * device has never seen is not a thing this screen gets to resolve.
 */
export function useSyncCheck() {
  return useMutation({
    mutationFn: ({
      username,
      doc,
      sync,
    }: {
      readonly username: string
      readonly doc: StateDoc | null
      readonly sync: SyncSettings | null
    }): Promise<SyncStatus> => checkSync(username, doc, sync),
  })
}

/**
 * Upload now, rather than at the end of the next session.
 *
 * Without this, `saveAndPush` is the only caller of `push` and the service
 * receives nothing until a session is completed — so somebody who configures sync
 * and closes the app has a backup that does not exist yet. It is only offered
 * where `checkSync` has already said the remote holds a prefix of what this
 * device has; `push` itself never throws and never rejects.
 */
export function useBackupNow() {
  return useMutation({
    mutationFn: async (doc: StateDoc) => {
      const outcome = await push(doc)
      if (!outcome.ok) throw new Error(outcome.error)
      return outcome
    },
  })
}

/**
 * The way out of the read-only latch: replace an unreadable document with an
 * empty one.
 *
 * `allowOverwriteCorrupt` is the store's deliberate speed bump and this is the
 * only place in the app that passes it. It destroys the only copy of something
 * that is usually repairable by hand, so the UI must have offered the export
 * first and taken an explicit second tap — see `Recovery` in `routes/account.tsx`.
 * A successful save also clears the latch, which is why nothing here calls
 * `clearReadOnly`.
 */
export function useStartFresh(username: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const fresh = emptyDoc(username)
      const saved = save(fresh, { allowOverwriteCorrupt: true })
      if (!saved.ok) throw new Error(saved.error)
      return fresh
    },
    onSuccess: (fresh) => {
      queryClient.setQueryData(documentQueryKey(username), usable(username, fresh))
      void queryClient.invalidateQueries({ queryKey: [DOCUMENT_QUERY_ROOT] })
    },
  })
}

/**
 * Ask the browser once, ever, to exempt this origin from eviction, and record
 * the answer in the document so a refusal is visible rather than mysterious.
 *
 * Fire-and-forget on purpose: it is async, it may prompt, and nothing on the way
 * to a first set waits for it. `settings.persistGranted` starts as `null` — "not
 * asked" — so the guard below is also what stops a denial from re-prompting on
 * every launch.
 */
export function useRequestPersistence(username: string, doc: StateDoc | null): void {
  const queryClient = useQueryClient()
  const asked = useRef(false)

  useEffect(() => {
    if (doc === null || doc.settings.persistGranted !== null || asked.current) return
    asked.current = true
    void requestPersistentStorage(doc).then((outcome) => {
      if (!outcome.changed) return
      const saved = save(outcome.doc)
      if (saved.ok) {
        queryClient.setQueryData(documentQueryKey(username), usable(username, outcome.doc))
      }
    })
  }, [doc, queryClient, username])
}
