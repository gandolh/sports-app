import { useState } from 'react'
import { Field } from '@base-ui/react/field'
import { useForm } from 'react-hook-form'
import type { StateDoc, SyncSettings as SyncTarget } from '@sports-app/shared/types.ts'
import type { SyncStatus } from '../../persistence/sync.ts'
import { useBackupNow, useSaveSync, useSyncCheck } from '../document.ts'
import { AlertBanner } from './AlertBanner.tsx'
import { QuietButton, SecondaryButton } from './Buttons.tsx'
import { Eyebrow, SectionHeading } from './Shell.tsx'

/**
 * The sync settings — the service address and the deployment secret.
 *
 * ── Why this lives on `/account` at all ─────────────────────────────────────
 *
 * `client/src/persistence/sync.ts` and `Settings.sync` both exist, and deleting the old
 * settings screen left them with no way in: the feature would have been
 * unreachable and `db/` would never have received a backup. This form is that way
 * in. It is deliberately the *last* section of the page — a deployment detail on a
 * screen otherwise about training, and nothing on the way to a first set.
 *
 * ── This file is one line item outside brief 27b's normal boundary ──────────
 *
 * Every other file under `components/` was 27a's, or `TabBar.tsx`, called out by
 * name as the one exception 27b may edit. This one is neither, and it is edited
 * anyway: it is a hard dependency of `/account`, it rendered entirely against
 * `app.css`'s class vocabulary (`.section`, `.field`, `.actions`, `.result`), and
 * 27b deleted that file — a listed deliverable, not a side effect — leaving
 * nowhere for those class names to resolve to. Recreating them in
 * `index.css` would just rebuild `app.css` under a new name, which that file's own
 * header says brief 27 exists to stop. So this is a mechanical reskin: same hooks,
 * same validation, same copy, same `data-testid`s — only the class names moved
 * to the same Tailwind vocabulary the rest of brief 27b uses.
 *
 * ── The secret is write-only, and that is a hard rule ───────────────────────
 *
 * It is masked on the way in and **never rendered back, not even to the person
 * who typed it**. The document is a file the user is invited to hand-edit, so the
 * value is recoverable by whoever owns the machine; putting it in the DOM only
 * adds it to screenshots and screen shares. So the field opens empty on every
 * visit, blank means "keep the one already stored", and the page states whether
 * one exists rather than what it is.
 *
 * That leaves no way to *remove* a secret by editing the field, which is why
 * **Stop syncing** exists: it sets `settings.sync` to `null`, which is the honest
 * shape of "this device does not sync" and takes the secret with it. An empty
 * address with an empty secret is not that — it is same-origin with no secret,
 * which is exactly how the dev proxy works.
 *
 * Unlike `/login`'s password field, this one *is* registered with the form: the
 * value has to be read on submit to be stored. The two are different objects —
 * that one is a personal password nothing ever reads, this one is a deployment
 * credential for one service — and the rule that follows differs with them.
 *
 * ── Check writes nothing ────────────────────────────────────────────────────
 *
 * `checkSync` compares and reports; every destructive step is a separate tap
 * afterwards. Back up now is offered only where the remote is empty or behind, and
 * a `conflict` — the remote holding sessions this device has never seen — is
 * stated in both numbers and left alone. Discarding sessions somebody knows they
 * did is the one unacceptable outcome, and it is not this form's decision.
 */

interface SyncValues {
  readonly baseUrl: string
  readonly secret: string
}

const FIELD_LABEL = 'block text-meta font-semibold text-tx2'
const FIELD_INPUT =
  'mt-[var(--sp-1)] block min-h-[var(--tap-row)] w-full rounded border border-line2 ' +
  'bg-s1 px-[var(--sp-3)] text-body text-tx'
const FIELD_DESCRIPTION = 'mt-[var(--sp-1)] text-meta text-tx3'
const FIELD_ERROR = 'mt-[var(--sp-1)] text-meta font-semibold text-dang'

/**
 * Empty is valid and means same-origin — that is how the Vite dev proxy and a
 * co-hosted service both work, and `sync.endpoint` is written for it. Anything
 * else must be an absolute `http`/`https` address, because a bare host would be
 * resolved against the app's own origin and silently sync to nothing.
 */
function validateBaseUrl(value: string): true | string {
  const trimmed = value.trim()
  if (trimmed === '') return true
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return 'That is not a full address. Use something like http://192.168.1.20:8787, or leave it empty to use this app’s own origin.'
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return `The address has to start with http:// or https://, not ${parsed.protocol}`
  }
  return true
}

/** What a `SyncStatus` means, in the plainest words available for each case. */
function describeStatus(status: SyncStatus): {
  readonly label: string
  readonly text: string
  readonly canBackUp: boolean
} {
  switch (status.kind) {
    case 'not-configured':
      return {
        label: 'Not syncing',
        text: 'Nothing is configured, so this device keeps its training history to itself.',
        canBackUp: false,
      }
    case 'failed':
      return { label: 'No answer', text: status.error, canBackUp: false }
    case 'remote-empty':
      return {
        label: 'Reached, and empty',
        text: 'The service answered and has nothing stored for this account yet. Backing up now is safe — there is nothing there to lose.',
        canBackUp: true,
      }
    case 'adopt-remote':
      return {
        label: 'Only the service has a history',
        text: `The service holds ${sessionWord(status.remoteSessions)} and this device holds none that could be read.`,
        canBackUp: false,
      }
    case 'in-sync':
      return {
        label: 'In sync',
        text: `Both this device and the service hold ${sessionWord(status.sessions)}.`,
        canBackUp: false,
      }
    case 'local-ahead':
      return {
        label: 'This device is ahead',
        text: `This device holds ${sessionWord(status.localSessions)}; the service holds ${sessionWord(status.remoteSessions)}. Backing up now overwrites the service copy with this one and loses nothing.`,
        canBackUp: true,
      }
    case 'conflict':
      return {
        label: 'The service is ahead',
        text:
          `The service holds ${sessionWord(status.remoteSessions)} and this device holds ` +
          `${sessionWord(status.localSessions)}, so training happened somewhere else. ` +
          `Nothing was changed and nothing will be: uploading would bury those sessions ` +
          `and downloading would discard these. Train on one device, or merge the two ` +
          `documents by hand — both are plain JSON.`,
        canBackUp: false,
      }
  }
}

function sessionWord(count: number): string {
  return count === 1 ? '1 session' : `${count} sessions`
}

export function SyncSettings({
  doc,
  username,
}: {
  readonly doc: StateDoc
  readonly username: string
}) {
  const stored = doc.settings.sync
  const saveSync = useSaveSync(username)
  const check = useSyncCheck()
  const backup = useBackupNow()
  // Cleared whenever the settings change, so a green "in sync" can never be left
  // sitting under an address it was not measured against.
  const [status, setStatus] = useState<SyncStatus | null>(null)

  const {
    register,
    handleSubmit,
    getValues,
    reset,
    trigger,
    formState: { errors },
  } = useForm<SyncValues>({
    // Blur and submit only. A URL passes through a dozen invalid prefixes on its
    // way in, and marking each of them red is hostile.
    mode: 'onBlur',
    reValidateMode: 'onBlur',
    // The secret is deliberately absent from the defaults, not blanked: there is
    // nothing to prefill it from that would not be the value itself.
    defaultValues: { baseUrl: stored?.baseUrl ?? '', secret: '' },
  })

  /**
   * The target the fields currently describe, which is what Check has to test —
   * checking the *saved* settings after somebody has just retyped the address is
   * the trap where the app reports success for a value that is no longer on screen.
   *
   * `null` only for a form that is empty and was never configured: an empty
   * address is otherwise the legitimate same-origin case, so it cannot be treated
   * as "off" on its own.
   */
  function targetFromForm(): SyncTarget | null {
    const values = getValues()
    const baseUrl = values.baseUrl.trim()
    const typed = values.secret.trim()
    if (stored === null && baseUrl === '' && typed === '') return null
    return { baseUrl, secret: typed === '' ? (stored?.secret ?? '') : typed }
  }

  function submit(): void {
    const target = targetFromForm()
    setStatus(null)
    backup.reset()
    saveSync.mutate(
      { doc, sync: target },
      // Emptied rather than left holding the typed secret, so it does not sit in
      // form state — or in a form autofill — after the save.
      { onSuccess: () => reset({ baseUrl: target?.baseUrl ?? '', secret: '' }) },
    )
  }

  async function runCheck(): Promise<void> {
    // The same validation submit gets. Without it a mistyped address reports as a
    // network failure, which sends the user looking for the wrong problem.
    if (!(await trigger('baseUrl'))) return
    setStatus(null)
    backup.reset()
    check.mutate({ username, doc, sync: targetFromForm() }, { onSuccess: setStatus })
  }

  function stopSyncing(): void {
    setStatus(null)
    backup.reset()
    saveSync.mutate({ doc, sync: null }, { onSuccess: () => reset({ baseUrl: '', secret: '' }) })
  }

  const described = status === null ? null : describeStatus(status)
  const hasSecret = stored !== null && stored.secret !== ''

  return (
    <form onSubmit={(event) => void handleSubmit(submit)(event)} noValidate>
      <SectionHeading>Backup</SectionHeading>
      <p className="text-body text-tx2">
        Training history is saved on this device first and always. If a state service is running,
        each finished session is also uploaded to it — the app never waits for that, and a failed
        upload never blocks a session.
      </p>

      <div className="mt-[var(--sp-3)] flex flex-col gap-[var(--sp-3)]">
        <Field.Root invalid={errors.baseUrl !== undefined}>
          <Field.Label className={FIELD_LABEL}>Service address</Field.Label>
          <Field.Control
            className={FIELD_INPUT}
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            {...register('baseUrl', { validate: validateBaseUrl })}
          />
          {/* No placeholder. An example address in a field whose *emptiness* is
              meaningful reads as a stored value, and the one thing this field must
              never do is make somebody think they have configured a service they
              have not. The example goes in the description instead. */}
          <p className={FIELD_DESCRIPTION}>
            Something like{' '}
            <span className="font-mono text-tx2">http://192.168.1.20:8787</span>. Leave it empty
            to use this app&rsquo;s own origin, which is what a co-hosted service and the dev proxy
            both want.
          </p>
          {errors.baseUrl === undefined ? null : (
            <Field.Error className={FIELD_ERROR} match>
              {errors.baseUrl.message}
            </Field.Error>
          )}
        </Field.Root>

        {/*
          The secret field is gone.
          
          The service no longer accepts one: it authenticates the person from
          Ward's session cookie, which the browser holds and this app never
          sees. Leaving the field would invite somebody to type a credential
          into a box that is read by nothing.
          
          A previously typed secret is still in the document — the schema field
          outlives this input and is removed by its own version bump — and the
          note below says so rather than letting it sit there unmentioned.
        */}
        {!hasSecret ? null : (
          <p className={FIELD_DESCRIPTION}>
            This device still has an old sync secret saved from before sign-in moved to the
            estate&rsquo;s single sign-in. It is no longer sent anywhere and no longer does
            anything; it will be dropped from the saved document by a later update.
          </p>
        )}
      </div>

      {saveSync.error === null ? null : (
        <AlertBanner label="Not saved" text={saveSync.error.message} />
      )}
      {backup.error === null ? null : (
        <AlertBanner label="Not uploaded" text={backup.error.message} />
      )}

      {described === null ? null : (
        <div
          data-testid="sync-status"
          className="mt-[var(--sp-3)] rounded border border-line bg-s1 p-[var(--sp-3)] shadow-1"
        >
          <Eyebrow>{described.label}</Eyebrow>
          <p className="mt-[2px] text-body text-tx2">{described.text}</p>
        </div>
      )}
      {backup.isSuccess ? (
        <div className="mt-[var(--sp-3)] rounded border border-line bg-s1 p-[var(--sp-3)] shadow-1">
          <Eyebrow>Uploaded</Eyebrow>
          <p className="mt-[2px] text-body text-tx2">
            The service now holds this device&rsquo;s history.
          </p>
        </div>
      ) : null}

      {check.error === null ? null : (
        <AlertBanner label="Check failed" text={check.error.message} />
      )}

      <div className="mt-[var(--sp-3)] flex items-center gap-[var(--sp-2)]">
        <SecondaryButton type="submit">{saveSync.isPending ? 'Saving…' : 'Save'}</SecondaryButton>
        <SecondaryButton onClick={() => void runCheck()}>
          {check.isPending ? 'Checking…' : 'Check connection'}
        </SecondaryButton>
      </div>

      {/* Offered only where `checkSync` has said the remote is empty or behind.
          There is no button for the other direction anywhere in this app: it would
          discard local sessions, and no automatic rule can know whether that is
          what somebody wanted. */}
      {described?.canBackUp === true ? (
        <div className="mt-[var(--sp-2)]">
          <SecondaryButton onClick={() => backup.mutate(doc)}>
            {backup.isPending ? 'Uploading…' : 'Back up now'}
          </SecondaryButton>
        </div>
      ) : null}

      {stored === null ? null : (
        <div className="mt-[var(--sp-2)]">
          <QuietButton onClick={stopSyncing}>Stop syncing</QuietButton>
        </div>
      )}
    </form>
  )
}
