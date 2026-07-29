/**
 * Settings — export, import, and the storage facts behind them.
 *
 * This screen is the durability escape hatch, so it is written around one
 * assumption: **browser storage will eventually lose the document.** iOS evicts
 * origin storage under pressure and a single "clear site data" wipes it. The
 * export file is the user's real backup, so it must be one click away and it
 * must be obvious which of several files is the newest — hence the session count
 * in the filename rather than a date. Two files downloaded on the same day are
 * indistinguishable by date; `sports-app-41-sessions.json` next to
 * `sports-app-38-sessions.json` is not.
 *
 * Import is destructive and irreversible, so it never applies straight from the
 * file picker. The file is parsed first, and a summary of what it contains —
 * sessions completed and the rung each ladder sits on — is shown for
 * confirmation. A mis-picked file (last year's backup, a file from a different
 * app) is the realistic failure here, and the summary is what makes it visible
 * *before* months of training are replaced.
 *
 * Brief 06 owns the app shell and real styling; this file deliberately stays
 * plain semantic markup. Brief 11 adds sync status and the secret field.
 */
import { useId, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { Pattern, StateDoc, SyncSettings } from '../domain/types.ts'
import { LADDERS } from '../domain/ladders.ts'
import type { DocSummary } from '../persistence/codec.ts'
import { parse, serialise, summarise } from '../persistence/codec.ts'
import { readMeta, readOnlyReason } from '../persistence/store.ts'
import type { SyncStatus } from '../persistence/sync.ts'
import { checkSync } from '../persistence/sync.ts'

export interface SettingsScreenProps {
  /**
   * The live document, or `null` when the store could not read one. A null doc
   * with a read-only message is the corrupt-file case, and it still needs a
   * working import — that is the repair path.
   */
  readonly doc: StateDoc | null
  /**
   * Called only after the user has confirmed the import summary. The owner
   * persists it (`store.save`, with `allowOverwriteCorrupt` when read-only).
   */
  readonly onImport: (doc: StateDoc) => void
  /**
   * The byte-identical text of a stored document that could not be parsed, from
   * `load()`'s `corrupt` result. Offered as a download so it can be repaired in
   * a text editor — it is the only copy of the history, and the app must never
   * be the reason it becomes unreachable.
   */
  readonly unreadableText?: string | null
  /** Defaults to the store's advisory metadata. Injected in tests. */
  readonly lastSavedAt?: string | null
  /** Defaults to the store's read-only latch. Injected in tests. */
  readonly readOnlyMessage?: string | null

  // ── Sync (brief 11) ───────────────────────────────────────────────────────
  /**
   * Persist new sync settings, or `null` to stop syncing. The owner writes them
   * into the document — they live in `settings.sync`.
   */
  readonly onSyncSettingsChange?: (sync: SyncSettings | null) => void
  /**
   * Replace this device's document with the one from the service. Destructive,
   * so it is only ever called from an explicit click on a labelled button, and
   * the owner is expected to write it with
   * `applyRemote(doc, { preserveSync, allowOverwriteCorrupt })`.
   */
  readonly onAdoptRemote?: (remote: StateDoc) => void
  /** Upload this device's document now, overwriting the service's copy. */
  readonly onPushNow?: () => void
  /** Injected in tests. Defaults to `sync.checkSync`. */
  readonly checkSyncImpl?: typeof checkSync
}

/**
 * Named by session count, not date, so the newest of several files is obvious
 * at a glance in a downloads folder.
 */
export function exportFilename(doc: StateDoc): string {
  return `sports-app-${doc.sessionsCompleted}-sessions.json`
}

type ImportState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'reading' }
  | { readonly kind: 'rejected'; readonly filename: string; readonly error: string }
  | {
      readonly kind: 'confirming'
      readonly filename: string
      readonly doc: StateDoc
      readonly summary: DocSummary
    }

/**
 * `null` in `baseUrlEdit` means "not edited" rather than "edited to empty", so
 * the field keeps showing the stored value if the document arrives after mount.
 * `secretEdit` always starts empty because the stored secret is never rendered.
 */
type SyncFeedback =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saved' }
  | { readonly kind: 'cleared' }
  | { readonly kind: 'invalid'; readonly message: string }
  | { readonly kind: 'checking' }
  | { readonly kind: 'status'; readonly status: SyncStatus }

export function SettingsScreen(props: SettingsScreenProps): React.JSX.Element {
  const { doc, onImport, unreadableText = null } = props
  const [importState, setImportState] = useState<ImportState>({ kind: 'idle' })
  const fileInputId = useId()
  const baseUrlId = useId()
  const secretId = useId()
  const [baseUrlEdit, setBaseUrlEdit] = useState<string | null>(null)
  const [secretEdit, setSecretEdit] = useState('')
  const [syncFeedback, setSyncFeedback] = useState<SyncFeedback>({ kind: 'idle' })

  const storedSync = doc?.settings.sync ?? null
  const baseUrlValue = baseUrlEdit ?? storedSync?.baseUrl ?? ''
  const runCheckSync = props.checkSyncImpl ?? checkSync

  // Module-level store facts, read at render time. They only change as a result
  // of a load or save, both of which re-render the owner.
  const lastSavedAt = props.lastSavedAt !== undefined ? props.lastSavedAt : readMeta().lastSavedAt
  const readOnlyMessage =
    props.readOnlyMessage !== undefined ? props.readOnlyMessage : readOnlyReason()

  async function handleFileChosen(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    // Clear the input so choosing the same file twice re-triggers the change event.
    event.target.value = ''
    if (!file) return

    setImportState({ kind: 'reading' })
    let text: string
    try {
      text = await file.text()
    } catch (cause) {
      setImportState({
        kind: 'rejected',
        filename: file.name,
        error: `The file could not be read: ${cause instanceof Error ? cause.message : String(cause)}`,
      })
      return
    }

    const result = parse(text, { ladders: LADDERS })
    if (!result.ok) {
      // Nothing is replaced and nothing is written. The existing document — even
      // an unreadable one — is exactly as it was.
      setImportState({ kind: 'rejected', filename: file.name, error: result.error })
      return
    }
    setImportState({
      kind: 'confirming',
      filename: file.name,
      doc: result.doc,
      summary: summarise(result.doc),
    })
  }

  function confirmImport(): void {
    if (importState.kind !== 'confirming') return
    const incoming = importState.doc
    setImportState({ kind: 'idle' })
    onImport(incoming)
  }

  // ── Sync ──────────────────────────────────────────────────────────────────

  function saveSyncSettings(): void {
    // A blank secret field means "keep the one already stored" — that is what
    // makes the field write-only: it can be replaced without ever being shown.
    const secret = secretEdit !== '' ? secretEdit : (storedSync?.secret ?? '')
    if (secret === '') {
      setSyncFeedback({
        kind: 'invalid',
        message: 'A shared secret is required — it is the only thing protecting the service.',
      })
      return
    }
    props.onSyncSettingsChange?.({ baseUrl: baseUrlValue.trim(), secret })
    setSecretEdit('')
    setBaseUrlEdit(null)
    setSyncFeedback({ kind: 'saved' })
  }

  function clearSyncSettings(): void {
    props.onSyncSettingsChange?.(null)
    setSecretEdit('')
    setBaseUrlEdit(null)
    setSyncFeedback({ kind: 'cleared' })
  }

  async function checkNow(): Promise<void> {
    setSyncFeedback({ kind: 'checking' })
    // `checkSync` never throws and never writes: it reads the remote document,
    // compares `sessionsCompleted`, and hands back a decision. Every
    // destructive branch below is a separate button.
    const status = await runCheckSync(doc, storedSync)
    setSyncFeedback({ kind: 'status', status })
  }

  return (
    <main>
      <h1>Settings</h1>

      {readOnlyMessage !== null && (
        <section aria-labelledby="read-only-heading">
          <h2 id="read-only-heading">Read-only</h2>
          <p role="alert" style={PRE_WRAP}>
            {readOnlyMessage}
          </p>
          {unreadableText !== null && (
            <p>
              <button
                type="button"
                onClick={() => downloadText('sports-app-unreadable.json', unreadableText)}
              >
                Download the unreadable file ({formatBytes(unreadableText.length)})
              </button>{' '}
              Repair it in a text editor, then import it below.
            </p>
          )}
        </section>
      )}

      <section aria-labelledby="storage-heading">
        <h2 id="storage-heading">Storage</h2>
        <dl>
          <dt>Sessions completed</dt>
          <dd>{doc ? doc.sessionsCompleted : 'unknown — no document loaded'}</dd>

          <dt>Last saved</dt>
          <dd>{lastSavedAt === null ? 'never' : formatTimestamp(lastSavedAt)}</dd>

          <dt>Persistent storage</dt>
          <dd>{describePersistence(doc)}</dd>
        </dl>
      </section>

      <section aria-labelledby="export-heading">
        <h2 id="export-heading">Export</h2>
        <p>
          One JSON file holding every session you have completed. It is readable and
          editable in any text editor, and it is the only copy that survives a
          cleared browser.
        </p>
        <button
          type="button"
          disabled={doc === null}
          onClick={() => {
            if (doc) downloadText(exportFilename(doc), serialise(doc))
          }}
        >
          {doc ? `Export ${exportFilename(doc)}` : 'Export unavailable — no document loaded'}
        </button>
      </section>

      <section aria-labelledby="import-heading">
        <h2 id="import-heading">Import</h2>
        <p>
          <strong>Importing replaces everything.</strong> The file is checked first and
          you get a summary to confirm before anything is overwritten.
        </p>
        <label htmlFor={fileInputId}>Choose a state file</label>{' '}
        <input
          id={fileInputId}
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            void handleFileChosen(event)
          }}
        />

        {importState.kind === 'reading' && <p>Reading…</p>}

        {importState.kind === 'rejected' && (
          <div role="alert">
            <h3>{importState.filename} was not imported</h3>
            <p>Nothing was changed. Your existing data is untouched.</p>
            <pre style={PRE_WRAP}>{importState.error}</pre>
            <button type="button" onClick={() => setImportState({ kind: 'idle' })}>
              Dismiss
            </button>
          </div>
        )}

        {importState.kind === 'confirming' && (
          <div role="group" aria-labelledby="confirm-heading">
            <h3 id="confirm-heading">Replace everything with {importState.filename}?</h3>
            <p>
              This file holds <strong>{importState.summary.sessionsCompleted} completed sessions</strong>
              {importState.summary.lastSessionAt !== null && (
                <> , the last on {formatTimestamp(importState.summary.lastSessionAt)}</>
              )}
              . {describeReplacement(doc, importState.summary)}
            </p>
            <table>
              <caption>Ladder positions in the file being imported</caption>
              <thead>
                <tr>
                  <th scope="col">Ladder</th>
                  <th scope="col">Rung</th>
                  <th scope="col">Target</th>
                  <th scope="col">Currently</th>
                </tr>
              </thead>
              <tbody>
                {importState.summary.rungs.map((entry) => (
                  <tr key={entry.pattern}>
                    <th scope="row">{entry.pattern}</th>
                    <td>{describeRung(entry.pattern, entry.rungIndex)}</td>
                    <td>
                      {entry.target} {LADDERS[entry.pattern].unit}
                    </td>
                    <td>
                      {doc
                        ? describeRung(entry.pattern, doc.ladders[entry.pattern].rungIndex)
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" onClick={confirmImport}>
              Replace my data
            </button>{' '}
            <button type="button" onClick={() => setImportState({ kind: 'idle' })}>
              Cancel
            </button>
          </div>
        )}
      </section>

      <section aria-labelledby="sync-heading">
        <h2 id="sync-heading">Sync</h2>
        <p>
          A copy of the same JSON document, held by the SQLite service in{' '}
          <code>server/</code>. It is what survives a lost phone or a cleared browser,
          and it is how a phone and a desktop see the same history. Sync is optional and
          nothing about a workout needs it — a completed session is saved locally first
          and uploaded afterwards, and a failed upload is never an error you have to deal
          with.
        </p>
        <p>
          <strong>The secret is stored inside the document</strong>, so an exported JSON
          file contains it. Treat an export as a credential once sync is configured.
        </p>

        <p>
          <label htmlFor={baseUrlId}>Service address</label>{' '}
          <input
            id={baseUrlId}
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="http://127.0.0.1:8787"
            value={baseUrlValue}
            onChange={(event) => setBaseUrlEdit(event.target.value)}
          />{' '}
          <small>Leave empty if the service is on the same origin as the app.</small>
        </p>

        <p>
          <label htmlFor={secretId}>Shared secret</label>{' '}
          <input
            id={secretId}
            type="password"
            autoComplete="off"
            // Never rendered from storage. The field is write-only: it starts
            // empty, an empty field means "keep the stored secret", and typing
            // replaces it. Showing it would put it on screen and in screenshots
            // for no benefit — nobody needs to read it back.
            placeholder={storedSync === null ? 'required' : 'stored — type to replace'}
            value={secretEdit}
            onChange={(event) => setSecretEdit(event.target.value)}
          />
        </p>

        <p>
          <button type="button" disabled={doc === null} onClick={saveSyncSettings}>
            Save sync settings
          </button>{' '}
          <button type="button" disabled={storedSync === null} onClick={clearSyncSettings}>
            Stop syncing
          </button>{' '}
          <button
            type="button"
            disabled={storedSync === null}
            onClick={() => {
              void checkNow()
            }}
          >
            Check the service
          </button>
        </p>

        <p>
          <strong>Status:</strong>{' '}
          {storedSync === null
            ? 'not configured'
            : `configured for ${storedSync.baseUrl === '' ? 'this origin' : storedSync.baseUrl}`}
        </p>

        {renderSyncFeedback()}
      </section>
    </main>
  )

  function renderSyncFeedback(): React.JSX.Element | null {
    switch (syncFeedback.kind) {
      case 'idle':
        return null
      case 'saved':
        return <p role="status">Sync settings saved.</p>
      case 'cleared':
        return <p role="status">Sync is off. Nothing will be uploaded.</p>
      case 'invalid':
        return <p role="status">{syncFeedback.message}</p>
      case 'checking':
        return <p role="status">Checking the service…</p>
      case 'status':
        return renderSyncStatus(syncFeedback.status)
    }
  }

  function renderSyncStatus(status: SyncStatus): React.JSX.Element {
    switch (status.kind) {
      case 'not-configured':
        return <p role="status">Sync is not configured.</p>

      case 'failed':
        return (
          <p role="status" style={PRE_WRAP}>
            The service could not be read, so nothing was changed. {status.error}
          </p>
        )

      case 'remote-empty':
        return (
          <div role="status">
            <p>The service holds no copy yet. Uploading this device&rsquo;s copy is safe.</p>
            {props.onPushNow && (
              <button type="button" onClick={props.onPushNow}>
                Upload this device&rsquo;s copy
              </button>
            )}
          </div>
        )

      case 'in-sync':
        return (
          <p role="status">
            In sync — both hold {status.sessions}{' '}
            {status.sessions === 1 ? 'session' : 'sessions'}.
          </p>
        )

      case 'local-ahead':
        return (
          <div role="status">
            <p>
              This device has {status.localSessions} sessions, the service has{' '}
              {status.remoteSessions}. The service holds an older copy of the same
              history, so uploading loses nothing.
            </p>
            {props.onPushNow && (
              <button type="button" onClick={props.onPushNow}>
                Upload this device&rsquo;s copy
              </button>
            )}
          </div>
        )

      case 'adopt-remote':
        return (
          <div role="status">
            <p>
              The service holds {status.remoteSessions} sessions and this device has no
              readable document, so there is nothing here to lose.
            </p>
            {props.onAdoptRemote && (
              <button type="button" onClick={() => props.onAdoptRemote?.(status.remote)}>
                Use the copy from the service
              </button>
            )}
          </div>
        )

      case 'conflict':
        // The one case that must never resolve itself. Both numbers are shown
        // and **nothing has been written in either direction** — discarding
        // sessions someone knows they did is the outcome this whole screen
        // exists to prevent, so the choice is the user's and each button says
        // exactly what it costs.
        return (
          <div role="status">
            <h3>Both copies have sessions the other does not</h3>
            <p>
              The service has <strong>{status.remoteSessions} sessions</strong> and this
              device has <strong>{status.localSessions}</strong>. Training was probably
              recorded on another device. <strong>Nothing has been changed.</strong> Pick
              one — the other copy is lost, so if you are unsure, export this device first.
            </p>
            {props.onAdoptRemote && (
              <p>
                <button type="button" onClick={() => props.onAdoptRemote?.(status.remote)}>
                  Use the service copy ({status.remoteSessions} sessions) and discard this
                  device&rsquo;s {status.localSessions}
                </button>
              </p>
            )}
            {props.onPushNow && (
              <p>
                <button type="button" onClick={props.onPushNow}>
                  Keep this device ({status.localSessions} sessions) and overwrite the
                  service&rsquo;s {status.remoteSessions}
                </button>
              </p>
            )}
          </div>
        )
    }
  }
}

// ─── Presentation helpers ───────────────────────────────────────────────────

const PRE_WRAP = { whiteSpace: 'pre-wrap' } as const

function describePersistence(doc: StateDoc | null): string {
  if (!doc) return 'unknown'
  switch (doc.settings.persistGranted) {
    case true:
      return 'granted — the browser should not evict your history'
    case false:
      return 'declined by the browser — your history can be evicted. Export regularly.'
    case null:
      return 'not requested yet'
  }
}

/** Rung numbering is 1-based for humans; `rungIndex` is 0-based in the file. */
function describeRung(pattern: Pattern, rungIndex: number): string {
  const ladder = LADDERS[pattern]
  const name = ladder.rungs[rungIndex]?.name
  const position = `rung ${rungIndex + 1} of ${ladder.rungs.length}`
  return name === undefined ? position : `${position} — ${name}`
}

/**
 * The sentence that makes a mis-picked file obvious: importing an older backup
 * over newer training is the mistake worth shouting about.
 */
function describeReplacement(current: StateDoc | null, incoming: DocSummary): string {
  if (!current) return 'There is currently no readable document to replace.'
  const delta = current.sessionsCompleted - incoming.sessionsCompleted
  if (delta > 0) {
    return `You currently have ${current.sessionsCompleted} — importing this file would discard ${delta} ${delta === 1 ? 'session' : 'sessions'}.`
  }
  if (delta === 0) {
    return `You currently have the same number of sessions.`
  }
  return `You currently have ${current.sessionsCompleted}, so this file is ahead by ${-delta}.`
}

function formatTimestamp(iso: string): string {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return iso
  return new Date(ms).toLocaleString()
}

function formatBytes(length: number): string {
  return length < 1024 ? `${length} bytes` : `${Math.round(length / 1024)} KB`
}

/**
 * Anchor-plus-object-URL download. Behind a capability check because this is the
 * one part of the screen that cannot work in a bare test environment, and a
 * missing `URL.createObjectURL` must not take the whole screen down with it.
 */
function downloadText(filename: string, text: string): void {
  try {
    const blob = new Blob([text], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.rel = 'noopener'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    // Revoked on the next frame: revoking synchronously can cancel the download
    // in some browsers before it has started.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  } catch (cause) {
    console.error('Download failed', cause)
  }
}
