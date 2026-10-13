import { USERNAME_RULE } from '@sports-app/shared/username.ts'

/**
 * What each sign-in error code says, in this app's words.
 *
 * The vendored hooks expose a stable `code` and write no copy of their own — the
 * wording is the app's. One table, so the sign-in page and the account's sign-in
 * section say the same thing about the same failure. An unknown code reads as
 * `unknown`, which is the library's own rule.
 */

export interface AuthIssue {
  readonly code: string
  readonly retryAfterSeconds?: number | undefined
}

export function describeAuthIssue(issue: AuthIssue): string {
  switch (issue.code) {
    case 'invalid_credentials':
      return 'That username and password do not match.'
    case 'too_many_attempts':
      return issue.retryAfterSeconds === undefined
        ? 'Too many attempts. Wait a little and try again.'
        : `Too many attempts. Try again in ${waitWord(issue.retryAfterSeconds)}.`
    case 'network':
      return 'Could not reach the service. Signing in needs it to be reachable; training does not.'
    case 'access_denied':
      return 'Ward did not let you in here. Ask the person who runs this app for access.'
    case 'ward_unavailable':
      return 'Ward is unreachable right now. Sign in with your password instead.'
    case 'ward_misconfigured':
      return 'Ward refused this app’s own credentials. That is a setup problem on the server, not something you did.'
    case 'ward_session_ended':
      return 'Your Ward session ended, so this one did too. Sign in again.'
    case 'invalid_callback':
      return 'The Ward sign-in expired or was interrupted. Try again.'
    case 'unsupported_username':
      return `This account’s name cannot be used here: a name has to be ${USERNAME_RULE}. Ask the person who runs this app to rename it.`
    case 'already_linked':
      return 'A Ward account is already linked to this one.'
    case 'ward_account_in_use':
      return 'That Ward account is already linked to a different account here.'
    case 'ward_account_mismatch':
      return 'That is a different Ward account from the one linked here. Sign in to the linked one.'
    case 'not_linked':
      return 'No Ward account is linked.'
    case 'no_local_password':
      return 'Set a password first. Without one, unlinking Ward would lock you out.'
    case 'reauthentication_required':
      return 'Your Ward sign-in is more than ten minutes old. Confirm it with Ward again, then set the password.'
    case 'password_too_short':
      return 'That password is too short.'
    case 'password_too_long':
      return 'That password is too long.'
    case 'unauthorized':
      return 'You are not signed in any more. Sign in again.'
    case 'cross_site':
      return 'The browser sent that from a different address than the app’s own, so it was refused.'
    default:
      return 'Something went wrong. Try again.'
  }
}

function waitWord(seconds: number): string {
  if (seconds < 90) return `${Math.max(1, Math.ceil(seconds))} seconds`
  return `${Math.ceil(seconds / 60)} minutes`
}
