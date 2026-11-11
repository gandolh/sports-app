import fp from "fastify-plugin";

/**
 * Headers every response carries, on every route and on the 404, the 405 and the error handler.
 */
export const headersPlugin = fp(
  async (app) => {
    //
    // In `onSend` rather than on each reply so that the 404, the 405 and the error
    // handler cannot forget them. This service holds one person's document and
    // nothing about it should ever be cached, sniffed, or framed.
    //
    // The trailing newline is part of the contract: every JSON body this service has
    // ever sent ended with one, so a `curl` of it does not run into the next shell
    // prompt. A `Buffer` payload — which is only ever a stored document — is left
    // exactly as it is, which is the point.
    app.addHook("onSend", (_request, reply, payload, done) => {
      reply.header("Cache-Control", "no-store");
      reply.header("X-Content-Type-Options", "nosniff");
      if (typeof payload === "string" && !payload.endsWith("\n")) {
        done(null, `${payload}\n`);
        return;
      }
      done(null, payload);
    });
  },
  { name: "headers" },
);
