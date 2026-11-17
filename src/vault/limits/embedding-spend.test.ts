// The embedding spend ledger: every successful call is recorded in metering under the account and the step, a call
// without an account or a failed call records nothing.
import { createTestAccount } from "@softure-ai/auth/testing";
import { createTestClock, err, ok, type ModuleContext } from "@softure-ai/core";
import type { Queryable } from "@softure-ai/db";
import type { TestDatabase } from "@softure-ai/db/testing";
import type { Embedder, EmbedRequest } from "@softure-ai/llm";
import { getSpend, getSpendBreakdown } from "@softure-ai/metering/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import config from "../../../softure.config.ts";
import { createVaultTestDatabase } from "../testing/test-database.ts";
import { EMBEDDING_PROVIDER, meterEmbedder } from "./embedding-spend.ts";

let database: TestDatabase;
let ctx: ModuleContext<Queryable>;
let aliceId: string;
let bobId: string;

beforeEach(async () => {
  database = await createVaultTestDatabase(config.modules);
  ctx = { db: database.db, clock: createTestClock(new Date("2026-11-17T12:00:00Z")), config };
  aliceId = (await createTestAccount(database.db, { email: "alice@example.com", password: "a long test password" })).id;
  bobId = (await createTestAccount(database.db, { email: "bob@example.com", password: "a long test password" })).id;
});

afterEach(async () => {
  await database.close();
});

/** A model that answers with one token per character of input, or fails when told to. */
function createCountingEmbedder(fails = false): Embedder {
  return {
    modelId: "test-embedding",
    dimensions: 2,
    embedTexts: (request: EmbedRequest) => {
      if (fails) return Promise.resolve(err("llm.unavailable"));
      const tokens = request.values.reduce((sum, value) => sum + value.length, 0);
      return Promise.resolve(
        ok({
          embeddings: request.values.map(() => [0, 1]),
          usage: { inputTokens: tokens, outputTokens: 0, totalTokens: tokens, cachedInputTokens: 0, reasoningTokens: 0 },
          model: "test-embedding",
          costUsd: null,
          costSource: null,
        }),
      );
    },
  };
}

async function spentBy(accountId: string): Promise<number> {
  const spend = await getSpend(ctx, { provider: EMBEDDING_PROVIDER, period: "month", accountId });
  return spend.value.spent;
}

describe("the metered embedder", () => {
  it("records each call's input tokens under its account and step", async () => {
    const indexing = meterEmbedder(createCountingEmbedder(), ctx, "index");
    const searching = meterEmbedder(createCountingEmbedder(), ctx, "search");
    expect((await indexing.embedTexts({ values: ["abcd", "ef"], attributes: { userId: aliceId } })).ok).toBe(true);
    expect((await searching.embedTexts({ values: ["xyz"], attributes: { userId: aliceId } })).ok).toBe(true);
    expect((await searching.embedTexts({ values: ["q"], attributes: { userId: bobId } })).ok).toBe(true);
    expect(await spentBy(aliceId)).toBe(9);
    expect(await spentBy(bobId)).toBe(1);
    const steps = await getSpendBreakdown(ctx, { provider: EMBEDDING_PROVIDER, period: "month", accountId: aliceId, groupBy: "step" });
    expect(steps.value.rows.map((row) => [row.key, row.spent])).toEqual([
      ["index", 6],
      ["search", 3],
    ]);
  });

  it("records nothing for a call without an account, an empty call or a failed call", async () => {
    expect((await meterEmbedder(createCountingEmbedder(), ctx, "index").embedTexts({ values: ["abcd"] })).ok).toBe(true);
    expect((await meterEmbedder(createCountingEmbedder(), ctx, "index").embedTexts({ values: [], attributes: { userId: aliceId } })).ok).toBe(true);
    expect((await meterEmbedder(createCountingEmbedder(true), ctx, "index").embedTexts({ values: ["abcd"], attributes: { userId: aliceId } })).ok).toBe(false);
    expect(await spentBy(aliceId)).toBe(0);
    expect((await getSpend(ctx, { provider: EMBEDDING_PROVIDER, period: "month" })).value.spent).toBe(0);
  });

  it("keeps the model's id and dimensions", () => {
    const metered = meterEmbedder(createCountingEmbedder(), ctx, "search");
    expect([metered.modelId, metered.dimensions]).toEqual(["test-embedding", 2]);
  });
});
