/**
 * The entry: the settings, the app, the signals and the port. `app.ts` builds the service and never
 * listens; this is the one file that does.
 */
import { pathToFileURL } from "node:url";
import type { AddressInfo } from "node:net";
import { RETENTION, openSnapshotStore } from "./db/store.ts";
import { ConfigError, loadConfig } from "./config.ts";
import type { Config } from "./config.ts";
import { buildApp } from "./app.ts";
import type { AppDeps } from "./app.ts";
import { messageOf } from "./lib/http.ts";
import { openAccounts } from "./plugins/auth/accounts.ts";
import { openWardClient } from "./plugins/auth/ward-client.ts";
import { linkWardStreams, orphanStreamNames } from "./plugins/auth/streams.ts";
import type { WardClient } from "../vendor/ward/ward-auth.js";
import { LEGACY_USERNAME } from "@sports-app/shared/username.ts";

/**
 * The subset of `node:http.Server` this service is driven through.
 *
 * Fastify owns the socket internally and its own `listen` is promise-based, so
 * rather than leak that shape to every caller the three methods `main()` and the
 * tests actually use are adapted here. `listen` boots Fastify's plugin graph
 * first — routes are registered during `ready()`, so a raw `server.listen()` would
 * open the port before there was anything to route to.
 */
export interface StateService {
  listen(port: number, host: string, onListening?: () => void): void;
  address(): AddressInfo | string | null;
  close(done?: () => void): void;
}

export type StateServerConfig = AppDeps;

export function createStateServer(config: StateServerConfig): StateService {
  const app = buildApp(config);

  return {
    listen(port, host, onListening) {
      app
        .listen({ port, host })
        .then(() => {
          if (onListening !== undefined) onListening();
        })
        .catch((cause) => {
          // `node:http` reports a failed bind by emitting `error` on the server,
          // and an unhandled one takes the process down. Re-emitting keeps that
          // behaviour: a service that cannot bind its port must not look started.
          app.server.emit("error", cause);
        });
    },
    address() {
      return app.server.address();
    },
    close(done) {
      void app.close().then(() => {
        if (done !== undefined) done();
      });
    },
  };
}

// ─── Entry point ────────────────────────────────────────────────────────────

/**
 * Start the service. Resolves to `null` when it could not start, after saying why on `out`.
 */
export async function main(out: { error: (m: string) => void; log: (m: string) => void } = console) {
  let config: Config;
  try {
    config = loadConfig();
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    out.error(error.message);
    return null;
  }
  const { auth } = config;

  const store = openSnapshotStore({ file: config.dbFile });
  const log = config.quiet ? () => {} : (message: string) => out.log(`[state] ${message}`);

  const accounts = openAccounts(store.db);
  let wardClient: WardClient | undefined;
  try {
    // Validates the values and imports the key now, so a bad key fails here.
    // It does not contact Ward: discovery is lazy, and the service starts while
    // Ward is down.
    wardClient = await openWardClient(auth);
  } catch (error) {
    store.close();
    out.error(`Ward sign-in is misconfigured: ${messageOf(error)}`);
    return null;
  }

  // Before anything listens: a Ward sign-in must find the account that owns an
  // existing stream the moment it can arrive.
  let linkedStreams: string[];
  try {
    linkedStreams = await linkWardStreams(store, accounts);
  } catch (error) {
    store.close();
    out.error(`Could not link existing Ward streams to accounts: ${messageOf(error)}`);
    return null;
  }

  const server = createStateServer({
    store,
    accounts,
    auth,
    wardClient,
    maxBodyBytes: config.maxBodyBytes,
    log,
  });

  server.listen(config.port, config.host, () => {
    const address = server.address();
    const shown = typeof address === "object" && address !== null ? address.port : config.port;
    log(`listening on http://${config.host}:${shown}`);
    log(`database ${store.file} (keeping the newest ${RETENTION} snapshots per user)`);
    log(
      `sessions: cookie ${auth.cookieName} on Path=${auth.cookiePath}; ` +
        (wardClient === undefined ? "Sign in with Ward is off" : "Sign in with Ward is on"),
    );
    if (linkedStreams.length > 0) {
      log(
        `linked ${linkedStreams.length} stream(s) keyed by a Ward subject to accounts of the same ` +
          "name, so their next Ward sign-in finds their history",
      );
    }
    // The secret is never logged, here or anywhere else.
    void orphanStreamNames(store, accounts).then((orphans) => {
      if (orphans.length === 0) return;
      log(
        `${orphans.length} snapshot stream(s) have no account yet: ${orphans.slice(0, 10).join(", ")}` +
          `${orphans.length > 10 ? ", …" : ""}. Create one with the same username (npm run seed) ` +
          "and its history is read again.",
      );
    });
    if (store.migrated) {
      // Worth one line at startup, once: somebody upgrading a real deployment
      // needs to know where their existing history went and how to rename it.
      log(
        `migrated the single-stream schema: existing snapshots are now attributed to ` +
          `"${LEGACY_USERNAME}". Reattribute with: sqlite3 ${store.file} ` +
          `"UPDATE snapshots SET username = 'yourname' WHERE username = '${LEGACY_USERNAME}'"`,
      );
    }
  });

  // A `synchronous = FULL` database has nothing in flight to lose, but closing
  // it explicitly releases the WAL cleanly instead of leaving recovery to the
  // next open.
  const shutdown = () => {
    server.close(() => {
      store.close();
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  return { server, store, accounts };
}

const invokedDirectly = process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedDirectly) {
  main()
    .then((started) => {
      // A start that failed has already said why; the exit code is what a supervisor reads.
      if (started === null) process.exitCode = 1;
    })
    .catch((cause) => {
      console.error(messageOf(cause));
      process.exitCode = 1;
    });
}
