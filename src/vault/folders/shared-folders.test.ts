// Picking shared folders: the minimal set, which note paths a pick shares, and the store on a test database (a pick
// outside the tree refused, replacing and clearing, another account untouched, picks gone with the source or a new
// repository).
import { auth } from "@softure-ai/auth";
import { createTestAccount } from "@softure-ai/auth/testing";
import { createTestDatabase, type TestDatabase } from "@softure-ai/db/testing";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vault } from "../module.ts";
import { deleteSource, saveGithubSource } from "../sources/store.ts";
import { isPathShared, listSharedFolders, normalizeFolderPicks, saveSharedFolders } from "./shared-folders.ts";

const KNOWN = new Set(["Work", "Work/Clients", "Personal", "Personal/Health", "Archive"]);
const NOTES = { id: 501, fullName: "alice/notes", defaultBranch: "main" };
const T0 = new Date("2026-11-17T12:00:00Z");
const T1 = new Date("2026-11-17T13:00:00Z");

describe("a pick", () => {
  it("keeps the minimal set: duplicates and folders under a picked folder dropped, sorted", () => {
    expect(normalizeFolderPicks(["Work/Clients", "Personal", "Work", "Personal", "Workshop"])).toEqual(["Personal", "Work", "Workshop"]);
    expect(normalizeFolderPicks([])).toEqual([]);
  });

  it("shares notes inside a picked folder at any depth, and nothing else", () => {
    const picked = ["Work", "Personal/Health"];
    expect(isPathShared("Work/Plan.md", picked)).toBe(true);
    expect(isPathShared("Work/Clients/Acme/Notes.md", picked)).toBe(true);
    expect(isPathShared("Personal/Health/Doctor.md", picked)).toBe(true);
    expect(isPathShared("Personal/Diary.md", picked)).toBe(false);
    expect(isPathShared("Workshop/Tools.md", picked)).toBe(false);
    expect(isPathShared("Work.md", picked)).toBe(false);
    expect(isPathShared("Inbox.md", picked)).toBe(false);
    expect(isPathShared("Work/.drafts/Secret.md", picked)).toBe(false);
    expect(isPathShared("Work/Board.excalidraw.md", picked)).toBe(false);
    expect(isPathShared("Work/photo.png", picked)).toBe(false);
    expect(isPathShared("Work/Plan.md", [])).toBe(false);
  });
});

describe("the shared folders store", () => {
  let database: TestDatabase;
  let aliceId: string;
  let bobId: string;

  beforeEach(async () => {
    database = await createTestDatabase([auth(), vault()]);
    aliceId = (await createTestAccount(database.db, { email: "alice@example.com", password: "a long test password" })).id;
    bobId = (await createTestAccount(database.db, { email: "bob@example.com", password: "a long test password" })).id;
    for (const userId of [aliceId, bobId]) {
      await saveGithubSource(database.db, { userId, installationId: 7, repository: NOTES, now: T0 });
    }
  });

  afterEach(async () => {
    await database.close();
  });

  function save(userId: string, paths: string[], now = T0) {
    return saveSharedFolders(database.db, { userId, paths, knownFolders: KNOWN, now });
  }

  it("starts empty, saves exactly the picked set, and keeps a kept folder's first pick time", async () => {
    expect(await listSharedFolders(database.db, aliceId)).toEqual([]);

    expect(await save(aliceId, ["Work", "Personal/Health", "Work/Clients"])).toEqual({ ok: true, value: ["Personal/Health", "Work"] });
    expect(await save(aliceId, ["Work", "Archive"], T1)).toEqual({ ok: true, value: ["Archive", "Work"] });

    expect(await listSharedFolders(database.db, aliceId)).toEqual([
      { path: "Archive", pickedAt: T1 },
      { path: "Work", pickedAt: T0 },
    ]);
  });

  it("unticking everything shares nothing", async () => {
    await save(aliceId, ["Work"]);
    expect(await save(aliceId, [])).toEqual({ ok: true, value: [] });
    expect(await listSharedFolders(database.db, aliceId)).toEqual([]);
  });

  it("refuses a path that is not a folder of the tree, and changes nothing", async () => {
    await save(aliceId, ["Work"]);
    for (const crafted of ["Secret", "../bob", "/Work", "Work/", ".obsidian", "Work/../Personal", ""]) {
      expect(await save(aliceId, ["Archive", crafted])).toEqual({ ok: false, error: "vault.folder_unknown" });
    }
    expect((await listSharedFolders(database.db, aliceId)).map((folder) => folder.path)).toEqual(["Work"]);
  });

  it("leaves another account's picks untouched", async () => {
    await save(bobId, ["Personal"]);
    await save(aliceId, ["Work"]);
    await save(aliceId, []);
    expect((await listSharedFolders(database.db, bobId)).map((folder) => folder.path)).toEqual(["Personal"]);
  });

  it("refuses a pick without a source, and forgets the picks when the source goes or the repository changes", async () => {
    await save(aliceId, ["Work"]);
    await saveGithubSource(database.db, { userId: aliceId, installationId: 8, repository: NOTES, now: T1 });
    expect((await listSharedFolders(database.db, aliceId)).map((folder) => folder.path)).toEqual(["Work"]);

    await saveGithubSource(database.db, { userId: aliceId, installationId: 8, repository: { ...NOTES, id: 777, fullName: "alice/other" }, now: T1 });
    expect(await listSharedFolders(database.db, aliceId)).toEqual([]);

    await save(aliceId, ["Work"]);
    await deleteSource(database.db, aliceId);
    expect(await listSharedFolders(database.db, aliceId)).toEqual([]);
    expect(await save(aliceId, ["Work"])).toEqual({ ok: false, error: "vault.folder_no_source" });
  });

  it("holds the path rules in the database too", async () => {
    const source = await database.db.execute<{ id: string }>(sql`SELECT id FROM vault.sources WHERE user_id = ${aliceId}`);
    const sourceId = source.rows[0]?.id ?? "";
    for (const path of [".obsidian", "Work/.trash", "/Work", "Work/", "Work//Clients", ""]) {
      await expect(
        database.db.execute(sql`INSERT INTO vault.shared_folders (user_id, source_id, path, picked_at) VALUES (${aliceId}, ${sourceId}, ${path}, now())`),
      ).rejects.toThrow();
    }
  });
});
