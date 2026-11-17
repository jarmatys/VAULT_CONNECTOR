// The monthly search allowance on a test database: the limit from the environment, one request per search, a refusal
// with the reset date at the limit, a failed search that does not count, and 0 that stops search.
import { createTestAccount } from "@softure-ai/auth/testing";
import { createTestClock, type ModuleContext } from "@softure-ai/core";
import type { Queryable } from "@softure-ai/db";
import type { TestDatabase } from "@softure-ai/db/testing";
import { setBudgetLimit } from "@softure-ai/metering/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import config from "../../softure.config.ts";
import { createVaultTestDatabase } from "../vault/testing/test-database.ts";
import { DEFAULT_SEARCHES_PER_MONTH, getSearchUsage, readSearchesPerMonth, SEARCH_PROVIDER, searchMeteringProvider, withSearchAllowance } from "./search-allowance.ts";

let database: TestDatabase;
let ctx: ModuleContext<Queryable>;
let userId: string;

beforeEach(async () => {
  database = await createVaultTestDatabase(config.modules);
  ctx = { db: database.db, clock: createTestClock(new Date("2026-11-30T23:59:00Z")), config };
  userId = (await createTestAccount(database.db, { email: "alice@example.com", password: "a long test password" })).id;
});

afterEach(async () => {
  await database.close();
});

describe("the configured limit", () => {
  it("reads a whole number, and falls back to the default for anything else", () => {
    expect(readSearchesPerMonth({})).toBe(DEFAULT_SEARCHES_PER_MONTH);
    expect(readSearchesPerMonth({ SEARCHES_PER_MONTH: " 250 " })).toBe(250);
    expect(readSearchesPerMonth({ SEARCHES_PER_MONTH: "0" })).toBe(0);
    expect(readSearchesPerMonth({ SEARCHES_PER_MONTH: "-5" })).toBe(DEFAULT_SEARCHES_PER_MONTH);
    expect(readSearchesPerMonth({ SEARCHES_PER_MONTH: "1.5" })).toBe(DEFAULT_SEARCHES_PER_MONTH);
    expect(readSearchesPerMonth({ SEARCHES_PER_MONTH: "many" })).toBe(DEFAULT_SEARCHES_PER_MONTH);
    expect(readSearchesPerMonth({ SEARCHES_PER_MONTH: "9".repeat(20) })).toBe(1e15);
  });

  it("declares one per-account month budget in requests", () => {
    expect(searchMeteringProvider({ SEARCHES_PER_MONTH: "40" })).toEqual({
      id: SEARCH_PROVIDER,
      unit: "requests",
      budgets: [{ period: "month", limit: 40, perAccount: true }],
    });
  });
});

describe("counting searches", () => {
  it("counts one per search and refuses at the limit with the reset date", async () => {
    await setBudgetLimit(ctx, { provider: SEARCH_PROVIDER, period: "month", perAccount: true, limit: 1 });
    expect(await withSearchAllowance(ctx, userId, () => Promise.resolve("hits"))).toEqual({ kind: "searched", value: "hits" });
    let ran = false;
    const refused = await withSearchAllowance(ctx, userId, () => ((ran = true), Promise.resolve("hits")));
    expect(ran).toBe(false);
    expect(refused).toEqual({ kind: "refused", usage: { used: 1, limit: 1, resetsAt: new Date("2026-12-01T00:00:00Z") } });
    expect(await getSearchUsage(ctx, userId)).toEqual({ used: 1, limit: 1, resetsAt: new Date("2026-12-01T00:00:00Z") });
  });

  it("does not count a search that failed, and lets the error through", async () => {
    await expect(withSearchAllowance(ctx, userId, () => Promise.reject(new Error("database down")))).rejects.toThrow("database down");
    expect((await getSearchUsage(ctx, userId)).used).toBe(0);
  });

  it("stops every search at a limit of 0", async () => {
    await setBudgetLimit(ctx, { provider: SEARCH_PROVIDER, period: "month", perAccount: true, limit: 0 });
    expect((await withSearchAllowance(ctx, userId, () => Promise.resolve(1))).kind).toBe("refused");
  });
});
