import { describe, expect, it } from "vitest";
import { DEFAULT_DB_FILE, readConfig } from "./config.ts";

// ─── Configuration ──────────────────────────────────────────────────────────

describe("readConfig", () => {
  it("binds to 127.0.0.1 by default so it cannot be exposed by accident", () => {
    expect(readConfig({}).host).toBe("127.0.0.1");
    expect(readConfig({}).port).toBe(8787);
    expect(readConfig({}).dbFile).toBe(DEFAULT_DB_FILE);
  });

  it("reads host, port, database path and body cap from the environment", () => {
    const config = readConfig({
      SPORTS_APP_HOST: "0.0.0.0",
      SPORTS_APP_PORT: "9000",
      SPORTS_APP_DB: "/tmp/elsewhere.db",
      SPORTS_APP_MAX_BODY_BYTES: "1234",
    });
    expect(config).toMatchObject({
      host: "0.0.0.0",
      port: 9000,
      dbFile: "/tmp/elsewhere.db",
      maxBodyBytes: 1234,
    });
  });
});
