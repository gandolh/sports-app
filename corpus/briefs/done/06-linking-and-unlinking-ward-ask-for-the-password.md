# Brief 06: Linking and unlinking Ward ask for the password

**Depends on:** Ward's library at the version that adds the look-alike username check (2026-11-19; the dispatch prompt names the wzd_auth commit to vendor from).

**Before you start:** run `brief-board guide` (the repo's `CLAUDE.md` says so).

Filed 2026-11-19 by the controller. The owner's rule of 2026-11-17: an app links or unlinks a Ward account only after the local password is typed again. Ward's library carries the rule from 1.0.0; this app gets it when it vendors the new copy. The same update refuses a new or changed local username that looks like an existing one (Unicode's confusable skeleton: `AIice` against `alice`, `b0b` against `bob`).

## Context

This app vendors ward-auth 0.7.0 in `server/vendor/ward` and `client/vendor/ward`. Its code calls the link and unlink at: `client/src/ui/components/SignInSettings.tsx:171` (link), `:159` (unlink).

What the update changes here:

- `POST /ward/link` and `POST /ward/unlink` take `{ currentPassword }`: 400 `invalid_request` without it, 401 `invalid_credentials` when it is wrong, 429 `too_many_attempts` with `retryAfterSeconds` under the change-password budget. A Ward-only user still gets 409 `no_local_password` on unlink, whatever is sent.
- The browser calls take the password: `link(currentPassword)` / `startWardLink(currentPassword)`, `unlink(currentPassword)` / `unlinkWard(currentPassword)`. The old call shape no longer compiles, so the typecheck finds every call site.
- A link start is held in the server's memory for ten minutes; one still waiting for Ward when the server restarts lands as `?ward_error=invalid_callback` (the words for it exist).
- The username key: a migration at start adds a key column and fills it. Two existing accounts with the same key are both kept and logged once. Nothing to do by hand.

## Decisions

- **Both copies in one commit.** The new server copy refuses a link or unlink from an old web copy (400); an old server ignores the new field.
- **The password field sits with its control:** next to each button. Labelled as the app labels its other password fields ("Current password" or the app's language), `type="password"`, `autocomplete="current-password"`. A refusal stays on the page: `invalid_credentials` and `too_many_attempts` (with the wait) show beside the field, which keeps focus.

## Files you OWN

- `server/vendor/ward/` and `client/vendor/ward/`: generated, written only by Ward's vendor script.
- The settings code named above, the server's auth plugin options, and their tests.
- Corpus: `corpus/wiki/status.md`, `corpus/log.md`, the wiki page that describes sign-in.

## Files you must NOT touch

- The wzd_auth repo: read only (its vendor script writes only into this repo). Other features.

## What to do

1. Vendor both copies from the wzd_auth checkout at the commit the dispatch prompt names: `npm run vendor -- <this repo>/server/vendor/ward`, then the same for `client/vendor/ward`, in one commit with the call-site changes.
2. Server tests that POST `/ward/link` or `/ward/unlink` with a session send `{ currentPassword }`. New: link and unlink without it, with a wrong one and with the right one; a linked user still signs in with Ward.
3. The settings UI as decided, with a test that the call carries the password and that a wrong one shows the message.
4. A test that a new local account with a look-alike name (`AIice` when `alice` exists) is refused with the taken-name answer on `/register`, where this app has a route that creates or renames local accounts; skip it and say so where it has none.
5. Start the app on its dev seed once and read the start log: the username-key migration ran; note any shared-key line.
6. Shots of the settings at 1280 light and 390 dark; read them for clipping.

## Acceptance

- [ ] Both vendored copies at the new version; the tests above pass; `npm run check` exit 0; `bash corpus/lint.sh` OK.
- [ ] The outcome note lists each CHANGELOG entry this app crossed and what it needed.
- [ ] End move `ready_for_deploy` with the app's deploy step (server and web both change).

## Outcome (2026-11-19)

ward-auth 1.1.0 is vendored in `server/vendor/ward` and `client/vendor/ward` (six files each, `SHA256SUMS` checked); the settings page and tests changed in the same commit. Rename stays off (`ALLOW_RENAME`).

- **What a person notices:** Link Ward and Unlink Ward each have a "Current password" field above the button (`type=password`, `autocomplete=current-password`). A wrong password shows "That password is not right." beside the field, which keeps focus; too many attempts shows the wait. A Ward-only account with no local password sees no field on Unlink and still gets the "Set a password first" line. A link still waiting at Ward when the server restarts lands on the existing `invalid_callback` words.
- **CHANGELOG entries crossed (0.7.0 to 1.1.0):** 0.7.1 and 0.7.2, nothing to change. 1.0.0: password on link and unlink (settings UI, harness and tests), cookie and budget items need nothing here. 1.1.0: nothing in code; migration 5 runs at the first boot; no step back to an older copy afterwards without a backup.
- **Migration 5:** a fresh dev database, seeded then started, has `auth_users.username_skeleton` filled (`alice`). The start log shows no shared-key line (one user). Not run against a database created by 0.7.0.
- **Tests:** server tests for link and unlink without, with a wrong and with the right password, a linked user still signing in with Ward; client tests that the call carries the password, a wrong one shows the message with focus kept, and the 429 wait. The look-alike `/register` test is skipped: this app has no route that creates or renames local accounts.
- **Shots:** settings at 1280 light and 390 dark with the error showing, read, no clipping or horizontal overflow (Playwright with the session and Ward routes stubbed).
- **Deviation:** the error for `invalid_credentials` beside these fields reads "That password is not right." rather than the sign-in page's "username and password" sentence. The two Current password fields on the page (Ward and change-password) share a label, as the brief asked.
- **Checks:** `npm run check` exit 0 (1357 tests). Deploy: `server` and web both change, so `node cli.ts sports-app all` from vps-deploy.
