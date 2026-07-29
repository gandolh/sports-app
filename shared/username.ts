/**
 * The username rule. **One definition, imported by the client and by the
 * service.**
 *
 * ── Why this file exists ────────────────────────────────────────────────────
 *
 * It is the reason `shared/` exists at all. Until brief 21 this rule was written
 * **twice** — once in `server/db.mjs` and once in `client/src/persistence/codec.ts`
 * — and kept honest by a test in the codec's suite that imported the server's
 * `USERNAME_PATTERN` and asserted the two regexes were identical character for
 * character.
 *
 * That test was a real safeguard against a real hazard, and it was also an
 * admission. The duplication existed for a concrete reason: the service is plain
 * `.mjs` that sat outside every `tsconfig.json` and outside the bundle, so importing
 * it from the client would have dragged `node:sqlite` into a browser build. A
 * workspace that contains *only* the rule has neither problem — nothing here can
 * reach a `node:` module, by lint and by type — so there is nothing left to keep in
 * step, and the drift test has been deleted as meaningless rather than left to pass
 * trivially.
 *
 * ── Why the rule belongs to the document, not to a form ─────────────────────
 *
 * The service validates `document.username` on every `PUT` and answers `400` when
 * it fails. A locally-saved document with a username the codec accepted but the
 * service will not is a document that **can never sync**, and the failure would
 * only ever surface as a permanently red sync status. So this is a rule about a
 * *document*, which is why it sits beside `StateDoc` in this package rather than
 * in the login screen that happens to be where a user first meets it. A form that
 * restates the rule is a second source of truth for it
 * (corpus/wiki/technical-decisions.md).
 */

/**
 * The longest a username may be.
 *
 * A cap is not paranoia about SQL — the username reaches SQL only through a bound
 * parameter — it is about the two places an unbounded string is genuinely a
 * problem: it is written into every snapshot row, and echoed back to a browser
 * that has to lay it out on a 320px screen. 32 characters is longer than any name
 * a person types to identify their own training log, and short enough that neither
 * of those becomes a story.
 */
export const USERNAME_MAX_LENGTH = 32

/**
 * The allowlist. Lowercase letters, digits, and `.`/`-`/`_` after the first
 * character.
 *
 * Two decisions worth stating, because both look like something to "fix":
 *
 *   - **Uppercase is rejected rather than folded to lowercase.** The obvious
 *     kindness — accept `Alice`, store under `alice` — is a trap here, because the
 *     username also lives *inside* the document, which is hand-editable and
 *     round-trips verbatim. Folding on the way in would make the stream key
 *     disagree with the document's own `username` field, which is precisely the
 *     mismatch `PUT` refuses. Rejecting with a message that says "lowercase"
 *     leaves one spelling of a name, one stream, and nothing silently rewritten.
 *     It would also make `Alice` and `alice` look like one account in some places
 *     and two in others.
 *   - **The first character must be a letter or a digit**, so a name cannot be
 *     `.`, `..`, `-rf`, or anything else that reads as punctuation rather than as
 *     a person when it turns up in a log line or a filename someone derives from
 *     it.
 *
 * Built from `USERNAME_MAX_LENGTH` rather than restating the bound, so the cap and
 * the pattern cannot drift apart.
 */
export const USERNAME_PATTERN = new RegExp(`^[a-z0-9][a-z0-9._-]{0,${USERNAME_MAX_LENGTH - 1}}$`)

/**
 * Human-readable statement of the rule — for the service's `400` body, for the
 * codec's parse error, for the login screen's validation message, and for tests.
 * One sentence, so all four say the same thing.
 */
export const USERNAME_RULE =
  `1–${USERNAME_MAX_LENGTH} characters, starting with a lowercase letter or a digit, ` +
  'then lowercase letters, digits, dots, dashes or underscores'

export function isValidUsername(value: unknown): value is string {
  return typeof value === 'string' && USERNAME_PATTERN.test(value)
}

/**
 * Who the data that predates usernames belongs to.
 *
 * Before v3 a browser held exactly one document and the snapshots table held
 * exactly one stream, neither saying whose it was — so migrating either means
 * *choosing* an owner, because there is no information in the file or in the
 * database to recover one from. `local` is that choice, and it has to be the
 * **same** choice on both sides: a client that migrates offline and a database
 * that migrated on the server must end up naming the same person, or one user
 * becomes two.
 *
 * It is deliberately a valid username, so migrated history is reachable through
 * the ordinary route (`GET /api/state?user=local`) with no special case anywhere
 * in the service. It is also honest about what those rows are: the single-user
 * local deployment that existed before accounts did.
 *
 * Reattributing them to a real name afterwards is one statement:
 *
 *   sqlite3 db/app.db "UPDATE snapshots SET username = 'alice' WHERE username = 'local'"
 */
export const LEGACY_USERNAME = 'local'
