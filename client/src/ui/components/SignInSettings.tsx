import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Field } from '@base-ui/react/field'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  useChangePassword,
  useLogout,
  useSession,
  useSetLocalPassword,
  useWardLink,
  useWardResult,
  useWardSignOut,
  useWardUnlink,
} from '../../../vendor/ward/ward-auth-react.js'
import type { AuthError } from '../../../vendor/ward/ward-auth-react.js'
import { clearCurrentUsername } from '../../persistence/session.ts'
import { AlertBanner } from './AlertBanner.tsx'
import { QuietButton, SecondaryButton } from './Buttons.tsx'
import { describeAuthIssue } from './authMessages.ts'
import { FIELD_DESCRIPTION, FIELD_INPUT, FIELD_LABEL } from './fields.ts'
import { Eyebrow, SectionHeading } from './Shell.tsx'

/**
 * The account's sign-in settings: who the service thinks you are, the Ward link,
 * the password, and the way out.
 *
 * ── What it needs, and what it never blocks ─────────────────────────────────
 *
 * Everything here talks to the service, so every state has a sentence for "the
 * service did not answer" and none of them stops the rest of `/account`. The
 * totals, the sync settings and the appearance controls all work offline; this
 * section says it is unreachable and leaves them alone.
 *
 * ── Ward is linked from here, and only from here ────────────────────────────
 *
 * Linking never happens by matching a name: whoever controls a Ward account
 * called `alice` must not walk into the local `alice`. A person who already has
 * an account here signs in, opens this page and presses "Link Ward"; Ward asks for
 * its own password and brings them back with the link made. Unlinking is refused
 * until there is a local password, because it would otherwise lock them out, and
 * the password form is the answer to that refusal.
 *
 * Setting a first password works within ten minutes of a Ward sign-in. After that
 * the service asks for Ward's password again (`reauthentication_required`), which
 * is the "Confirm with Ward" button — it is not a second password to remember.
 *
 * ── Logging out forgets the cached name, in one order ───────────────────────
 *
 * The cached username is what lets the app open offline, so it is cleared only
 * after the service has ended the session. A log out that could not reach it says
 * so and leaves the cache alone, rather than showing a signed-out screen over a
 * session that is still live.
 */
export function SignInSettings() {
  const session = useSession()
  const navigate = useNavigate()
  const logout = useLogout()
  const wardOut = useWardSignOut()
  const wardResult = useWardResult()

  async function logOut(): Promise<void> {
    if (!(await logout.logout())) return
    clearCurrentUsername()
    void navigate({ to: '/login' })
  }

  async function logOutOfWard(): Promise<void> {
    if (!(await wardOut.signOut())) return
    // The browser is on its way to Ward, which returns to the app's own page. The
    // cached name has to be gone by then or that page would open the app over a
    // session that no longer exists.
    clearCurrentUsername()
  }

  return (
    <>
      <SectionHeading>Sign-in</SectionHeading>

      {session.status === 'loading' ? (
        <p className="text-body text-tx2">Checking your session…</p>
      ) : null}

      {session.status === 'error' ? (
        <p className="text-body text-tx2">
          {describeAuthIssue(session.error)} Training and the saved history are not affected.
        </p>
      ) : null}

      {session.status === 'signed_out' ? (
        <>
          <p className="text-body text-tx2">
            You are not signed in to the service, so nothing is backed up or synced. Training
            still works.
            {session.reason === undefined ? '' : ` ${describeAuthIssue({ code: session.reason })}`}
          </p>
          <div className="mt-[var(--sp-2)]">
            <Link
              to="/login"
              className="inline-flex min-h-[var(--tap-row)] items-center rounded border border-line2 px-[var(--sp-4)] text-btn font-semibold text-tx"
            >
              Sign in
            </Link>
          </div>
        </>
      ) : null}

      {wardResult.result === 'linked' ? (
        <p className="mt-[var(--sp-2)] text-body text-tx2">Ward is linked.</p>
      ) : null}
      {wardResult.error === undefined ? null : (
        <AlertBanner label="Ward" text={describeAuthIssue(wardResult.error)} />
      )}

      {session.status === 'signed_in' ? (
        <>
          <p className="text-body text-tx2">
            Signed in as <span className="font-semibold text-tx">{session.user.username}</span>,{' '}
            {session.session.origin === 'ward' ? 'with Ward' : 'with your password'}.
          </p>

          {session.ward.enabled ? (
            <WardSection linked={session.ward.linked} hasPassword={session.user.hasPassword} />
          ) : null}

          <PasswordSection hasPassword={session.user.hasPassword} />

          {logout.error === null ? null : (
            <AlertBanner label="Not logged out" text={describeAuthIssue(logout.error)} />
          )}
          {wardOut.error === null ? null : (
            <AlertBanner label="Not logged out" text={describeAuthIssue(wardOut.error)} />
          )}
          <SectionHeading>Session</SectionHeading>
          <p className="text-body text-tx2">
            Logging out ends your session on the service and forgets which account this browser is
            showing. Every training history stays exactly where it is.
          </p>
          <div className="mt-[var(--sp-2)] flex items-center gap-[var(--sp-2)]">
            <SecondaryButton onClick={() => void logOut()}>
              {logout.pending ? 'Logging out…' : 'Log out'}
            </SecondaryButton>
            {session.session.origin === 'ward' ? (
              <QuietButton onClick={() => void logOutOfWard()}>Log out of Ward too</QuietButton>
            ) : null}
          </div>
        </>
      ) : null}
    </>
  )
}

function WardSection({
  linked,
  hasPassword,
}: {
  readonly linked: boolean
  readonly hasPassword: boolean
}) {
  const link = useWardLink()
  const unlink = useWardUnlink()
  const error: AuthError | null = link.error ?? unlink.error

  return (
    <>
      <div className="mt-[var(--sp-4)]">
        <Eyebrow>Ward</Eyebrow>
      </div>
      {linked ? (
        <>
          <p className="mt-[var(--sp-1)] text-body text-tx2">
            A Ward account is linked, so you can sign in with it.
            {hasPassword
              ? ''
              : ' You have no password here yet: set one below before you can unlink it.'}
          </p>
          <div className="mt-[var(--sp-2)]">
            <SecondaryButton onClick={() => void unlink.unlink()}>
              {unlink.pending ? 'Unlinking…' : 'Unlink Ward'}
            </SecondaryButton>
          </div>
        </>
      ) : (
        <>
          <p className="mt-[var(--sp-1)] text-body text-tx2">
            Link a Ward account to sign in with it here. Ward asks for its own password and brings
            you back with the two joined. Nothing is matched by name.
          </p>
          <div className="mt-[var(--sp-2)]">
            <SecondaryButton onClick={() => void link.link()}>
              {link.pending ? 'Opening Ward…' : 'Link Ward'}
            </SecondaryButton>
          </div>
        </>
      )}
      {error === null ? null : <AlertBanner label="Ward" text={describeAuthIssue(error)} />}
    </>
  )
}

/** A labelled password field. Controlled, because nothing else reads the value. */
function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  description,
}: {
  readonly label: string
  readonly value: string
  readonly onChange: (value: string) => void
  readonly autoComplete: 'current-password' | 'new-password'
  readonly description?: ReactNode
}) {
  return (
    <Field.Root>
      <Field.Label className={FIELD_LABEL}>{label}</Field.Label>
      <Field.Control
        className={FIELD_INPUT}
        type="password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
      />
      {description === undefined ? null : <p className={FIELD_DESCRIPTION}>{description}</p>}
    </Field.Root>
  )
}

function PasswordSection({ hasPassword }: { readonly hasPassword: boolean }) {
  return hasPassword ? <ChangePassword /> : <SetFirstPassword />
}

function ChangePassword() {
  const change = useChangePassword()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (await change.changePassword(current, next)) {
      setCurrent('')
      setNext('')
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <div className="mt-[var(--sp-4)]">
        <Eyebrow>Password</Eyebrow>
      </div>
      <div className="mt-[var(--sp-2)] flex flex-col gap-[var(--sp-3)]">
        <PasswordField
          label="Current password"
          value={current}
          onChange={setCurrent}
          autoComplete="current-password"
        />
        <PasswordField
          label="New password"
          value={next}
          onChange={setNext}
          autoComplete="new-password"
        />
      </div>
      {change.error === null ? null : (
        <AlertBanner label="Not changed" text={describeAuthIssue(change.error)} />
      )}
      {change.done ? (
        <p className="mt-[var(--sp-2)] text-body text-tx2">
          Password changed. Your other sessions were signed out.
        </p>
      ) : null}
      <div className="mt-[var(--sp-2)]">
        <SecondaryButton type="submit">
          {change.pending ? 'Changing…' : 'Change password'}
        </SecondaryButton>
      </div>
    </form>
  )
}

function SetFirstPassword() {
  const local = useSetLocalPassword()
  const [next, setNext] = useState('')

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (await local.setPassword(next)) setNext('')
  }

  const needsWard = local.error?.code === 'reauthentication_required'

  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <div className="mt-[var(--sp-4)]">
        <Eyebrow>Password</Eyebrow>
      </div>
      <p className="mt-[var(--sp-1)] text-body text-tx2">
        This account has no password, so Ward is the only way in. Set one to keep signing in while
        Ward is unreachable.
      </p>
      <div className="mt-[var(--sp-2)]">
        <PasswordField
          label="New password"
          value={next}
          onChange={setNext}
          autoComplete="new-password"
        />
      </div>
      {local.reauthenticated && !needsWard ? (
        <p className="mt-[var(--sp-2)] text-body text-tx2">
          Confirmed with Ward. You can set the password now.
        </p>
      ) : null}
      {local.error === null ? null : (
        <AlertBanner label="Not set" text={describeAuthIssue(local.error)} />
      )}
      {local.done ? (
        <p className="mt-[var(--sp-2)] text-body text-tx2">
          Password set. You can sign in with it when Ward is down.
        </p>
      ) : null}
      <div className="mt-[var(--sp-2)] flex items-center gap-[var(--sp-2)]">
        <SecondaryButton type="submit">
          {local.pending ? 'Setting…' : 'Set password'}
        </SecondaryButton>
        {needsWard ? (
          <QuietButton type="button" onClick={() => void local.reauthenticate()}>
            Confirm with Ward
          </QuietButton>
        ) : null}
      </div>
    </form>
  )
}
