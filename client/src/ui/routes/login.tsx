import { useId } from 'react'
import { createRoute, useNavigate } from '@tanstack/react-router'
import { Field } from '@base-ui/react/field'
import { useForm } from 'react-hook-form'
import { USERNAME_RULE, isValidUsername } from '@sports-app/shared/username.ts'
import { setCurrentUsername } from '../../persistence/session.ts'
import { rootRoute } from './__root.tsx'
import { PressButton } from '../components/PressButton.tsx'
import { Body, Footer, Rail, Screen } from '../components/Screen.tsx'

/**
 * `/login` — a username, a password that is not checked, and a sentence saying so.
 *
 * ── Why the copy is what it is ──────────────────────────────────────────────
 *
 * A username keys a state document; the password is accepted and immediately
 * discarded, never stored and never compared, here or in the service
 * (corpus/wiki/decisions.md). So **anyone who knows a username can read that
 * person's training history**, and the screen says it in two plain sentences. The
 * alternative — a padlock, a "secure sign-in", a strength meter — would be the
 * actual dishonesty: it would invite someone to type a password they reuse
 * elsewhere into a field that throws it away.
 *
 * The password is deliberately **not registered with the form and not held in
 * React state**. It is an uncontrolled input that nothing ever reads, which is the
 * same guarantee the copy makes, expressed in code rather than in a comment —
 * registering it would put the string a person may reuse elsewhere into form
 * state, for a field that has no validation and no reader.
 *
 * ── Validation on blur and on submit, never on a keystroke ───────────────────
 *
 * A username field that turns red while you are typing the third character is
 * hostile: every valid username passes through invalid prefixes on its way in. So
 * `mode` and `reValidateMode` are both `onBlur`, and the rule itself is not
 * restated here — `isValidUsername` and `USERNAME_RULE` come from
 * `@sports-app/shared/username.ts`, which is the one definition
 * `setCurrentUsername`, the codec and the service all validate against, so the
 * blur message and the store's own rejection cannot drift apart.
 *
 * ── It works offline, and there is no code that makes it work offline ───────
 *
 * `sync.login()` exists and is advisory, but it is not called here and cannot be:
 * it needs the sync target, which lives inside the state document, which is keyed
 * by the username this screen has not established yet. So logging in is one
 * synchronous `localStorage` write and nothing else. Nothing on the session
 * -critical path may await the network, and this is the strongest form of that:
 * there is no request to fail.
 */

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginRoute,
})

interface LoginValues {
  readonly username: string
}

function LoginRoute() {
  const navigate = useNavigate()
  const passwordId = useId()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginValues>({
    mode: 'onBlur',
    reValidateMode: 'onBlur',
    defaultValues: { username: '' },
  })

  const error = errors.username?.message ?? null

  function submit({ username }: LoginValues): void {
    const result = setCurrentUsername(username)
    if (!result.ok) {
      // Verbatim. The message states the username rule, or says that browser
      // storage is blocked — both are things the user can act on, and neither
      // survives being paraphrased into "invalid username".
      setError('username', { type: 'store', message: result.error })
      return
    }
    void navigate({ to: '/', search: {} })
  }

  const username = register('username', {
    // Same sentence the store returns, assembled from the same exported rule, so
    // that blurring and submitting cannot say two different things.
    validate: (value) =>
      isValidUsername(value.trim()) || `That username will not work: expected ${USERNAME_RULE}.`,
  })

  return (
    <Screen>
      <Rail status="Sign in" />
      <form
        className="screen__form"
        onSubmit={(event) => void handleSubmit(submit)(event)}
        noValidate
      >
        <Body>
          <h1 className="day-title">Calisthenics</h1>

          <div className="login">
            <Field.Root className="field" invalid={error !== null}>
              <Field.Label className="field__label">Username</Field.Label>
              <Field.Control
                className="field__input"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                {...username}
              />
              {error === null ? null : (
                <Field.Error className="field__error" match>
                  {error}
                </Field.Error>
              )}
            </Field.Root>

            <div className="field">
              <label className="field__label" htmlFor={passwordId}>
                Password
              </label>
              {/* Uncontrolled, and never read. See the note at the top of the file. */}
              <input
                id={passwordId}
                className="field__input"
                type="password"
                autoComplete="current-password"
                aria-describedby={`${passwordId}-note`}
              />
              <p className="field__description" id={`${passwordId}-note`}>
                The password is not checked. It is accepted and discarded, so anyone who knows a
                username can open that username&rsquo;s training history.
              </p>
            </div>
          </div>
        </Body>

        <Footer>
          <PressButton className="btn-primary" type="submit">
            Continue
          </PressButton>
        </Footer>
      </form>
    </Screen>
  )
}
