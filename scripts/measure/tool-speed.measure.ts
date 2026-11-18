// NFR-1 on a vault of 5,000 notes (the trial plan's cap): the notes are copied by the sync jobs and indexed by the
// index steps, as the worker does, then an assistant calls each tool forty times over the MCP endpoint. Targets:
// `search_vault` under 3 s at p95, `vault_index` and `get_note` under 1 s. PGlite in the test process is slower than the
// hosted Postgres, and the fake model's vectors are scanned as a real model's would be, so the numbers are an upper bound
// for the database work; a real model adds its own call to each search.
import { afterAll, beforeAll, expect, it } from "vitest";
import { createVaultFixture, type VaultFixture } from "../../src/mcp/testing/vault-fixture.ts";
import { createAssistantHarness, timeCall, type AssistantHarness } from "./assistant-harness.ts";
import { getMeasureDir, MEASURES, percentile95, writeMeasureRecords, type MeasureId, type MeasureRecord } from "./measurements.ts";

const NOTES = 5_000;
const AREAS = 40;
const CALLS = 40;
const WORDS = ["invoice", "client", "retainer", "deadline", "migration", "runbook", "garden", "recipe", "travel", "budget", "meeting", "contract", "dentist", "insurance", "sourdough", "kubernetes"];
const QUERIES = ["client retainer hours", "migration deadline", "budget meeting notes", "garden recipe", "travel contract", "runbok", "when is the dentist", "insurance for the trip", "how to bake sourdough", "kubernetes readiness"];
const WHERE = "MCP endpoint on PGlite in the test process, fake model";

let fixture: VaultFixture;
let harness: AssistantHarness;
let token: string;
let setupSeconds = 0;
const records: MeasureRecord[] = [];

function noteText(index: number): string {
  const pick = (offset: number) => WORDS[(index * 7 + offset * 3) % WORDS.length] ?? "note";
  return [
    `# Note ${String(index)}`,
    "",
    `About the ${pick(0)} and the ${pick(1)}. Follow up on the ${pick(2)} with the ${pick(3)} next week.`,
    "",
    "## Details",
    `The ${pick(4)} waits for the ${pick(5)}; keep the ${pick(6)} in mind before the ${pick(7)}.`,
  ].join("\n");
}

function notePath(index: number): string {
  return `Work/Area ${String(index % AREAS)}/Note ${String(index)}.md`;
}

beforeAll(async () => {
  const started = performance.now();
  fixture = await createVaultFixture();
  harness = createAssistantHarness(fixture);
  const userId = await fixture.createAccount("speed@example.com");
  const files = Object.fromEntries(Array.from({ length: NOTES }, (_, index) => [notePath(index), noteText(index)]));
  await fixture.connect(userId, files, ["Work"]);
  token = await harness.connect(userId);
  // Every note copied and searchable, none skipped over the plan's cap.
  const status = await harness.callTool(token, "vault_status");
  expect(status.text).toMatch(/Notes the assistant can read: 5,?000\b/);
  setupSeconds = (performance.now() - started) / 1000;
  console.info(`tool speed: ${String(NOTES)} notes synced and indexed in ${setupSeconds.toFixed(0)} s`);
});

afterAll(async () => {
  writeMeasureRecords(getMeasureDir(), "tool-speed", records);
  await fixture.close();
});

/** Calls the tool once to warm up, then CALLS times; records the p95 and fails when it misses the target. */
async function measure(id: MeasureId, name: string, argsOf: (call: number) => Record<string, unknown>, expectText: (call: number) => string): Promise<void> {
  await harness.callTool(token, name, argsOf(0));
  const durations: number[] = [];
  for (let call = 0; call < CALLS; call += 1) {
    const { value, ms } = await timeCall(() => harness.callTool(token, name, argsOf(call)));
    expect(value.isError, `${name} ${JSON.stringify(argsOf(call))}`).toBe(false);
    expect(value.text).toContain(expectText(call));
    durations.push(ms);
  }
  const p95 = percentile95(durations);
  const median = [...durations].sort((left, right) => left - right)[Math.floor(durations.length / 2)] ?? 0;
  records.push({ id, value: p95, where: WHERE, detail: `${String(CALLS)} calls on ${String(NOTES)} notes after one warm-up, median ${String(Math.round(median))} ms` });
  console.info(`${name} p95 on ${String(NOTES)} notes: ${p95.toFixed(0)} ms (median ${median.toFixed(0)} ms)`);
  expect(p95).toBeLessThan(MEASURES[id].target.value);
}

it("answers search_vault in under 3 s at p95", async () => {
  await measure(
    "search-p95",
    "search_vault",
    (call) => ({ query: QUERIES[call % QUERIES.length] ?? "client", ...(call % 4 === 3 ? { folder: `Work/Area ${String(call % AREAS)}` } : {}) }),
    () => "Work/Area ",
  );
});

it("answers vault_index in under 1 s at p95", async () => {
  const shapes: ((call: number) => Record<string, unknown>)[] = [
    () => ({}),
    (call) => ({ folder: `Work/Area ${String(call % AREAS)}` }),
    (call) => ({ filter: `Note ${String(call * 97)}` }),
    () => ({ folder: "Work", recursive: true, max_results: 300 }),
  ];
  await measure("index-p95", "vault_index", (call) => (shapes[call % shapes.length] ?? shapes[0])?.(call) ?? {}, () => "Work");
});

it("answers get_note in under 1 s at p95", async () => {
  await measure("read-p95", "get_note", (call) => ({ path: notePath((call * 123) % NOTES) }), (call) => `Note ${String((call * 123) % NOTES)}`);
});
