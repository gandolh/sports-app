import type { FastifyPluginAsync } from "fastify";
import { HEALTH_PATH, HealthResponse } from "@sports-app/shared/api.ts";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  // ── GET /api/health ───────────────────────────────────────────────────────
  //
  // On the guard's allowlist, on purpose: the whole point is to answer "is the process up"
  // without needing a credential. It touches neither the database nor anything
  // about any document — no row is read, no username is revealed, and the response
  // schema pins the body to one fixed field, so it cannot become an existence
  // oracle for an account or a leak of how much history is stored.
  app.route({
    method: ["GET", "HEAD"],
    url: HEALTH_PATH,
    schema: { response: { 200: HealthResponse } },
    handler: () => ({ status: "ok" }),
  });
};
