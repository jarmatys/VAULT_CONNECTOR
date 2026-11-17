// The monthly search allowance of the account's plan on a test database: one `searches` per search, a refusal with the
// reset date at the plan's limit, a failed search that does not count, a new month that starts from 0, a paid plan's
// larger allowance, and the read-only state that stops search.
import { createTestAccount } from "@softure-ai/auth/testing";
import { consumeUsage, grantPlanManually } from "@softure-ai/billing/server";
import { createTestClock, type ModuleContext, type TestClock } from "@softure-ai/core";
import type { Queryable } from "@softure-ai/db";
import type { TestDatabase } from "@softure-ai/db/testing";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import config from "../../softure.config.ts";
import { METERS, PAID_LIMITS, TRIAL_LIMITS } from "../lib/plans.ts";
import { createVaultTestDatabase } from "../vault/testing/test-database.ts";
import { getSearchUsage, withSearchAllowance } from "./search-allowance.ts";

const T0 = new Date("2026-11-17T12:00:00Z");

let database: TestDatabase;
let clock: TestClock;
let ctx: ModuleContext<Queryable>;
let userId: string;

beforeEach(async () => {
  database = await createVaultTestDatabase(config.modules);
  clock = createTestClock(T0);
  ctx = { db: database.db, clock, config };
  userId = (await createTestAccount(database.db, { email: "alice@example.com", password: "a long test password", createdAt: T0 })).id;
});

afterEach(async () => {
  await database.close();
});

/** Uses all but `left` of the account's searches this month. */
async function useAllBut(left: number, limit: number): Promise<void> {
  const used = await consumeUsage(ctx, { userId, meter: METERS.searches, amount: limit - left });
  expect(used.ok).toBe(true);
}

describe("counting searches", () => {
  it("counts one per search and refuses at the trial's limit with the reset date", async () => {
    await useAllBut(1, TRIAL_LIMITS.searches ?? 0);
    expect(await withSearchAllowance(ctx, userId, () => Promise.resolve("hits"))).toEqual({ kind: "searched", value: "hits" });
    let ran = false;
    const refused = await withSearchAllowance(ctx, userId, () => ((ran = true), Promise.resolve("hits")));
    expect(ran).toBe(false);
    expect(refused).toEqual({ kind: "refused", usage: { used: 1000, limit: 1000, resetsAt: new Date("2026-12-01T00:00:00Z") } });
    expect(await getSearchUsage(ctx, userId)).toEqual({ used: 1000, limit: 1000, resetsAt: new Date("2026-12-01T00:00:00Z") });
  });

  it("does not count a search that failed, and lets the error through", async () => {
    await expect(withSearchAllowance(ctx, userId, () => Promise.reject(new Error("database down")))).rejects.toThrow("database down");
    expect((await getSearchUsage(ctx, userId)).used).toBe(0);
  });

  it("runs the search on the transaction that counts it", async () => {
    const outcome = await withSearchAllowance(ctx, userId, async (db) => {
      // The count is visible inside the transaction before it commits.
      const result = await db.execute<{ used: number }>(sql`SELECT used FROM billing.usage WHERE user_id = ${userId}`);
      return Number(result.rows[0]?.used);
    });
    expect(outcome).toEqual({ kind: "searched", value: 1 });
  });

  it("starts each month from 0", async () => {
    await useAllBut(0, TRIAL_LIMITS.searches ?? 0);
    expect((await withSearchAllowance(ctx, userId, () => Promise.resolve(1))).kind).toBe("refused");
    clock.set(new Date("2026-12-01T00:00:01Z"));
    // The trial ended with November: grant a plan so the account still searches in December.
    expect((await grantPlanManually(ctx, { userId, planId: "monthly", adminId: null })).ok).toBe(true);
    expect((await withSearchAllowance(ctx, userId, () => Promise.resolve(1))).kind).toBe("searched");
    expect(await getSearchUsage(ctx, userId)).toEqual({ used: 1, limit: PAID_LIMITS.searches, resetsAt: new Date("2027-01-01T00:00:00Z") });
  });

  it("gives a paid plan its larger allowance", async () => {
    expect((await grantPlanManually(ctx, { userId, planId: "yearly", adminId: null })).ok).toBe(true);
    await useAllBut(1, PAID_LIMITS.searches ?? 0);
    expect((await withSearchAllowance(ctx, userId, () => Promise.resolve(1))).kind).toBe("searched");
    expect((await withSearchAllowance(ctx, userId, () => Promise.resolve(1))).kind).toBe("refused");
  });

  it("stops every search once access ended", async () => {
    clock.set(new Date("2026-12-02T00:00:00Z"));
    const refused = await withSearchAllowance(ctx, userId, () => Promise.resolve(1));
    expect(refused).toEqual({ kind: "refused", usage: { used: 0, limit: 0, resetsAt: new Date("2027-01-01T00:00:00Z") } });
  });
});
