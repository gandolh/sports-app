import fp from "fastify-plugin";
import type { FastifyError, FastifyReply } from "fastify";
import { HEALTH_PATH, STATE_PATH } from "@sports-app/shared/api.ts";
import { JSON_CONTENT_TYPE, messageOf, pathOf } from "../lib/http.ts";
import type { Log } from "../lib/http.ts";

export interface ErrorsOptions {
  maxBodyBytes: number;
  log: Log;
}

function methodNotAllowed(reply: FastifyReply, allow: string) {
  return reply
    .header("Allow", allow)
    .code(405)
    .send({ error: `method not allowed; try ${allow}` });
}

export function unsupportedMediaType(reply: FastifyReply) {
  return reply.code(415).send({ error: `expected Content-Type: ${JSON_CONTENT_TYPE}` });
}

/**
 * The one error handler and the not-found handler, in the contract's words: every body is
 * `{ error: string }`, plus `limit` on the 413. Registered first, so every scope below inherits them.
 */
export const errorsPlugin = fp<ErrorsOptions>(
  async (app, options) => {
    const { maxBodyBytes, log } = options;

    // ── 404, and the 405 that has to be told apart from it ────────────────────
    //
    // Fastify routes both "no such path" and "that path, wrong method" here, and the
    // contract answers them differently. `/api/health` says `405` to anyone,
    // because liveness needs no credential. Everything else reaches this handler
    // **through the guard**: a caller without a session was already answered `401`,
    // for a real path and an invented one alike, so nobody unauthorised can use a
    // `405` to learn that a route exists. Only a signed-in caller gets to tell the
    // two apart.
    app.setNotFoundHandler(async (request, reply) => {
      const path = pathOf(request.url);

      if (path === HEALTH_PATH) return methodNotAllowed(reply, "GET, HEAD");

      if (path !== STATE_PATH) {
        return reply.code(404).send({ error: "not found" });
      }

      return methodNotAllowed(reply, "GET, PUT");
    });

    // ── Framework errors, in the contract's words ─────────────────────────────
    //
    // Fastify's own error bodies carry `statusCode`, `code` and `error` keys. The
    // client reads `error` and nothing else, so each of the three reachable
    // framework failures is restated in the shape the contract has always used.
    app.setErrorHandler((error: FastifyError, _request, reply) => {
      if (error.code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") return unsupportedMediaType(reply);

      if (error.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
        // Close the connection after answering: the rest of an oversized body is
        // not going to be read, and leaving it half-consumed would stall the socket
        // until it timed out.
        reply.header("Connection", "close");
        return reply.code(413).send({ error: `body exceeds the ${maxBodyBytes} byte limit`, limit: maxBodyBytes });
      }

      /*
       * There is no schema-validated input left.
       *
       * `?user=` was the only one, and it is gone: the stream key is the session's
       * username, so there is nothing on the query string for AJV to reject.
       * The JSON body is checked by `checkDocument`, which answers in the
       * contract's own wording. This branch is therefore unreachable, and it is
       * removed rather than left as dead code that would quietly start firing if
       * a future route added a schema and forgot to word its own errors.
       */

      const status = error.statusCode ?? 500;
      if (typeof error.code === "string" && error.code.startsWith("FST_") && status < 500) {
        // A framework rejection with no contract wording of its own — a malformed
        // request line, say. Fastify's message is about the request's syntax and
        // never quotes its body.
        return reply.code(status).send({ error: error.message });
      }

      log(`unhandled error: ${messageOf(error)}`);
      return reply.code(500).send({ error: "internal error" });
    });
  },
  { name: "errors" },
);
