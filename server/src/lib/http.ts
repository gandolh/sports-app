export const JSON_CONTENT_TYPE = "application/json";
export const JSON_CONTENT_TYPE_UTF8 = `${JSON_CONTENT_TYPE}; charset=utf-8`;

/** A line for the service's one output, `out.log`. Handed fixed strings only. */
export type Log = (message: string) => void;

/**
 * The path, without the query string.
 *
 * Fastify's router already matches on the path alone, so this is only needed
 * where a request has *not* matched a route — the 404/405 handler — and in log
 * lines, which must never carry a query string into a log file.
 */
export function pathOf(url: string | undefined): string {
  return (url ?? "").split("?")[0] ?? "";
}

export function messageOf(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}
