import { ok } from "@softure-ai/core";
import { defineJobHandler, type JobHandlers } from "@softure-ai/jobs";
import { enqueueJob } from "@softure-ai/jobs/server";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import config from "../../softure.config.ts";
import { VAULT_INDEX_QUEUE } from "../vault/index/index-queues.ts";
import { VAULT_ERASE_QUEUE } from "../vault/erase/erase-queues.ts";
import { VAULT_SYNC_QUEUE } from "../vault/sync/sync-queues.ts";
import { createVaultTestDatabase, type TestDatabase } from "../vault/testing/test-database.ts";
import { runVaultJobsNow, VAULT_KICK_WORKER } from "./vault-kick.ts";

let database: TestDatabase;

beforeAll(async () => {
  database = await createVaultTestDatabase(config.modules);
});

afterAll(async () => {
  await database.close();
});

const USER = "11111111-1111-4111-8111-111111111111";

function recordingHandlers(ran: string[]): JobHandlers {
  return {
    [VAULT_SYNC_QUEUE]: defineJobHandler({
      payload: z.object({ userId: z.string() }),
      run: async (payload, context) => {
        ran.push(`sync:${payload.userId}`);
        await enqueueJob(context, { queue: VAULT_INDEX_QUEUE, payload: { userId: payload.userId }, origin: "test" });
        return ok();
      },
    }),
    [VAULT_INDEX_QUEUE]: defineJobHandler({
      payload: z.object({ userId: z.string() }),
      run: (payload) => {
        ran.push(`index:${payload.userId}`);
        return Promise.resolve(ok());
      },
    }),
  };
}

describe("runVaultJobsNow", () => {
  it("runs the due sync step and the index step it enqueued in one call, leaving the other queues to the tick", async () => {
    const ctx = { db: database.db, clock: { now: () => new Date() }, config };
    await enqueueJob(ctx, { queue: VAULT_SYNC_QUEUE, payload: { userId: USER }, origin: "test" });
    await enqueueJob(ctx, { queue: VAULT_ERASE_QUEUE, payload: { userId: USER }, origin: "test" });
    const ran: string[] = [];

    const isHealthy = await runVaultJobsNow({ db: database.db, config, handlers: recordingHandlers(ran), budgetMs: 5_000 });

    expect(isHealthy).toBe(true);
    expect(ran).toEqual([`sync:${USER}`, `index:${USER}`]);
    const erase = await database.db.execute<{ status: string }>(sql`SELECT status FROM jobs.jobs WHERE queue = ${VAULT_ERASE_QUEUE}`);
    expect(erase.rows.map((row) => row.status)).toEqual(["pending"]);
    const heartbeat = await database.db.execute<{ worker_id: string }>(sql`SELECT worker_id FROM jobs.worker_heartbeats WHERE worker_id = ${VAULT_KICK_WORKER}`);
    expect(heartbeat.rows).toHaveLength(1);
  });

  it("answers false instead of throwing when the jobs cannot run", async () => {
    expect(await runVaultJobsNow({ db: database.db, config, handlers: {}, budgetMs: 1_000 })).toBe(false);
  });
});
