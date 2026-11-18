// NFR-2 on many accounts: twelve accounts with fictional vaults whose paths collide, each sharing some folders and not
// others. Every account's assistant makes every call it could (the table of contents in every shape, every path of
// every vault, a search for every other account's words, the status), and no answer may carry another account's text
// or source, nor a note of a folder the account did not share. Counted per answer: the target is zero.
import { afterAll, beforeAll, expect, it } from "vitest";
import { createVaultFixture, type VaultFixture } from "../../src/mcp/testing/vault-fixture.ts";
import { createAssistantHarness, type AssistantHarness } from "./assistant-harness.ts";
import { getMeasureDir, writeMeasureRecords } from "./measurements.ts";

const ACCOUNTS = 12;
const PATHS = ["Shared/Plan.md", "Shared/Clients/Client.md", "Notes/Ideas.md", "Private/Diary.md"] as const;

interface Account {
  readonly index: number;
  readonly userId: string;
  readonly picks: readonly string[];
  token: string;
}

let fixture: VaultFixture;
let harness: AssistantHarness;
const accounts: Account[] = [];

/** The word that marks a note of account `index` at `path`: `acct7notesideas`. */
function markerOf(index: number, path: string): string {
  return `acct${String(index)}${path.replace(/[^A-Za-z]/g, "").toLowerCase().replace(/md$/, "")}`;
}

function isShared(account: Account, path: string): boolean {
  return account.picks.some((pick) => path.startsWith(`${pick}/`));
}

beforeAll(async () => {
  fixture = await createVaultFixture();
  harness = createAssistantHarness(fixture);
  for (let index = 1; index <= ACCOUNTS; index += 1) {
    const userId = await fixture.createAccount(`isolation-${String(index)}@example.com`);
    // Odd accounts share two folders, even accounts one: what one shares, its neighbour keeps.
    const picks = index % 2 === 1 ? ["Shared", "Notes"] : ["Shared"];
    const files = Object.fromEntries(PATHS.map((path) => [path, `# ${path}\n\n${markerOf(index, path)} is the word of this note. Plan, ideas, diary, client.`]));
    await fixture.connect(userId, files, picks);
    accounts.push({ index, userId, picks, token: "" });
  }
  for (const account of accounts) account.token = await harness.connect(account.userId);
});

afterAll(async () => {
  await fixture.close();
});

/** Every call the account's assistant makes. */
function probesFor(account: Account): [string, Record<string, unknown>][] {
  const others = accounts.filter((other) => other.index !== account.index);
  return [
    ["vault_index", {}],
    ["vault_index", { recursive: true, max_results: 500 }],
    ...["Shared", "Notes", "Private", "Shared/Clients"].map((folder): [string, Record<string, unknown>] => ["vault_index", { folder, recursive: true }]),
    ...["plan", "ideas", "diary", "client"].map((filter): [string, Record<string, unknown>] => ["vault_index", { filter }]),
    ...PATHS.map((path): [string, Record<string, unknown>] => ["get_note", { path }]),
    ["get_note", { path: "../Private/Diary.md" }],
    ["search_vault", { query: "plan ideas diary client" }],
    ["search_vault", { query: "diary", folder: "Private" }],
    ["search_vault", { query: "ideas", mode: "meaning", max_results: 20 }],
    ...others.map((other): [string, Record<string, unknown>] => ["search_vault", { query: PATHS.map((path) => markerOf(other.index, path)).join(" ") }]),
    ["vault_status", {}],
  ];
}

/** What must never appear in the account's answers: other accounts' words and sources, its own unshared notes. */
function forbiddenFor(account: Account): RegExp[] {
  const words = accounts.flatMap((other) => PATHS.filter((path) => other.index !== account.index || !isShared(account, path)).map((path) => markerOf(other.index, path)));
  const sources = accounts.filter((other) => other.index !== account.index).map((other) => `example/vault-${String(other.index)}(?!\\d)`);
  return [...words.map((word) => new RegExp(`\\b${word}\\b`, "i")), ...sources.map((source) => new RegExp(source))];
}

it("shows no account another account's notes or source, nor a note of a folder it did not share", async () => {
  let calls = 0;
  const leaks: string[] = [];
  for (const account of accounts) {
    const forbidden = forbiddenFor(account);
    const seen: string[] = [];
    for (const [name, args] of probesFor(account)) {
      const answer = await harness.callTool(account.token, name, args);
      calls += 1;
      seen.push(answer.text);
      // A search answer repeats its query ("Search for …", "No results for …"); the words asked for are not a leak.
      const text = typeof args.query === "string" ? answer.text.replaceAll(`"${args.query}"`, '""') : answer.text;
      const hit = forbidden.find((pattern) => pattern.test(text));
      if (hit !== undefined) leaks.push(`account ${String(account.index)} ${name} ${JSON.stringify(args)}: ${hit.source}`);
    }
    // The probes reach the account's own shared notes, so an empty answer cannot pass for isolation.
    const all = seen.join("\n");
    for (const path of PATHS.filter((path) => isShared(account, path))) expect(all).toContain(markerOf(account.index, path));
  }
  writeMeasureRecords(getMeasureDir(), "isolation", [
    { id: "isolation-leaks", value: leaks.length, where: "MCP endpoint on PGlite, fake model", detail: `${String(ACCOUNTS)} accounts, ${String(calls)} tool calls` },
  ]);
  console.info(`isolation: ${String(leaks.length)} leaks in ${String(calls)} calls on ${String(ACCOUNTS)} accounts`);
  expect(leaks).toEqual([]);
});
