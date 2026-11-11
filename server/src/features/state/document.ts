import { TypeCompiler } from "@sinclair/typebox/compiler";
import { USERNAME_RULE } from "@sports-app/shared/username.ts";
import { StateDocumentEnvelope } from "@sports-app/shared/api.ts";
import { messageOf } from "../../lib/http.ts";

// ─── Compiled validators ────────────────────────────────────────────────────
//
// Compiled once at module load, not per request. `TypeCompiler` generates a
// checking function with `new Function`, which is why the compilation happens here
// and not in `shared/api.ts`: that package has to work under a browser's
// Content-Security-Policy, and this one is a Node process.
//
// These are the *same* declarations Fastify's AJV serialises responses with. Two
// entry points into one schema, because a raw-string body cannot be handed to a
// body schema — see the file header.

const checkStateDocument = TypeCompiler.Compile(StateDocumentEnvelope);

// ─── Shallow document check ─────────────────────────────────────────────────

/**
 * What each field of `StateDocumentEnvelope` says when it fails.
 *
 * TypeBox reports a JSON pointer and a generic message ("Expected string"); the
 * contract's messages explain what the field is *for*, which is what a person
 * staring at a rejected sync actually needs. Keyed by pointer so adding a field to
 * the envelope without a message here is visible rather than silent.
 */
const DOCUMENT_ERRORS: Record<string, string> = {
  "/schemaVersion":
    "schemaVersion: expected a number. Every state document carries one; " +
    "a body without it is probably not a state document at all.",
  "/username": `username: expected ${USERNAME_RULE}`,
  // Checked because `history.length` is what the `sessions_completed` column
  // holds — not because the server has an opinion about what is *in* the array.
  // It never looks inside.
  "/history": "history: expected an array",
};

export type CheckedDocument =
  { ok: true; schemaVersion: number; username: string; historyLength: number } | { ok: false; error: string };

export function checkDocument(text: string): CheckedDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (cause) {
    return { ok: false, error: `not valid JSON — ${messageOf(cause)}` };
  }
  // Ahead of the schema so that `null`, `[]` and `"a string"` get an answer about
  // the *document* rather than a pointer into a shape they do not have.
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "expected a JSON object at the top level" };
  }

  if (!checkStateDocument.Check(raw)) {
    // The *first* error, so the answer is about one field rather than a list —
    // and schema property order is what decides which one that is.
    const [first] = checkStateDocument.Errors(raw);
    const pointer = first === undefined ? "" : first.path;
    const fallback = `${pointer}: ${first === undefined ? "invalid" : first.message}`;
    return { ok: false, error: DOCUMENT_ERRORS[pointer] ?? fallback };
  }

  return {
    ok: true,
    schemaVersion: raw.schemaVersion,
    username: raw.username,
    historyLength: raw.history.length,
  };
}
