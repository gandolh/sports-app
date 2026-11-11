/**
 * Store-level tests: the schema migration, and the per-user retention rules.
 *
 * These are separate from `state-server.test.mjs` because they are not about
 * HTTP. Two of them cannot be written at the HTTP layer at all:
 *
 *   1. **Migrating a pre-existing single-stream database.** The interesting
 *      input is a database created by the *old* schema, with rows in it. That is
 *      built here with `DatabaseSync` directly — a service that only works on an
 *      empty database is not finished, and the only way to know is to hand it a
 *      full one.
 *   2. **Pruning by `id` rather than `created_at`.** `insert` accepts an explicit
 *      `createdAt`, so the clock can be made to go *backwards* mid-stream, which
 *      is what an NTP correction does. Over HTTP the timestamp is always the
 *      server's own and the distinction is invisible.
 *
 * Everything here opens a real `DatabaseSync` on a real temporary file. There is
 * no mock: the properties under test are properties of what SQLite actually did.
 */
import { afterEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { RETENTION, openSnapshotStore } from "../db.ts";
import type { SnapshotStore } from "../db.ts";
import {
  LEGACY_USERNAME,
  USERNAME_MAX_LENGTH,
  USERNAME_PATTERN,
  isValidUsername,
} from "@sports-app/shared/username.ts";

// ─── Harness ────────────────────────────────────────────────────────────────

let cleanups: (() => void)[] = [];

afterEach(() => {
  const pending = cleanups;
  cleanups = [];
  for (const stop of pending.reverse()) stop();
});

function tempDir() {
  const root = mkdtempSync(join(tmpdir(), "sports-app-db-"));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function openStore(file: string, options: { retention?: number } = {}) {
  const store = openSnapshotStore({ file, ...options });
  cleanups.push(() => store.close());
  return store;
}

/** A document body. Only `history.length` and `username` matter to the store. */
function doc(username: string, sessions: number) {
  return JSON.stringify({
    schemaVersion: 3,
    username,
    history: Array.from({ length: sessions }, (_, i) => ({ n: i })),
  });
}

function put(store: SnapshotStore, username: string, sessions: number, createdAt?: string) {
  return store.insert({
    username,
    docJson: doc(username, sessions),
    historyLength: sessions,
    schemaVersion: 3,
    ...(createdAt === undefined ? {} : { createdAt }),
  });
}

/**
 * `PRAGMA table_info` as a comparable value: name, declared type, NOT NULL, and
 * default, in column order. This is what "the same schema" has to mean — two
 * tables that behave the same but disagree on column order or on a default are
 * two schemas, and the difference surfaces the first time somebody runs
 * `SELECT *` or diffs `.schema`.
 */
function tableShape(file: string) {
  const db = new DatabaseSync(file);
  try {
    return db
      .prepare("PRAGMA table_info(snapshots)")
      .all()
      .map((row) => `${row.name} ${row.type} notnull=${row.notnull} default=${row.dflt_value}`);
  } finally {
    db.close();
  }
}

/**
 * A database in the shape this service had before usernames existed: one stream,
 * no column saying whose. Verbatim from the pre-v3 DDL, deliberately not built
 * from anything the current code exports — a fixture that follows the
 * implementation around cannot detect a migration that stopped being needed.
 */
function legacyDatabase(rows: { createdAt: string; sessions: number; docJson: string }[]) {
  const root = tempDir();
  const dir = join(root, "db");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "app.db");
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE snapshots (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at         TEXT    NOT NULL,
      sessions_completed INTEGER NOT NULL,
      schema_version     INTEGER NOT NULL,
      doc_json           TEXT    NOT NULL
    );
  `);
  const insert = db.prepare(
    "INSERT INTO snapshots (created_at, sessions_completed, schema_version, doc_json) VALUES (?, ?, ?, ?)",
  );
  for (const row of rows) insert.run(row.createdAt, row.sessions, 2, row.docJson);
  db.close();
  return file;
}

// A v2 document: `sessionsCompleted`, no `username`. This is what real rows in a
// real `db/app.db` contain, and the migration must leave them readable without
// understanding them.
const V2_DOC_A = '{\n  "schemaVersion": 2,\n  "sessionsCompleted": 41,\n  "history": []\n}\n';
const V2_DOC_B = '{\n  "schemaVersion": 2,\n  "sessionsCompleted": 42,\n  "history": []\n}\n';

// ─── Usernames ──────────────────────────────────────────────────────────────

describe("username rules", () => {
  it("accepts the names a person would actually pick", () => {
    for (const name of ["a", "7", "alice", "bob99", "a.b", "a-b", "a_b", "x".repeat(32)]) {
      expect(isValidUsername(name), name).toBe(true);
    }
  });

  it("rejects empty, over-long, out-of-alphabet and non-string names", () => {
    for (const name of [
      "",
      "x".repeat(33),
      "Alice", // uppercase is rejected, never folded — see USERNAME_PATTERN
      "ali ce",
      ".hidden",
      "-rf",
      "_x",
      "../etc/passwd",
      "alice'; DROP TABLE snapshots; --",
      "ali/ce",
      "café",
      "a\nb",
      "a\u0000b",
      null,
      undefined,
      7,
      ["alice"],
      { toString: () => "alice" },
    ]) {
      expect(isValidUsername(name), String(name)).toBe(false);
    }
  });

  it("derives the pattern from the length cap so the two cannot drift", () => {
    expect(USERNAME_MAX_LENGTH).toBe(32);
    expect(USERNAME_PATTERN.test("a".repeat(USERNAME_MAX_LENGTH))).toBe(true);
    expect(USERNAME_PATTERN.test("a".repeat(USERNAME_MAX_LENGTH + 1))).toBe(false);
  });

  it("has a legacy username that is itself a valid username", () => {
    // Load-bearing twice over: it is interpolated into DDL, where the allowlist
    // is what rules out a quote, and migrated rows have to be reachable through
    // the ordinary `?user=` route rather than a special case.
    expect(isValidUsername(LEGACY_USERNAME)).toBe(true);
    expect(LEGACY_USERNAME).toBe("local");
  });
});

// ─── Migration ──────────────────────────────────────────────────────────────

describe("migrating a pre-existing single-user database", () => {
  it("adds username in place and keeps the old rows readable under the documented default", () => {
    const file = legacyDatabase([
      { createdAt: "2026-01-01T06:00:00.000Z", sessions: 41, docJson: V2_DOC_A },
      { createdAt: "2026-01-02T06:00:00.000Z", sessions: 42, docJson: V2_DOC_B },
    ]);

    const store = openStore(file);

    expect(store.migrated).toBe(true);
    expect(store.usernames()).toEqual([LEGACY_USERNAME]);
    expect(store.count()).toBe(2);
    expect(store.count(LEGACY_USERNAME)).toBe(2);

    // Row identity survives: same ids, same order, nothing rebuilt or renumbered.
    expect(store.ids(LEGACY_USERNAME)).toEqual([2, 1]);

    // And the bytes are the bytes. `toBe` on a string, because a migration that
    // re-serialised the documents would pass a deep-equality check while
    // destroying the layout the codec wrote them in.
    const latest = store.latest(LEGACY_USERNAME);
    expect(latest?.docJson).toBe(V2_DOC_B);
    expect(latest?.historyLength).toBe(42);
    expect(latest?.schemaVersion).toBe(2);
    expect(latest?.username).toBe(LEGACY_USERNAME);
  });

  it("is idempotent: opening the same database again migrates nothing and changes nothing", () => {
    const file = legacyDatabase([{ createdAt: "2026-01-01T06:00:00.000Z", sessions: 41, docJson: V2_DOC_A }]);

    const first = openSnapshotStore({ file });
    expect(first.migrated).toBe(true);
    first.close();

    for (let pass = 1; pass <= 3; pass += 1) {
      const again = openSnapshotStore({ file });
      expect(again.migrated, `pass ${pass}`).toBe(false);
      expect(again.count()).toBe(1);
      expect(again.latest(LEGACY_USERNAME)?.docJson).toBe(V2_DOC_A);
      again.close();
    }

    // Exactly one username column, not three.
    expect(tableShape(file).filter((column) => column.startsWith("username "))).toHaveLength(1);
  });

  it("leaves a migrated database with the same schema as a fresh one", () => {
    const migratedFile = legacyDatabase([{ createdAt: "2026-01-01T06:00:00.000Z", sessions: 1, docJson: V2_DOC_A }]);
    openSnapshotStore({ file: migratedFile }).close();

    const freshFile = join(tempDir(), "db", "fresh.db");
    openSnapshotStore({ file: freshFile }).close();

    // Column order included: `ALTER TABLE` can only append, so the fresh DDL
    // declares `username` last to match. If somebody moves it, this fails.
    expect(tableShape(migratedFile)).toEqual(tableShape(freshFile));
  });

  it("keeps migrated history and a new user in separate streams", () => {
    const file = legacyDatabase([{ createdAt: "2026-01-01T06:00:00.000Z", sessions: 41, docJson: V2_DOC_A }]);
    const store = openStore(file);

    put(store, "alice", 1);

    expect(store.usernames()).toEqual(["alice", LEGACY_USERNAME]);
    expect(store.latest(LEGACY_USERNAME)?.docJson).toBe(V2_DOC_A);
    expect(store.count(LEGACY_USERNAME)).toBe(1);
    expect(store.count("alice")).toBe(1);
  });

  it("creates a usable database when there is no file at all", () => {
    const store = openStore(join(tempDir(), "db", "app.db"));
    expect(store.migrated).toBe(false);
    expect(store.latest("alice")).toBe(null);
    put(store, "alice", 1);
    expect(store.latest("alice")?.historyLength).toBe(1);
  });
});

// ─── Retention, per user ────────────────────────────────────────────────────

describe("retention is per user", () => {
  it("defaults to a cap small enough that the quadratic term stays small", () => {
    // Not a tuning knob: snapshot size grows with sessions and total size grows
    // with retention × sessions × users. This assertion exists so that raising it
    // is a deliberate act with a failing test attached.
    expect(RETENTION).toBe(20);
  });

  it("holds at the cap for a user who keeps training", () => {
    const store = openStore(join(tempDir(), "db", "app.db"), { retention: 20 });
    for (let i = 1; i <= 26; i += 1) put(store, "alice", i);

    expect(store.count("alice")).toBe(20);
    expect(store.latest("alice")?.historyLength).toBe(26);
    // The survivors are the newest twenty, by id.
    expect(store.ids("alice")).toEqual(Array.from({ length: 20 }, (_, i) => 26 - i));
  });

  it("does not let a busy user evict a quiet user", () => {
    const store = openStore(join(tempDir(), "db", "app.db"), { retention: 3 });

    // Bob trains twice, months apart. Alice trains thirty times in between.
    put(store, "bob", 1);
    const bobIds = [store.ids("bob")[0]];
    for (let i = 1; i <= 30; i += 1) put(store, "alice", i);
    put(store, "bob", 2);
    bobIds.unshift(store.ids("bob")[0]);

    expect(store.count("alice")).toBe(3);
    // Bob is under the cap, so nothing of his was pruned — including the row
    // written before thirty of Alice's arrived. A global cap would have eaten it.
    expect(store.count("bob")).toBe(2);
    expect(store.ids("bob")).toEqual(bobIds);
    expect(store.latest("bob")?.historyLength).toBe(2);
    expect(store.latest("alice")?.historyLength).toBe(30);
  });

  it("reports how many rows the write pruned, counting only that user", () => {
    const store = openStore(join(tempDir(), "db", "app.db"), { retention: 2 });
    expect(put(store, "alice", 1).pruned).toBe(0);
    expect(put(store, "alice", 2).pruned).toBe(0);
    expect(put(store, "alice", 3).pruned).toBe(1);
    // Bob's first write prunes nothing, even though the table is at its
    // whole-table maximum for Alice.
    expect(put(store, "bob", 1).pruned).toBe(0);
    expect(store.count()).toBe(3);
  });

  it("prunes by id even when the clock goes backwards", () => {
    const store = openStore(join(tempDir(), "db", "app.db"), { retention: 2 });

    // Three writes, with the *newest* carrying the *oldest* timestamp — an NTP
    // correction between the second and the third. Pruning by `created_at` would
    // delete the newest snapshot and keep two stale ones; pruning by `id` keeps
    // what was actually written last.
    put(store, "alice", 1, "2026-03-01T06:00:00.000Z");
    put(store, "alice", 2, "2026-03-02T06:00:00.000Z");
    put(store, "alice", 3, "2020-01-01T00:00:00.000Z");

    expect(store.ids("alice")).toEqual([3, 2]);
    const latest = store.latest("alice");
    expect(latest?.historyLength).toBe(3);
    expect(latest?.createdAt).toBe("2020-01-01T00:00:00.000Z");
  });

  it('rejects a retention that would make "keep the newest N" meaningless', () => {
    expect(() => openSnapshotStore({ file: ":memory:", retention: 0 })).toThrow(/>= 1/);
    expect(() => openSnapshotStore({ file: ":memory:", retention: 1.5 })).toThrow(/whole number/);
  });
});

// ─── The store's own guard ──────────────────────────────────────────────────

describe("the store refuses a username it could not serve", () => {
  it("throws rather than creating a stream no request can name", () => {
    const store = openStore(":memory:");
    // Defence in depth — the service validates first. But a repair script or a
    // one-off import calling straight into the store must not be able to file
    // somebody's history under a name `?user=` can never match, because that is
    // a silently unreachable copy.
    for (const name of ["", "Alice", "x".repeat(33), "../etc", null, 7]) {
      expect(
        () => store.insert({ username: name as string, docJson: "{}", historyLength: 0, schemaVersion: 3 }),
        String(name),
      ).toThrow(/username must be/);
      expect(() => store.latest(name as string), String(name)).toThrow(/username must be/);
    }
    expect(store.count()).toBe(0);
  });

  it("counts and lists every stream when asked without a username", () => {
    const store = openStore(":memory:");
    put(store, "alice", 1);
    put(store, "bob", 1);
    put(store, "bob", 2);
    expect(store.count()).toBe(3);
    expect(store.count("bob")).toBe(2);
    expect(store.usernames()).toEqual(["alice", "bob"]);
    expect(store.ids()).toEqual([3, 2, 1]);
  });
});
