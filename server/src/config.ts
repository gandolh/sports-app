/**
 * Every setting the service reads, parsed once, here: `config.ts` is the only file that reads
 * `process.env` (the code-structure rule 3), and `loadConfig` is the only reader.
 *
 * Two commands read settings. The service reads the `SPORTS_APP_*` values and, for "Sign in with
 * Ward", the five `WARD_OIDC_*` values (`loadConfig`). The seed CLI reads the database path and the
 * account it creates (`loadSeedConfig`), and needs nothing else: it works with no public origin set.
 *
 * `.env` is loaded by Node's own `--env-file-if-exists` flag in `package.json`'s scripts and by
 * compose's `env_file` in the container, so no loader lives here and none can swallow a missing file.
 * Every function takes the environment as a parameter, which is how the tests drive them; only the
 * defaults read `process.env`.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { wardClientOptionsFromEnv } from "../vendor/ward/ward-auth.js";
import { SESSION_COOKIE_NAME } from "./plugins/auth/constants.ts";

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 8787;

/**
 * Body cap. A snapshot at three years of daily training is roughly a megabyte
 * (see `RETENTION` in the store for why that number matters), so 4 MiB is generous
 * for the document this service exists to hold and small enough that a stray
 * upload cannot fill a disk.
 */
export const DEFAULT_MAX_BODY_BYTES = 4 * 1024 * 1024;

// ─── Where the database lives ───────────────────────────────────────────────

const SERVICE_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * The repository root: the service is the `server/` workspace directly beneath it, and this file
 * sits one folder down in it, in `src/` and in `dist/` alike, so the root is two levels up from
 * either. `db/` is a sibling of `server/` at the repo root and gitignored.
 */
export const PROJECT_ROOT = resolve(SERVICE_DIR, "..", "..");

/**
 * The database directory. Gitignored — see `.gitignore`. It holds real training
 * history and must never end up in a commit.
 */
export const DEFAULT_DB_DIR = resolve(PROJECT_ROOT, "db");

export const DEFAULT_DB_FILE = resolve(DEFAULT_DB_DIR, "app.db");

// ─── Auth ───────────────────────────────────────────────────────────────────

/** The sub-path the client is served from, matching `SPORTS_APP_BASE` in the client build. */
const DEFAULT_BASE = "/sports-app/";

/** Everything the auth wiring reads from the environment: the result of `readAuthConfig`. */
export type AuthConfig = ReturnType<typeof readAuthConfig>;

/**
 * `''` or a leading-slash path with no trailing slash. A typo here would put the
 * cookie on a path the browser never visits, which fails as "sign-in does
 * nothing" — so it is refused at boot instead.
 */
function normaliseApiPrefix(value: string | undefined) {
  const prefix = (value ?? "").trim();
  if (prefix === "") return "";
  if (!/^\/[A-Za-z0-9._~/-]*[A-Za-z0-9._~-]$/.test(prefix)) {
    throw new Error(
      `SPORTS_APP_API_PREFIX must be empty or a path like /sports-app-api (a leading slash, no trailing one), got "${prefix}"`,
    );
  }
  return prefix;
}

/** `/sports-app/` with a leading and trailing slash, the way the client build reads it. */
function normaliseBase(value: string | undefined) {
  const segment = (value ?? "").replace(/^\/+|\/+$/g, "");
  return segment === "" ? "/" : `/${segment}/`;
}

/**
 * Everything the auth wiring needs from the environment.
 *
 * Throws, naming what is missing, rather than returning a half-configured value:
 * a service that cannot say what origin it is served from would mint cookies
 * that are either not `Secure` or not sent back.
 */
export function readAuthConfig(env: Record<string, string | undefined>) {
  const wardOptions = wardClientOptionsFromEnv(env);

  // The redirect URI is, by definition, an address on the app's public origin, so
  // it names it when nothing else does. An explicit value wins.
  const explicit = (env.SPORTS_APP_PUBLIC_ORIGIN ?? "").trim();
  let publicOrigin = explicit;
  if (publicOrigin === "" && wardOptions !== undefined) {
    publicOrigin = new URL(wardOptions.redirectUri).origin;
  }
  if (publicOrigin === "") {
    throw new Error(
      "SPORTS_APP_PUBLIC_ORIGIN is not set, so the service cannot tell whether cookies may be marked Secure.\n" +
        "Set it to the address the browser uses for the app, without a path, e.g. https://example.com\n" +
        "(http://localhost:5173 in development).",
    );
  }
  publicOrigin = new URL(publicOrigin).origin;

  const apiPrefix = normaliseApiPrefix(env.SPORTS_APP_API_PREFIX);
  const base = normaliseBase(env.SPORTS_APP_BASE ?? DEFAULT_BASE);

  return {
    publicOrigin,
    apiPrefix,
    cookiePath: `${apiPrefix}/api`,
    cookieName: SESSION_COOKIE_NAME,
    // Browser paths on the app's own origin, built from the same base the client
    // build uses, so the callback lands on pages that exist.
    loginPath: `${base}login`,
    settingsPath: `${base}account`,
    afterSignInPath: `${base}login`,
    wardOptions,
  };
}

// ─── The service ────────────────────────────────────────────────────────────

/** A setting that cannot be used. The message is fit to print as it stands. */
export class ConfigError extends Error {}

export interface Config {
  host: string;
  port: number;
  dbFile: string;
  maxBodyBytes: number;
  quiet: boolean;
  auth: AuthConfig;
}

export function readConfig(env: Record<string, string | undefined>) {
  const rawPort = env.SPORTS_APP_PORT;
  const port = rawPort === undefined || rawPort === "" ? DEFAULT_PORT : Number(rawPort);
  const rawMax = env.SPORTS_APP_MAX_BODY_BYTES;
  const maxBodyBytes = rawMax === undefined || rawMax === "" ? DEFAULT_MAX_BODY_BYTES : Number(rawMax);

  return {
    host: env.SPORTS_APP_HOST ?? DEFAULT_HOST,
    port,
    dbFile: env.SPORTS_APP_DB ?? DEFAULT_DB_FILE,
    maxBodyBytes,
    quiet: env.SPORTS_APP_QUIET === "1",
  };
}

/**
 * Everything the service needs, or a `ConfigError` saying what is wrong.
 *
 * The origin and the prefix are required to be knowable, and the Ward values
 * are all-or-nothing. A missing origin would mint cookies that are not marked
 * Secure or not sent back; a half-set Ward configuration is always a deploy
 * mistake, and `readAuthConfig` names what is missing.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const settings = readConfig(env);

  if (!Number.isInteger(settings.port) || settings.port < 0 || settings.port > 65535) {
    throw new ConfigError(`SPORTS_APP_PORT must be a port number, got ${String(settings.port)}`);
  }

  let auth: AuthConfig;
  try {
    auth = readAuthConfig(env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`${message}\n\nSee server/README.md, "Configuration".`, { cause: error });
  }

  return { ...settings, auth };
}

// ─── The seed command ───────────────────────────────────────────────────────

export interface SeedConfig {
  dbFile: string;
  username: string;
  password: string;
}

/** What `npm run seed` reads: the database, and the account to create (empty means ask). */
export function loadSeedConfig(env: Record<string, string | undefined> = process.env): SeedConfig {
  return {
    dbFile: env.SPORTS_APP_DB ?? DEFAULT_DB_FILE,
    username: env.SPORTS_APP_SEED_USERNAME ?? "",
    password: env.SPORTS_APP_SEED_PASSWORD ?? "",
  };
}
