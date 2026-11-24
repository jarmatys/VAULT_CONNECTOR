// An account's export and deletion end to end on a test database (VC-16, FR-20): two fictional accounts with synced
// and indexed notes, a sentence about the vault and an assistant token. Deleting one leaves no row of it in any
// schema, no copy in the store once the erase job ran, and its old token refused, while the other account still reads.
import type { ModuleContext } from "@softure-ai/core";
import type { Queryable } from "@softure-ai/db";
import { runDueJobs } from "@softure-ai/jobs/testing";
import { createMcpEndpoint, issueAccessToken } from "@softure-ai/mcp-access/server";
import { generateConnectionsKey } from "@softure-ai/connections/server";
import { collectUserData, EMAIL_KEY_SECRET_ENV, eraseUserData } from "@softure-ai/privacy/server";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import config from "../../../softure.config.ts";
import { saveVaultDescription } from "../../mcp/profile/vault-description.ts";
import { createVaultServerFactory } from "../../mcp/server.ts";
import { createVaultFixture, KEY_SECRET, type VaultFixture } from "../../mcp/testing/vault-fixture.ts";
import { createVaultIndexJobHandlers, VAULT_INDEX_QUEUE } from "../index/index-jobs.ts";
import { readSourceKeyring } from "../sources/s3/s3-credentials.ts";
import { sealDropboxRefreshToken } from "../sources/dropbox/dropbox-credentials.ts";
import { saveDropboxSource } from "../sources/store.ts";
import { deriveAccountPrefix } from "../storage/note-storage.ts";
import { VAULT_STORAGE_DIR_ENV, VAULT_STORAGE_KEY_SECRET_ENV } from "../storage/storage-settings.ts";
import { createVaultEraseJobHandlers, listQueuedErasures, VAULT_ERASE_QUEUE } from "./erase-jobs.ts";
import { ERASE_DELAY_SECONDS } from "./erase-queues.ts";
import { deleteVaultUserData } from "./vault-privacy.ts";

const ALICE_VAULT = {
  "Work/Plan.md": "---\ntitle: The plan\ntags: [q4]\n---\nALICE-WORK: ship the report on Friday.",
  "Work/Clients/Acme.md": "# Acme\nALICE-CLIENT notes.",
  "Personal/Diary.md": "ALICE-PRIVATE: not shared.",
};
const BOB_VAULT = { "Work/Plan.md": "BOB-SECRET: Bob's own plan.", "Notes/Ideas.md": "BOB-SECRET ideas" };

let fixture: VaultFixture;
let ctx: ModuleContext<Queryable>;
let aliceId: string;
let bobId: string;

beforeEach(async () => {
  vi.stubEnv(VAULT_STORAGE_KEY_SECRET_ENV, KEY_SECRET);
  // privacy keys the consents of an account's address with it when it erases or exports the account.
  vi.stubEnv(EMAIL_KEY_SECRET_ENV, "test-email-key-secret-0123456789abcdef");
  vi.stubEnv(VAULT_STORAGE_DIR_ENV, "/nonexistent/vault-copies");
  fixture = await createVaultFixture();
  ctx = { db: fixture.database.db, clock: fixture.clock, config };
  aliceId = await fixture.createAccount("alice@example.com");
  bobId = await fixture.createAccount("bob@example.com");
  await fixture.connect(aliceId, ALICE_VAULT, ["Work"]);
  await fixture.connect(bobId, BOB_VAULT, ["Work", "Notes"]);
  const index = await runDueJobs(ctx, {
    handlers: createVaultIndexJobHandlers({ storage: { storage: fixture.storage, keySecret: KEY_SECRET }, embedder: null }),
    queues: [VAULT_INDEX_QUEUE],
    random: () => 0,
  });
  expect(index.failed).toBe(0);
  await saveVaultDescription(ctx.db, { userId: aliceId, description: "My work notes.", now: fixture.clock.now() });
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fixture.close();
});

/** Every row in any schema that holds the account's id in a `user_id` column, by table. */
async function countRowsOf(userId: string): Promise<Record<string, number>> {
  const columns = await ctx.db.execute<{ table_schema: string; table_name: string }>(sql`
    SELECT c.table_schema, c.table_name FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.column_name = 'user_id' AND c.table_schema NOT IN ('pg_catalog', 'information_schema')`);
  const counts: Record<string, number> = {};
  for (const { table_schema: schema, table_name: table } of columns.rows) {
    const result = await ctx.db.execute<{ count: number }>(sql.raw(`SELECT count(*)::int AS count FROM "${schema}"."${table}" WHERE user_id::text = '${userId}'`));
    const count = Number(result.rows[0]?.count ?? 0);
    if (count > 0) counts[`${schema}.${table}`] = count;
  }
  const users = await ctx.db.execute<{ count: number }>(sql`SELECT count(*)::int AS count FROM auth.users WHERE id = ${userId}`);
  if (Number(users.rows[0]?.count ?? 0) > 0) counts["auth.users"] = 1;
  return counts;
}

function objectsUnder(userId: string): string[] {
  const prefix = `v1/${deriveAccountPrefix(KEY_SECRET, userId)}/`;
  return [...fixture.storage.objects().keys()].filter((key) => key.startsWith(prefix));
}

async function callTools(token: string): Promise<{ status: number; text: string }> {
  const endpoint = createMcpEndpoint({ createServer: createVaultServerFactory(() => Promise.resolve(fixture.readContext)) });
  const response = await endpoint(
    ctx,
    new Request(`${config.appOrigin}/api/mcp`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-06-18",
        "cf-connecting-ip": "203.0.113.9",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_note", arguments: { path: "Work/Plan.md" } } }),
    }),
  );
  return { status: response.status, text: await response.text() };
}

async function runEraseJobs(storage = fixture.storage, batch?: number) {
  return runDueJobs(ctx, {
    handlers: createVaultEraseJobHandlers({ storage, ...(batch === undefined ? {} : { batch }) }),
    queues: [VAULT_ERASE_QUEUE],
    random: () => 0,
  });
}

async function issueToken(userId: string): Promise<string> {
  const issued = await issueAccessToken(ctx, { userId, name: "CLI", canWrite: false });
  if (!issued.ok) throw new Error(issued.error);
  return issued.value.token;
}

describe("deleting an account", () => {
  it("leaves no row, copy or token of the account, and the other account still reads its notes", async () => {
    const aliceToken = await issueToken(aliceId);
    const bobToken = await issueToken(bobId);
    expect((await callTools(aliceToken)).text).toContain("ALICE-WORK");
    const before = await countRowsOf(aliceId);
    expect(before).toMatchObject({ "vault.sources": 1, "vault.shared_folders": 1, "vault.notes": 2, "connector.profiles": 1 });
    expect(before["vault.passages"]).toBeGreaterThan(0);
    expect(before["mcp.access_tokens"]).toBe(1);
    expect(objectsUnder(aliceId)).toHaveLength(2);
    const bobObjects = objectsUnder(bobId);
    expect(bobObjects).toHaveLength(2);

    const erased = await eraseUserData(ctx, aliceId);
    expect(erased.ok).toBe(true);

    expect(await countRowsOf(aliceId)).toEqual({});
    expect(await listQueuedErasures(ctx.db, { limit: 10 })).toHaveLength(2);
    expect((await callTools(aliceToken)).status).toBe(401);

    // The copies go once the erase job is due, after the sync lease.
    expect((await runEraseJobs()).failed).toBe(0);
    expect(objectsUnder(aliceId)).toHaveLength(2);
    fixture.clock.advance((ERASE_DELAY_SECONDS + 1) * 1000);
    const report = await runEraseJobs();
    expect(report.failed).toBe(0);
    expect(objectsUnder(aliceId)).toEqual([]);
    expect(await listQueuedErasures(ctx.db, { limit: 10 })).toEqual([]);

    expect(objectsUnder(bobId)).toEqual(bobObjects);
    const bob = await callTools(bobToken);
    expect(bob.status).toBe(200);
    expect(bob.text).toContain("BOB-SECRET");
    expect(await countRowsOf(bobId)).toMatchObject({ "vault.notes": 2, "vault.sources": 1 });
  });

  it("queues the copies an open run planned but has not recorded yet", async () => {
    await ctx.db.execute(sql`
      INSERT INTO vault.sync_runs (user_id, status, trigger, target_cursor, planned_copies, started_at)
      VALUES (${aliceId}, 'running', 'webhook', 'c2', 1, ${fixture.clock.now().toISOString()})`);
    await ctx.db.execute(sql`
      INSERT INTO vault.sync_items (run_id, path, action, version, size)
      SELECT id, 'Work/New.md', 'copy', 'v9', 10 FROM vault.sync_runs WHERE user_id = ${aliceId} AND status = 'running'`);
    expect((await eraseUserData(ctx, aliceId)).ok).toBe(true);
    expect(await listQueuedErasures(ctx.db, { limit: 10 })).toHaveLength(3);
  });

  it("queues nothing without a configured store, and still deletes every row", async () => {
    const result = await deleteVaultUserData(ctx, aliceId, () => null);
    expect(result.ok).toBe(true);
    expect(await listQueuedErasures(ctx.db, { limit: 10 })).toEqual([]);
    const left = await countRowsOf(aliceId);
    expect(Object.keys(left).filter((table) => table.startsWith("vault."))).toEqual([]);
  });
});

describe("the erase job", () => {
  it("continues itself in batches until the queue is empty", async () => {
    expect((await eraseUserData(ctx, aliceId)).ok).toBe(true);
    fixture.clock.advance((ERASE_DELAY_SECONDS + 1) * 1000);
    const report = await runEraseJobs(fixture.storage, 1);
    expect(report.failed).toBe(0);
    expect(await listQueuedErasures(ctx.db, { limit: 10 })).toEqual([]);
    expect(objectsUnder(aliceId)).toEqual([]);
  });

  it("keeps the keys when the store fails or is not configured", async () => {
    expect((await eraseUserData(ctx, aliceId)).ok).toBe(true);
    fixture.clock.advance((ERASE_DELAY_SECONDS + 1) * 1000);
    fixture.storage.setFailing(true);
    expect((await runEraseJobs()).retried).toBeGreaterThan(0);
    expect(await listQueuedErasures(ctx.db, { limit: 10 })).toHaveLength(2);
    fixture.storage.setFailing(false);
    fixture.clock.advance(2 * 3600 * 1000);
    const unconfigured = await runDueJobs(ctx, { handlers: createVaultEraseJobHandlers({ storage: null }), queues: [VAULT_ERASE_QUEUE], random: () => 0 });
    expect(unconfigured.failed).toBeGreaterThan(0);
    expect(await listQueuedErasures(ctx.db, { limit: 10 })).toHaveLength(2);
  });
});

describe("exporting an account", () => {
  it("carries the vault and connector parts by path, without note text or secrets", async () => {
    const collected = await collectUserData(ctx, aliceId);
    if (!collected.ok) throw new Error(collected.error);
    const data = collected.value.document.data;
    expect(data.connector).toEqual({ vaultDescription: "My work notes.", updatedAt: "2026-11-17T12:00:30.000Z" });
    const vaultPart = data.vault as {
      source: Record<string, unknown>;
      sharedFolders: { path: string }[];
      copiedNotes: { path: string; indexedAt: string | null }[];
      syncRuns: { status: string }[];
    };
    expect(vaultPart.source).toMatchObject({ kind: "github", status: "connected", repository: "example/vault-1", branch: "main" });
    expect(vaultPart.sharedFolders.map(({ path }) => path)).toEqual(["Work"]);
    expect(vaultPart.copiedNotes.map(({ path }) => path)).toEqual(["Work/Clients/Acme.md", "Work/Plan.md"]);
    expect(vaultPart.copiedNotes.every(({ indexedAt }) => indexedAt !== null)).toBe(true);
    expect(vaultPart.syncRuns.map(({ status }) => status)).toEqual(["succeeded"]);
    const text = collected.value.json;
    expect(text).not.toContain("ALICE-WORK");
    expect(text).not.toContain("The plan");
    expect(text).not.toContain("BOB");
    expect(text).not.toContain("installation");
  });

  it("names a Dropbox source by its folder, without its account id or sealed token", async () => {
    const keyring = readSourceKeyring({ VAULT_SOURCE_KEYS: generateConnectionsKey("test") });
    if (keyring === null) throw new Error("no keyring");
    const sealed = sealDropboxRefreshToken(keyring, bobId, "refresh-fictional-token");
    await saveDropboxSource(ctx.db, { userId: bobId, accountId: "dbid:AAFictionalAccount0001", folder: "/Obsidian/Vault", sealedCredentials: sealed, now: fixture.clock.now() });
    const collected = await collectUserData(ctx, bobId);
    if (!collected.ok) throw new Error(collected.error);
    expect((collected.value.document.data.vault as { source: unknown }).source).toEqual({
      kind: "dropbox",
      status: "connected",
      folder: "/Obsidian/Vault",
      connectedAt: "2026-11-17T12:00:30.000Z",
      checkedAt: "2026-11-17T12:00:30.000Z",
      disconnectedAt: null,
    });
    expect(collected.value.json).not.toContain("dbid:");
    expect(collected.value.json).not.toContain(sealed);
  });
});
