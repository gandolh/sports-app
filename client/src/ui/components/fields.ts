/**
 * The class strings every text field in the app is set in.
 *
 * `SyncSettings` held these first; the sign-in page and the account's sign-in
 * section need the same four, and a second copy is how two inputs on one screen
 * end up a pixel apart.
 */
export const FIELD_LABEL = 'block text-meta font-semibold text-tx2'
export const FIELD_INPUT =
  'mt-[var(--sp-1)] block min-h-[var(--tap-row)] w-full rounded border border-line2 ' +
  'bg-s1 px-[var(--sp-3)] text-body text-tx'
export const FIELD_DESCRIPTION = 'mt-[var(--sp-1)] text-meta text-tx3'
export const FIELD_ERROR = 'mt-[var(--sp-1)] text-meta font-semibold text-dang'
