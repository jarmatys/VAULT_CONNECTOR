// The folder picker of an account, read through the real git adapter from the fake GitHub App's repository: no source,
// the tree with picks and picks gone from the vault, a removed installation, an outage, and an instance without an App.
import { auth } from "@softure-ai/auth";
import { createTestAccount } from "@softure-ai/auth/testing";
import type { TestDatabase } from "@softure-ai/db/testing";
import { createVaultTestDatabase } from "../testing/test-database.ts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vault } from "../module.ts";
import { createAccountGithubSource } from "../sources/github/link.ts";
import { saveGithubSource } from "../sources/store.ts";
import { createFakeGithub, type FakeGithub } from "../testing/fake-github.ts";
import { isIncludedByParent, loadFolderPicker } from "./load-folders.ts";
import { saveSharedFolders } from "./shared-folders.ts";

const NOTES = { id: 501, fullName: "alice/notes", defaultBranch: "main" };
const NOW = new Date("2026-11-17T12:00:00Z");
const VAULT = {
  "Inbox.md": "# Inbox",
  "Work/Plan.md": "# Plan",
  "Work/Clients/Acme.md": "# Acme",
  "Personal/Diary.md": "# Diary",
  "Attachments/photo.png": "png",
  ".obsidian/app.json": "{}",
};

let database: TestDatabase;
let github: FakeGithub;
let installationId: number;
let aliceId: string;

beforeEach(async () => {
  database = await createVaultTestDatabase([auth(), vault()]);
  github = createFakeGithub();
  installationId = github.app.createInstallation({ account: { login: "alice" }, userIds: [1001], repositories: [{ ...NOTES, files: VAULT }] });
  aliceId = (await createTestAccount(database.db, { email: "alice@example.com", password: "a long test password" })).id;
});

afterEach(async () => {
  await database.close();
});

function load(ctx: { settings: FakeGithub["settings"]; fetch: FakeGithub["fetch"] } | null = { settings: github.settings, fetch: github.fetch }) {
  return loadFolderPicker(database.db, (source) => (ctx === null || source.kind !== "github" ? null : createAccountGithubSource(ctx, source)), aliceId);
}

describe("the folder picker", () => {
  it("has nothing to show before a source is connected", async () => {
    expect(await load()).toEqual({ kind: "no_source" });
  });

  it("shows the vault's folders with note counts and nothing ticked, then the account's picks", async () => {
    await saveGithubSource(database.db, { userId: aliceId, installationId, repository: NOTES, now: NOW });

    const first = await load();
    if (first.kind !== "ready") throw new Error(`expected ready, got ${first.kind}`);
    expect(first.tree.folders.map((folder) => [folder.path, folder.noteCount, folder.children.map((child) => child.path)])).toEqual([
      ["Personal", 1, []],
      ["Work", 2, ["Work/Clients"]],
    ]);
    expect([first.tree.topLevelNoteCount, first.picked, first.missing]).toEqual([1, [], []]);

    await saveSharedFolders(database.db, { userId: aliceId, paths: ["Work", "Personal"], knownFolders: first.tree.paths, now: NOW });
    github.app.commitFiles(NOTES.fullName, { "Work/Plan.md": "# Plan", "Journal/Today.md": "# Today" });

    const second = await load();
    if (second.kind !== "ready") throw new Error(`expected ready, got ${second.kind}`);
    expect(second.tree.folders.map((folder) => folder.path)).toEqual(["Journal", "Work"]);
    expect([second.picked, second.missing]).toEqual([["Work"], ["Personal"]]);
  });

  it("says the source is disconnected once the App is removed on GitHub", async () => {
    await saveGithubSource(database.db, { userId: aliceId, installationId, repository: NOTES, now: NOW });
    github.app.uninstall(installationId);
    expect(await load()).toMatchObject({ kind: "disconnected" });
  });

  it("names a source failure, and says when this instance has no GitHub App", async () => {
    await saveGithubSource(database.db, { userId: aliceId, installationId, repository: NOTES, now: NOW });
    github.app.failNext("unavailable");
    expect(await load()).toMatchObject({ kind: "failed", error: "source.unavailable" });
    expect(await load(null)).toEqual({ kind: "unconfigured" });
  });
});

describe("a folder under a picked folder", () => {
  it("is included by its parent, and a sibling with a shared prefix is not", () => {
    expect(isIncludedByParent("Work/Clients", ["Work"])).toBe(true);
    expect(isIncludedByParent("Work", ["Work"])).toBe(false);
    expect(isIncludedByParent("Workshop", ["Work"])).toBe(false);
  });
});
