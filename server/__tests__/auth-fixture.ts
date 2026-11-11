import { DatabaseSync } from "node:sqlite";
import { ROUTE_PREFIX, SESSION_COOKIE_NAME, DEFAULT_ROLE, openAccounts } from "../src/ward.ts";
import type { AuthConfig } from "../src/ward.ts";

/**
 * Real accounts and real sessions for the service tests.
 *
 * The seam is deliberately *below* the guard, not in front of it. A test that
 * wants to be signed in as `alice` gets a genuine session row minted by the
 * library's own `startSession`, and the service's guard then does exactly what
 * it does in production. Stubbing the guard instead would make every "rejects
 * without a session" assertion tautological — and those assertions are the
 * point of having per-person streams at all.
 *
 * `store.db` is the snapshot store's own handle, as in production, so a test that
 * looks at the database file sees both tables. A store without one (the
 * "exploding" store the health test uses) gets a private in-memory database.
 */

/** The auth config as `readAuthConfig` would produce it for local development. */
export function testAuthConfig(overrides: Partial<AuthConfig> = {}): AuthConfig {
  return {
    publicOrigin: "http://localhost:5173",
    apiPrefix: "",
    cookiePath: "/api",
    cookieName: SESSION_COOKIE_NAME,
    loginPath: "/sports-app/login",
    settingsPath: "/sports-app/account",
    afterSignInPath: "/sports-app/login",
    wardOptions: undefined,
    ...overrides,
  };
}

export function createTestAuth(store: { db?: DatabaseSync }) {
  const accounts = openAccounts(store.db ?? new DatabaseSync(":memory:"));
  const cookies = new Map<string, string>();

  return {
    accounts,
    auth: testAuthConfig(),

    /** Create the user if it does not exist yet, with no password. */
    async ensureUser(
      username: string,
      { password = null, role = DEFAULT_ROLE }: { password?: string | null; role?: string } = {},
    ) {
      const existing = await accounts.findUserByUsername(username);
      if (existing !== undefined) return existing;
      return accounts.createUser({ username, password, role });
    },

    /** A `Cookie` header for a live local session as `username`, minted once. */
    async cookieFor(username: string) {
      const known = cookies.get(username);
      if (known !== undefined) return known;
      const user = await this.ensureUser(username);
      const { token } = await accounts.startSession(user.id);
      const header = `${SESSION_COOKIE_NAME}=${token}`;
      cookies.set(username, header);
      return header;
    },
  };
}

export { ROUTE_PREFIX, SESSION_COOKIE_NAME };
