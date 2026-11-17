// The GitHub webhook on a test database: a signed push to a connected repository's default branch enqueues exactly
// one sync step per following account, a replayed delivery enqueues nothing more, and a bad signature, another branch
// or another event enqueue nothing.
import { createTestAccount } from "@softure-ai/auth/testing";
import { createTestClock } from "@softure-ai/core";
import type { TestDatabase } from "@softure-ai/db/testing";
import { createVaultTestDatabase } from "../testing/test-database.ts";
import { listJobs } from "@softure-ai/jobs/testing";
import { signWebhookRequest, WEBHOOK_SENDERS } from "@softure-ai/security";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import config from "../../../softure.config.ts";
import { saveGithubSource } from "../sources/store.ts";
import { getPushedDefaultBranchRepository, receiveGithubWebhook } from "./github-webhook.ts";
import { VAULT_SYNC_QUEUE } from "./sync-jobs.ts";

const SECRET = "test-webhook-secret-0123456789abcdef";
const URL = "https://vault.example.test/api/webhooks/github";
const REPOSITORY = { id: 501, fullName: "alice/notes", defaultBranch: "main" };

let database: TestDatabase;
let aliceId: string;
let bobId: string;

beforeEach(async () => {
  database = await createVaultTestDatabase(config.modules);
  aliceId = (await createTestAccount(database.db, { email: "alice@example.com", password: "a long test password" })).id;
  bobId = (await createTestAccount(database.db, { email: "bob@example.com", password: "a long test password" })).id;
});

afterEach(async () => {
  await database.close();
});

function context() {
  return { db: database.db, clock: createTestClock(new Date("2026-11-17T12:00:00Z")), config };
}

function pushBody(input: { readonly ref?: string; readonly repositoryId?: number } = {}): string {
  return JSON.stringify({
    ref: input.ref ?? "refs/heads/main",
    repository: { id: input.repositoryId ?? REPOSITORY.id, default_branch: "main", full_name: REPOSITORY.fullName },
  });
}

async function deliver(body: string, options: { readonly event?: string; readonly deliveryId?: string; readonly secret?: string } = {}) {
  const request = await signWebhookRequest({
    url: URL,
    sender: WEBHOOK_SENDERS.github,
    secret: options.secret ?? SECRET,
    body,
    deliveryId: options.deliveryId ?? "a1b2c3d4-0000-4000-8000-000000000001",
    headers: { "x-github-event": options.event ?? "push" },
  });
  return receiveGithubWebhook(context(), request, SECRET);
}

async function listSyncJobs() {
  return (await listJobs(database.db)).filter((job) => job.queue === VAULT_SYNC_QUEUE);
}

describe("receiveGithubWebhook", () => {
  it("enqueues one sync step for each account following the pushed repository", async () => {
    await saveGithubSource(database.db, { userId: aliceId, installationId: 7, repository: REPOSITORY, now: new Date() });
    await saveGithubSource(database.db, { userId: bobId, installationId: 8, repository: { ...REPOSITORY, id: 502 }, now: new Date() });

    const response = await deliver(pushBody());

    expect(response.status).toBe(200);
    const jobs = await listSyncJobs();
    expect(jobs.map((job) => job.payload)).toEqual([{ userId: aliceId, trigger: "webhook" }]);
  });

  it("enqueues nothing more for a replayed delivery", async () => {
    await saveGithubSource(database.db, { userId: aliceId, installationId: 7, repository: REPOSITORY, now: new Date() });

    expect((await deliver(pushBody())).status).toBe(200);
    expect((await deliver(pushBody())).status).toBe(200);

    expect(await listSyncJobs()).toHaveLength(1);
  });

  it("answers 401 and enqueues nothing when the signature does not verify", async () => {
    await saveGithubSource(database.db, { userId: aliceId, installationId: 7, repository: REPOSITORY, now: new Date() });

    const response = await deliver(pushBody(), { secret: "another-secret-0123456789abcdef0123" });

    expect(response.status).toBe(401);
    expect(await listSyncJobs()).toEqual([]);
  });

  it("enqueues nothing for a push to another branch or for another event", async () => {
    await saveGithubSource(database.db, { userId: aliceId, installationId: 7, repository: REPOSITORY, now: new Date() });

    expect((await deliver(pushBody({ ref: "refs/heads/draft" }), { deliveryId: "a1b2c3d4-0000-4000-8000-000000000002" })).status).toBe(200);
    expect((await deliver(JSON.stringify({ zen: "Keep it simple." }), { event: "ping", deliveryId: "a1b2c3d4-0000-4000-8000-000000000003" })).status).toBe(200);

    expect(await listSyncJobs()).toEqual([]);
  });
});

describe("getPushedDefaultBranchRepository", () => {
  it("accepts only a push to the repository's default branch", () => {
    const event = { ref: "refs/heads/main", repository: { id: 9, default_branch: "main" } };
    expect(getPushedDefaultBranchRepository("push", event)).toBe(9);
    expect(getPushedDefaultBranchRepository("push", { ...event, ref: "refs/tags/v1" })).toBeNull();
    expect(getPushedDefaultBranchRepository("installation", event)).toBeNull();
    expect(getPushedDefaultBranchRepository(null, event)).toBeNull();
    expect(getPushedDefaultBranchRepository("push", { ref: "refs/heads/main" })).toBeNull();
  });
});
