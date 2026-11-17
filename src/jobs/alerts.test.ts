// The operator's alerts on a test database, run through the jobs as the worker runs them: three failed syncs in a row
// for one account send one alert and the next good sync one recovery, with fake time; another account's failures count
// apart; a failure below three sends nothing; the heartbeat logs its line; the settings read the operator's values.
import { createTestAccount } from "@softure-ai/auth/testing";
import { listRecentAlerts } from "@softure-ai/alerts/server";
import { createTestClock, type TestClock } from "@softure-ai/core";
import { createTestDatabase, type TestDatabase } from "@softure-ai/db/testing";
import { createMemoryStorage, type MemoryStorage } from "@softure-ai/files/testing";
import { listJobs, runDueJobs } from "@softure-ai/jobs/testing";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import config from "../../softure.config.ts";
import { saveSharedFolders } from "../vault/folders/shared-folders.ts";
import { saveGithubSource } from "../vault/sources/store.ts";
import { createVaultSyncJobHandlers, enqueueVaultSync, VAULT_SYNC_QUEUE } from "../vault/sync/sync-jobs.ts";
import { createFakeSource, type FakeSource } from "../vault/testing/fake-source.ts";
import { readOperatorAlertSettings } from "./alert-settings.ts";
import { getSyncAlertKey, HEARTBEAT_LOG_LINE, OPERATOR_HEARTBEAT_QUEUE, operatorJobHandlers, recordSyncOutcome } from "./alerts.ts";

const SECRET = "test-key-secret-0123456789abcdef0123";
const T0 = new Date("2026-11-17T12:00:30Z");
const REPOSITORY = { id: 501, fullName: "alice/notes", defaultBranch: "main" };
const DELIVER_QUEUE = "alerts.deliver";

let database: TestDatabase;
let clock: TestClock;
let storage: MemoryStorage;
let sources: Map<string, FakeSource>;
let aliceId: string;
let bobId: string;

beforeEach(async () => {
  database = await createTestDatabase(config.modules);
  clock = createTestClock(T0);
  storage = createMemoryStorage();
  sources = new Map();
  aliceId = (await createTestAccount(database.db, { email: "alice@example.com", password: "a long test password" })).id;
  bobId = (await createTestAccount(database.db, { email: "bob@example.com", password: "a long test password" })).id;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await database.close();
});

function jobsContext() {
  return { db: database.db, clock, config };
}

const handlers = () =>
  createVaultSyncJobHandlers({
    storage: { storage, keySecret: SECRET },
    openSource: (source) => sources.get(source.id) ?? null,
    onSyncOutcome: recordSyncOutcome,
  });

async function connect(userId: string): Promise<FakeSource> {
  const stored = await saveGithubSource(database.db, { userId, installationId: 7, repository: REPOSITORY, now: clock.now() });
  const source = createFakeSource({ "Work/Plan.md": "# Plan" });
  sources.set(stored.id, source);
  const saved = await saveSharedFolders(database.db, { userId, paths: ["Work"], knownFolders: new Set(["Work"]), now: clock.now() });
  expect(saved.ok).toBe(true);
  return source;
}

/** One sync of the account five minutes after the last, as the scheduled check would run it. */
async function syncLater(userId: string) {
  clock.advance(5 * 60_000);
  await enqueueVaultSync(jobsContext(), { userId, trigger: "schedule" });
  return runDueJobs(jobsContext(), { handlers: handlers(), queues: [VAULT_SYNC_QUEUE], random: () => 0 });
}

/** The alert messages queued for the operator's channels, oldest first: kind and key per delivery. */
async function listDeliveries(): Promise<{ kind: string; key: string; channel: string }[]> {
  const jobs = await listJobs(database.db);
  return jobs
    .filter((job) => job.queue === DELIVER_QUEUE)
    .map((job) => job.payload as { channel: string; message: { kind: string; key: string } })
    .map((payload) => ({ kind: payload.message.kind, key: payload.message.key, channel: payload.channel }));
}

describe("operator alerts on failing syncs", () => {
  it("sends one alert on the third failed sync in a row and one recovery on the next good sync", async () => {
    const source = await connect(aliceId);
    source.fail("listTree", "source.too_large");
    for (let attempt = 1; attempt <= 2; attempt += 1) await syncLater(aliceId);
    expect(await listDeliveries()).toEqual([]);

    await syncLater(aliceId);
    const key = getSyncAlertKey(aliceId);
    expect(await listDeliveries()).toEqual([{ kind: "fired", key, channel: "mail" }]);

    // Further failures are counted, never sent again.
    for (let attempt = 1; attempt <= 4; attempt += 1) await syncLater(aliceId);
    expect(await listDeliveries()).toEqual([{ kind: "fired", key, channel: "mail" }]);

    source.fail("listTree", null);
    await syncLater(aliceId);
    expect(await listDeliveries()).toEqual([
      { kind: "fired", key, channel: "mail" },
      { kind: "resolved", key, channel: "mail" },
    ]);
    const [stored] = await listRecentAlerts(jobsContext(), {});
    expect(stored).toMatchObject({ key, status: "resolved", severity: "warning", title: "Syncs keep failing for one account" });
    expect(stored?.details).toBe(`- 3 syncs in a row failed\n- Last error: source.too_large\n- Account: ${aliceId}`);
    expect(stored?.details).not.toContain("alice@example.com");
  });

  it("starts counting again after a good sync, so failures apart never alert", async () => {
    const source = await connect(aliceId);
    source.fail("listTree", "source.too_large");
    await syncLater(aliceId);
    await syncLater(aliceId);
    source.fail("listTree", null);
    await syncLater(aliceId);
    source.fail("listTree", "source.too_large");
    // The copy is up to date: the source must change for the next sync to plan (and fail) again.
    source.write("Work/Next.md", "# Next");
    await syncLater(aliceId);
    await syncLater(aliceId);
    expect(await listDeliveries()).toEqual([]);
  });

  it("counts each account apart", async () => {
    await connect(aliceId);
    const bobSource = await connect(bobId);
    bobSource.fail("listTree", "source.too_large");
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await syncLater(aliceId);
      await syncLater(bobId);
    }
    expect(await listDeliveries()).toEqual([{ kind: "fired", key: getSyncAlertKey(bobId), channel: "mail" }]);
  });

  it("counts a step that fails before reading the source, as on an instance without a store", async () => {
    const unconfigured = createVaultSyncJobHandlers({ storage: null, openSource: () => null, onSyncOutcome: recordSyncOutcome });
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      clock.advance(5 * 60_000);
      await enqueueVaultSync(jobsContext(), { userId: aliceId, trigger: "webhook" });
      await runDueJobs(jobsContext(), { handlers: unconfigured, queues: [VAULT_SYNC_QUEUE] });
    }
    expect(await listDeliveries()).toEqual([{ kind: "fired", key: getSyncAlertKey(aliceId), channel: "mail" }]);
  });

  it("counts a step that still waits on the source at its job's last attempt as one failed sync", async () => {
    const source = await connect(aliceId);
    source.fail("getCursor", "source.unavailable", 60);
    await enqueueVaultSync(jobsContext(), { userId: aliceId, trigger: "webhook" });
    let failed = 0;
    for (let attempt = 1; attempt <= 8 && failed === 0; attempt += 1) {
      failed = (await runDueJobs(jobsContext(), { handlers: handlers(), queues: [VAULT_SYNC_QUEUE], random: () => 0 })).failed;
      clock.advance(60 * 60_000);
    }
    expect(failed).toBe(1);
    const streak = await database.db.execute<{ failures: number; last_error_code: string }>(
      sql`SELECT failures, last_error_code FROM operator.sync_failure_streaks WHERE user_id = ${aliceId}`,
    );
    expect(streak.rows).toEqual([{ failures: 1, last_error_code: "source.unavailable" }]);
  });

  it("resolves nothing when a good sync follows fewer than three failures", async () => {
    await recordSyncOutcome(jobsContext(), { userId: aliceId, outcome: { kind: "failed", errorCode: "source.not_found" } });
    await recordSyncOutcome(jobsContext(), { userId: aliceId, outcome: { kind: "succeeded" } });
    expect(await listDeliveries()).toEqual([]);
    expect(await listRecentAlerts(jobsContext(), {})).toEqual([]);
  });
});

describe("the jobs heartbeat", () => {
  it("logs its line once per run, a minute apart", async () => {
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line: unknown) => {
      lines.push(String(line));
    });
    const context = jobsContext();
    for (let minute = 0; minute < 3; minute += 1) {
      await runDueJobs(context, { handlers: operatorJobHandlers, queues: [OPERATOR_HEARTBEAT_QUEUE] });
      clock.advance(60_000);
    }
    expect(lines.filter((line) => line.includes(HEARTBEAT_LOG_LINE))).toHaveLength(3);
  });
});

describe("readOperatorAlertSettings", () => {
  it("reads the operator's mail, an https webhook and the admin list", () => {
    expect(
      readOperatorAlertSettings({
        ALERTS_MAIL_TO: " ops@example.com ",
        ALERTS_WEBHOOK_URL: "https://hooks.example.com/alerts",
        ADMIN_EMAILS: "ops@example.com, owner@example.com",
      }),
    ).toEqual({ mailTo: "ops@example.com", webhookUrl: "https://hooks.example.com/alerts", adminEmails: "ops@example.com, owner@example.com" });
  });

  it("leaves out an unset value and a webhook that is not https", () => {
    expect(readOperatorAlertSettings({ ALERTS_MAIL_TO: "  ", ALERTS_WEBHOOK_URL: "http://hooks.example.com/alerts" })).toEqual({
      mailTo: undefined,
      webhookUrl: undefined,
      adminEmails: "",
    });
    expect(readOperatorAlertSettings({ ALERTS_WEBHOOK_URL: "not a url" }).webhookUrl).toBeUndefined();
  });
});
