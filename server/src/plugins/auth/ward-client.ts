import { createWardClient } from "../../../vendor/ward/ward-auth.js";
import type { WardClient } from "../../../vendor/ward/ward-auth.js";
import type { AuthConfig } from "../../config.ts";

/**
 * The Ward client, or `undefined` when `WARD_OIDC_ISSUER` is not set and the
 * service runs with local accounts only.
 *
 * `createWardClient` checks the values and imports the key now, so a bad key
 * fails at startup. It does **not** contact Ward: discovery is lazy, so the
 * service starts while Ward is down.
 */
export async function openWardClient(
  config: AuthConfig,
  overrides: { fetch?: typeof fetch } = {},
): Promise<WardClient | undefined> {
  if (config.wardOptions === undefined) return undefined;
  return createWardClient({ ...config.wardOptions, ...overrides });
}
