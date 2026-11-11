import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { STATE_PATH, ErrorResponse, SnapshotReceipt } from "@sports-app/shared/api.ts";
import type { SnapshotStore } from "../../db.ts";
import { JSON_CONTENT_TYPE, JSON_CONTENT_TYPE_UTF8 } from "../../lib/http.ts";
import type { Log } from "../../lib/http.ts";
import { unsupportedMediaType } from "../../plugins/errors.ts";
import { checkDocument } from "./document.ts";

export interface StateRoutesOptions {
  store: SnapshotStore;
  maxBodyBytes: number;
  log: Log;
}

/**
 * The signed-in user's username. The guard registered first answers every request without a
 * session before a handler runs, so a missing one here means the guard was not registered.
 */
function signedInUsername(request: FastifyRequest): string {
  if (request.auth === null) throw new Error("a state route ran without a session");
  return request.auth.user.username;
}

// ── The state routes, in a scope of their own ─────────────────────────────
//
// **The body arrives as a string, and is never parsed for us.**
//
// `removeAllContentTypeParsers` drops Fastify's `application/json` *and* its
// `text/plain` parser, so these routes accept exactly one media type and
// everything else is a 415 — which is what they always did.
//
// The replacement returns the raw text unchanged. That is what makes
// `GET /api/state` able to answer with the bytes it was given: the document is
// never a JavaScript object in this process, so there is nothing to
// re-serialise.
//
// Parsers are encapsulated per scope, and that is why this is a child scope
// rather than the instance: the auth routes registered above need Fastify's
// ordinary JSON parsing and would answer `invalid_request` to a raw string.
// The scope is created after the guard was registered, so it inherits it.
export const stateRoutes: FastifyPluginAsync<StateRoutesOptions> = async (scope, options) => {
  const { store, maxBodyBytes, log } = options;

  scope.removeAllContentTypeParsers();
  scope.addContentTypeParser(
    JSON_CONTENT_TYPE,
    { parseAs: "string", bodyLimit: maxBodyBytes },
    (_request, body, done) => {
      done(null, body);
    },
  );

  // ── GET /api/state ────────────────────────────────────────────────────────
  //
  // No `response` schema on the 200. Attaching one would hand the reply to
  // fast-json-stringify, which is exactly the re-serialisation this route exists
  // not to do.
  scope.route({
    method: "GET",
    url: STATE_PATH,
    handler: (request, reply) => {
      /*
       * The stream key is the SESSION's username, not a query parameter.
       *
       * `?user=` used to be the only way to say whose document was wanted, and
       * a shared secret authenticated the installation rather than a person —
       * so anyone holding it could read anyone's training history by changing a
       * name in a URL. Now there is nothing to choose: a caller reads their own
       * stream because it is the only one they can name.
       *
       * The username is the **local account's**. A person who signs in with Ward
       * and was suffixed because their Ward name was taken is `alice-2` here, and
       * that is the stream they get; it never follows the Ward name.
       */
      const username = signedInUsername(request);

      const snapshot = store.latest(username);
      if (snapshot === null) {
        // 404 rather than an empty document: "nothing has ever been stored for
        // this user" is exactly the new-device case the client needs to
        // distinguish from "the remote holds a document with zero sessions".
        return reply.code(404).send({ error: "no state has been stored yet for this user" });
      }

      // `Buffer.from(text, 'utf8')` plus Fastify's own `Content-Length` is what
      // makes the round trip byte-identical: no re-encoding, no pretty-printing,
      // no chunked-transfer surprises.
      //
      // The snapshot headers are advisory only. The client compares session counts
      // read from inside the document, never a header, so a proxy that strips them
      // changes nothing. Deliberately no `X-Snapshot-User`: the username is in the
      // document, and a header would be a second place for it to disagree.
      return reply
        .code(200)
        .header("Content-Type", JSON_CONTENT_TYPE_UTF8)
        .header("X-Snapshot-Id", String(snapshot.id))
        .header("X-Snapshot-Created-At", snapshot.createdAt)
        .send(Buffer.from(snapshot.docJson, "utf8"));
    },
  });

  // ── PUT /api/state ────────────────────────────────────────────────────────
  scope.route<{ Body: string | undefined }>({
    method: "PUT",
    url: STATE_PATH,
    schema: { response: { 200: SnapshotReceipt, 400: ErrorResponse, 415: ErrorResponse } },
    handler: (request, reply) => {
      // The session's username, for the reason `GET` gives above.
      const username = signedInUsername(request);

      const text = request.body;
      if (text === undefined) return unsupportedMediaType(reply);

      const checked = checkDocument(text);
      if (!checked.ok) {
        log(`400 PUT ${STATE_PATH}: ${checked.error}`);
        // Nothing has been written. The newest snapshot is untouched.
        return reply.code(400).send({ error: checked.error });
      }

      if (checked.username !== username) {
        /*
         * The document names somebody other than the caller.
         *
         * One side of this comparison is the session, so it refuses a caller
         * trying to write into somebody else's stream as well as a client that
         * got confused.
         *
         * 400 and not 409: nothing is in conflict. One of the two names is
         * simply wrong, and folding them together is precisely what
         * `shared/username.ts` refuses to do.
         */
        const error =
          `username mismatch: the session is ${username} but the document says ` +
          `${checked.username}. Nothing was stored.`;
        log(`400 PUT ${STATE_PATH}: ${error}`);
        return reply.code(400).send({ error });
      }

      // `text`, not a re-serialisation of a parsed object — there is no parsed
      // object. See the "Bytes in, same bytes out" note in db.mjs.
      const written = store.insert({
        username,
        docJson: text,
        historyLength: checked.historyLength,
        schemaVersion: checked.schemaVersion,
      });

      log(
        `stored snapshot ${written.id} for ${username} (${checked.historyLength} sessions, ` +
          `${text.length} bytes, pruned ${written.pruned})`,
      );

      return reply.code(200).send({
        id: written.id,
        createdAt: written.createdAt,
        username,
        historyLength: checked.historyLength,
        schemaVersion: checked.schemaVersion,
        bytes: text.length,
        pruned: written.pruned,
        // This user's rows, not the table's. A count of everybody's would tell
        // each user how much other people train.
        retained: store.count(username),
      });
    },
  });
};
