import { createTestAccount } from "@softure-ai/auth/testing";
import { createTestDatabase, type TestDatabase } from "@softure-ai/db/testing";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import config from "../../../softure.config.ts";
import { getVaultDescription, MAX_VAULT_DESCRIPTION_LENGTH, normalizeVaultDescription, saveVaultDescription } from "./vault-description.ts";

const NOW = new Date("2026-11-17T12:00:00Z");
let database: TestDatabase;
let aliceId: string;
let bobId: string;

beforeEach(async () => {
  database = await createTestDatabase(config.modules);
  aliceId = (await createTestAccount(database.db, { email: "alice@example.com", password: "a long test password" })).id;
  bobId = (await createTestAccount(database.db, { email: "bob@example.com", password: "a long test password" })).id;
});

afterEach(async () => {
  await database.close();
});

describe("the account's sentence about its vault", () => {
  it("is empty until the account writes one, and each account reads only its own", async () => {
    expect(await getVaultDescription(database.db, aliceId)).toBe("");
    expect(await saveVaultDescription(database.db, { userId: aliceId, description: "  Work notes:\n clients ", now: NOW })).toEqual({ ok: true, value: "Work notes: clients" });
    expect(await getVaultDescription(database.db, aliceId)).toBe("Work notes: clients");
    expect(await getVaultDescription(database.db, bobId)).toBe("");
  });

  it("replaces the sentence on a second save and removes the row when it is emptied", async () => {
    await saveVaultDescription(database.db, { userId: aliceId, description: "First", now: NOW });
    await saveVaultDescription(database.db, { userId: aliceId, description: "Second", now: NOW });
    expect(await getVaultDescription(database.db, aliceId)).toBe("Second");
    await saveVaultDescription(database.db, { userId: aliceId, description: "   ", now: NOW });
    const rows = await database.db.execute(sql`SELECT count(*)::int AS count FROM connector.profiles`);
    expect(rows.rows[0]).toEqual({ count: 0 });
  });

  it("accepts exactly the limit and refuses one character more, keeping the saved sentence", async () => {
    await saveVaultDescription(database.db, { userId: aliceId, description: "Kept", now: NOW });
    const atLimit = "\u017C".repeat(MAX_VAULT_DESCRIPTION_LENGTH);
    expect((await saveVaultDescription(database.db, { userId: bobId, description: atLimit, now: NOW })).ok).toBe(true);
    expect(await saveVaultDescription(database.db, { userId: aliceId, description: `${atLimit}x`, now: NOW })).toEqual({ ok: false, error: "connector.description_too_long" });
    expect(await getVaultDescription(database.db, aliceId)).toBe("Kept");
  });

  it("is limited by the database too, not only by the code", async () => {
    await expect(
      database.db.execute(sql`INSERT INTO connector.profiles (user_id, vault_description, updated_at) VALUES (${aliceId}, ${"x".repeat(301)}, now())`),
    ).rejects.toThrow();
  });

  it("goes with the account when the account is deleted", async () => {
    await saveVaultDescription(database.db, { userId: aliceId, description: "Mine", now: NOW });
    await database.db.execute(sql`DELETE FROM auth.users WHERE id = ${aliceId}`);
    const rows = await database.db.execute(sql`SELECT count(*)::int AS count FROM connector.profiles`);
    expect(rows.rows[0]).toEqual({ count: 0 });
  });
});

describe("normalizeVaultDescription", () => {
  it("turns control characters and whitespace runs into one space and trims the ends", () => {
    expect(normalizeVaultDescription("\tA\u0000\u0007b\r\n  c ")).toBe("A b c");
  });
});
