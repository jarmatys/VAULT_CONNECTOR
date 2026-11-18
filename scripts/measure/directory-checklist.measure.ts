// G-3: the Claude connector directory's points, counted on the running server. The checklist page
// (content/docs/directory-checklist.md) names seven points and their evidence; for each row this run checks that every
// named file exists and then the point itself, on the MCP endpoint and the OAuth documents an assistant reads, with the
// reviewer's fictional vault (content/reviewer-vault) as the test account's data. The value is the number of points met.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { getAuthorizationServerMetadata, getProtectedResourceMetadata } from "@softure-ai/mcp-access/server";
import { afterAll, beforeAll, expect, it } from "vitest";
import config from "../../softure.config.ts";
import { getDocPages } from "../../src/docs/doc-pages.ts";
import { REQUIRED_DOC_SLUGS } from "../../src/docs/docs-content.ts";
import { LEGAL_PATHS } from "../../src/lib/legal-documents.ts";
import { VAULT_TOOL_NAMES } from "../../src/mcp/catalog.ts";
import { createVaultFixture, type VaultFixture } from "../../src/mcp/testing/vault-fixture.ts";
import { UNTRUSTED_CLOSE, UNTRUSTED_OPEN } from "../../src/mcp/untrusted.ts";
import { createAssistantHarness, type AssistantHarness } from "./assistant-harness.ts";
import { getMeasureDir, MEASURES, writeMeasureRecords } from "./measurements.ts";

const REPOSITORY = join(import.meta.dirname, "../..");
const CHECKLIST = join(REPOSITORY, "content/docs/directory-checklist.md");
const REVIEWER_VAULT = join(REPOSITORY, "content/reviewer-vault");
/** The reviewer's question on the checklist page and the note that answers it. */
const REVIEWER_QUESTION = "What did the garden co-op decide at the seed swap?";
const REVIEWER_ANSWER = "Meetings/2026-03-02 Seed swap.md";
const ORDERS_NOTE = "Reading/A note that gives orders.md";

interface ChecklistRow {
  readonly point: string;
  readonly evidence: readonly string[];
}

/** The checks of the seven points, by the point's name on the page. */
type PointCheck = () => Promise<string | null>;

let fixture: VaultFixture;
let harness: AssistantHarness;
let token: string;

function readChecklist(): ChecklistRow[] {
  const lines = readFileSync(CHECKLIST, "utf8").split("\n").filter((line) => line.startsWith("| ") && !line.startsWith("| Point") && !line.startsWith("| ---"));
  return lines.map((line) => {
    const cells = line.split(" | ");
    const point = (cells[0] ?? "").replace(/^\| /, "").trim();
    const evidence = [...(cells.at(-1) ?? "").matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? "");
    return { point, evidence };
  });
}

function readVaultFiles(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  const visit = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name.endsWith(".md")) files[relative(dir, path).split(sep).join("/")] = readFileSync(path, "utf8");
    }
  };
  visit(dir);
  return files;
}

async function listTools(): Promise<{ name: string; title?: string; annotations?: Record<string, unknown> }[]> {
  const answer = (await harness.rpc(token, "tools/list")) as { result?: { tools?: { name: string; title?: string; annotations?: Record<string, unknown> }[] } };
  return answer.result?.tools ?? [];
}

const CHECKS: Readonly<Record<string, PointCheck>> = {
  "Remote server over HTTPS": async () => {
    const resource = getProtectedResourceMetadata(config, "endpoint");
    if (resource.resource !== `${config.appOrigin}/api/mcp`) return `the endpoint is ${resource.resource}`;
    return (await listTools()).length > 0 ? null : "tools/list answered no tools over Streamable HTTP";
  },
  "OAuth 2.1 sign-in": () => {
    const server = getAuthorizationServerMetadata(config);
    if (JSON.stringify(server.code_challenge_methods_supported) !== JSON.stringify(["S256"])) return Promise.resolve("PKCE is not S256 only");
    if (server.registration_endpoint === undefined) return Promise.resolve("no dynamic client registration");
    const resource = getProtectedResourceMetadata(config, "endpoint");
    // The harness connected through registration, consent and the PKCE exchange already: a token exists.
    return Promise.resolve(resource.authorization_servers?.includes(server.issuer) === true && token !== "" ? null : "the resource does not name the issuer");
  },
  "Tool titles and read-only hints": async () => {
    const tools = await listTools();
    if (JSON.stringify(tools.map((tool) => tool.name).sort()) !== JSON.stringify([...VAULT_TOOL_NAMES].sort())) return `tools: ${tools.map((tool) => tool.name).join(", ")}`;
    const bad = tools.find((tool) => !/^[a-z][a-z_]*$/.test(tool.name) || (tool.title ?? "") === "" || tool.annotations?.readOnlyHint !== true || tool.annotations.destructiveHint !== false);
    return bad === undefined ? null : `${bad.name} lacks a title or the read-only hints`;
  },
  "Privacy policy": () => Promise.resolve(LEGAL_PATHS["privacy-policy"] === "/privacy" && existsSync(join(REPOSITORY, "src/app/(site)/privacy/page.tsx")) ? null : "no privacy policy page"),
  "Public documentation": () => {
    const slugs = new Set(getDocPages().map((page) => page.slug));
    const missing = REQUIRED_DOC_SLUGS.filter((slug) => !slugs.has(slug));
    return Promise.resolve(missing.length === 0 ? null : `missing docs: ${missing.join(", ")}`);
  },
  "Test account with data": async () => {
    const answer = await harness.callTool(token, "search_vault", { query: REVIEWER_QUESTION });
    return !answer.isError && answer.text.includes(REVIEWER_ANSWER) ? null : "the reviewer's question finds no answer in the fixture vault";
  },
  "Prompt-injection safety": async () => {
    const note = await harness.callTool(token, "get_note", { path: ORDERS_NOTE });
    const text = note.text.trim();
    if (note.isError || !text.startsWith(UNTRUSTED_OPEN) || !text.endsWith(UNTRUSTED_CLOSE)) return "the note that gives orders is not between the markers";
    const init = (await harness.rpc(token, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "measure", version: "1" } })) as { result?: { instructions?: string } };
    return (init.result?.instructions ?? "").includes(UNTRUSTED_OPEN) ? null : "the instructions do not name the markers";
  },
};

beforeAll(async () => {
  fixture = await createVaultFixture();
  harness = createAssistantHarness(fixture);
  const userId = await fixture.createAccount("reviewer-measure@example.com");
  const files = readVaultFiles(REVIEWER_VAULT);
  const folders = [...new Set(Object.keys(files).filter((path) => path.includes("/")).map((path) => path.split("/")[0] ?? ""))];
  await fixture.connect(userId, files, folders);
  token = await harness.connect(userId);
});

afterAll(async () => {
  await fixture.close();
});

it("meets every point of the directory checklist, each with its evidence", async () => {
  const rows = readChecklist();
  const failures: string[] = [];
  for (const row of rows) {
    const check = CHECKS[row.point];
    const missingFiles = row.evidence.filter((path) => /^(src|e2e|content)\//.test(path) && !existsSync(join(REPOSITORY, path)));
    const problem = check === undefined ? "no check for this point" : missingFiles.length > 0 ? `missing evidence ${missingFiles.join(", ")}` : await check();
    if (problem !== null) failures.push(`${row.point}: ${problem}`);
  }
  // A point the page dropped is a failure too, but not a met row.
  const unlisted = Object.keys(CHECKS).filter((point) => !rows.some((row) => row.point === point));
  failures.push(...unlisted.map((point) => `${point}: not on the checklist page`));
  const met = rows.length - (failures.length - unlisted.length);
  writeMeasureRecords(getMeasureDir(), "directory-checklist", [
    { id: "checklist-points", value: met, where: "MCP endpoint and OAuth documents on PGlite, reviewer fixture vault", detail: `${String(rows.length)} points on the page` },
  ]);
  console.info(`directory checklist: ${String(met)} of ${String(rows.length)}`);
  expect(failures).toEqual([]);
  expect(met).toBeGreaterThanOrEqual(MEASURES["checklist-points"].target.value);
});
