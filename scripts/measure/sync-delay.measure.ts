// NFR-5: how long a change at the source takes to reach the tools on the hosted schedule. The jobs run as the Cron
// Trigger runs them, once a simulated minute (`runDueJobs` with the app's sync and index handlers), and an assistant asks
// `search_vault` for the changed note's new word after every tick. Two cases:
// - no push (S3, Dropbox, sync, or a git host without the webhook): the change lands right after a scheduled check, the
//   worst moment, so it waits for the next five-minute check;
// - a push: the GitHub webhook enqueues a step at once, as `github-webhook.ts` does.
// The delay is the simulated minutes until the answer carries the word, plus the real time of the ticks' work.
import type { SoftureConfig } from "@softure-ai/core";
import { runDueJobs } from "@softure-ai/jobs/testing";
import { afterAll, beforeAll, expect, it } from "vitest";
import config from "../../softure.config.ts";
import { createFakeEmbedder, createVaultFixture, KEY_SECRET, type VaultFixture } from "../../src/mcp/testing/vault-fixture.ts";
import { createVaultIndexJobHandlers, VAULT_INDEX_CHECK_QUEUE, VAULT_INDEX_QUEUE } from "../../src/vault/index/index-jobs.ts";
import type { FakeSource } from "../../src/vault/testing/fake-source.ts";
import { createVaultSyncJobHandlers, enqueueVaultSync, VAULT_SYNC_CHECK_QUEUE, VAULT_SYNC_QUEUE } from "../../src/vault/sync/sync-jobs.ts";
import { createAssistantHarness, type AssistantHarness } from "./assistant-harness.ts";
import { getMeasureDir, MEASURES, writeMeasureRecords, type MeasureRecord } from "./measurements.ts";

const MINUTE_MS = 60_000;
/** Gives up after this many simulated minutes: three times the target. */
const MAX_TICKS = 30;
const QUEUES = [VAULT_SYNC_CHECK_QUEUE, VAULT_SYNC_QUEUE, VAULT_INDEX_CHECK_QUEUE, VAULT_INDEX_QUEUE];

let fixture: VaultFixture;
let harness: AssistantHarness;
let source: FakeSource;
let userId: string;
let token: string;
const records: MeasureRecord[] = [];

function jobsContext(): { db: VaultFixture["database"]["db"]; clock: VaultFixture["clock"]; config: SoftureConfig } {
  return { db: fixture.database.db, clock: fixture.clock, config };
}

/** One tick of the Cron Trigger a minute after the last; resolves with the real time its work took. */
async function tick(): Promise<number> {
  fixture.clock.advance(MINUTE_MS);
  const store = { storage: fixture.storage, keySecret: KEY_SECRET };
  const handlers = {
    ...createVaultSyncJobHandlers({ storage: store, openSource: () => source }),
    ...createVaultIndexJobHandlers({ storage: store, embedder: createFakeEmbedder() }),
  };
  const started = performance.now();
  const report = await runDueJobs(jobsContext(), { handlers, queues: QUEUES, random: () => 0 });
  if (report.failed > 0) throw new Error("A sync or index job failed during the measurement");
  return performance.now() - started;
}

async function isVisible(word: string): Promise<boolean> {
  const answer = await harness.callTool(token, "search_vault", { query: word, mode: "keyword" });
  return answer.text.replaceAll(`"${word}"`, '""').toLowerCase().includes(word);
}

/** Ticks until the word is searchable; resolves with the delay in minutes from `changedAt`. */
async function waitUntilVisible(word: string, changedAt: number): Promise<number> {
  let workMs = 0;
  for (let ticks = 1; ticks <= MAX_TICKS; ticks += 1) {
    workMs += await tick();
    if (await isVisible(word)) return (fixture.clock.now().getTime() - changedAt + workMs) / MINUTE_MS;
  }
  throw new Error(`${word} was not searchable after ${String(MAX_TICKS)} minutes`);
}

beforeAll(async () => {
  // Half a minute before a five-minute slot: the first tick runs the slot's checks, as the Cron Trigger at 12:00 would.
  fixture = await createVaultFixture(new Date("2026-11-17T11:59:30Z"));
  harness = createAssistantHarness(fixture);
  userId = await fixture.createAccount("sync-delay@example.com");
  source = await fixture.connect(userId, { "Notes/Garden.md": "# Garden\n\nTomatoes in May." }, ["Notes"]);
  token = await harness.connect(userId);
  // The 12:00 checks run now, so the next ones are five minutes away.
  await tick();
});

afterAll(async () => {
  writeMeasureRecords(getMeasureDir(), "sync-delay", records);
  await fixture.close();
});

it("shows a change made right after a scheduled check within ten minutes, with no push", async () => {
  source.write("Notes/Garden.md", "# Garden\n\nTomatoes in May. Marigoldschedule between the rows.");
  const delay = await waitUntilVisible("marigoldschedule", fixture.clock.now().getTime() + 1);
  records.push({ id: "sync-delay-schedule", value: delay, where: "jobs on a simulated one-minute tick, PGlite, fake model", detail: "five-minute check, change right after the previous one" });
  console.info(`sync delay without a push: ${delay.toFixed(2)} min`);
  expect(delay).toBeLessThanOrEqual(MEASURES["sync-delay-schedule"].target.value);
});

it("shows a pushed change on the next tick", async () => {
  source.write("Notes/Garden.md", "# Garden\n\nTomatoes in May. Marigoldpush between the rows.");
  const changedAt = fixture.clock.now().getTime();
  await enqueueVaultSync(jobsContext(), { userId, trigger: "webhook" });
  const delay = await waitUntilVisible("marigoldpush", changedAt);
  records.push({ id: "sync-delay-push", value: delay, where: "jobs on a simulated one-minute tick, PGlite, fake model", detail: "GitHub push enqueues a step at once" });
  console.info(`sync delay after a push: ${delay.toFixed(2)} min`);
  expect(delay).toBeLessThanOrEqual(MEASURES["sync-delay-push"].target.value);
});
