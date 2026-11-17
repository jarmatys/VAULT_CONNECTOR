// The MCP endpoint end to end on a test database, as an assistant uses it: dynamic client registration, the account's
// consent, the code exchange with PKCE, then the read-only tools over a bearer token; revoking the connection ends it.
// Two fixture accounts prove the isolation (NFR-2): no answer to one account carries the other's notes, or a note of a
// folder it did not share. The tools change nothing: the store and the tables are the same after every call.
import { createHash, randomBytes } from "node:crypto";
import type { ModuleContext } from "@softure-ai/core";
import type { Queryable } from "@softure-ai/db";
import { createMcpEndpoint, getMcpAccessMessages, handleAuthorizationDecision, handleClientRegistration, handleTokenRequest, issueAccessToken, listOAuthGrants, revokeOAuthGrant } from "@softure-ai/mcp-access/server";
import { expectToolCatalogMatchesServer } from "@softure-ai/mcp-access/testing";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import config from "../../softure.config.ts";
import { saveVaultDescription } from "./profile/vault-description.ts";
import { createVaultServerFactory } from "./server.ts";
import { createVaultFixture, PANEL_URL, type VaultFixture } from "./testing/vault-fixture.ts";
import { UNTRUSTED_CLOSE, UNTRUSTED_OPEN } from "./untrusted.ts";
import { VAULT_TOOL_NAMES } from "./catalog.ts";

const ORIGIN = config.appOrigin;
const REDIRECT_URI = "https://assistant.example/oauth/callback";
const CLIENT_IP = "203.0.113.7";

const ALICE_VAULT = {
  "Work/Work.md": "---\ndescription: Client work and plans.\n---\n# Work",
  "Work/Plan.md": "---\ntitle: The plan\ntags: [q4]\n---\nALICE-WORK: ship the report on Friday.",
  "Work/Clients/Acme.md": "# Acme\nALICE-CLIENT notes.",
  "Personal/Diary.md": "ALICE-PRIVATE: not shared.",
};
const BOB_VAULT = { "Work/Plan.md": "BOB-SECRET: Bob's own plan.", "Notes/Ideas.md": "BOB-SECRET ideas" };

let fixture: VaultFixture;
let ctx: ModuleContext<Queryable>;
let aliceId: string;
let bobId: string;
let mcp: (token: string, method: string, params?: Record<string, unknown>) => Promise<{ status: number; body: Record<string, unknown> | null }>;

beforeEach(async () => {
  fixture = await createVaultFixture();
  ctx = { db: fixture.database.db, clock: fixture.clock, config };
  aliceId = await fixture.createAccount("alice@example.com");
  bobId = await fixture.createAccount("bob@example.com");
  await fixture.connect(aliceId, ALICE_VAULT, ["Work"]);
  await fixture.connect(bobId, BOB_VAULT, ["Work", "Notes"]);
  await saveVaultDescription(ctx.db, { userId: aliceId, description: "My work notes: clients and plans.", now: fixture.clock.now() });
  const endpoint = createMcpEndpoint({ createServer: createVaultServerFactory(() => Promise.resolve(fixture.readContext)) });
  let id = 0;
  mcp = async (token, method, params = {}) => {
    id += 1;
    const response = await endpoint(
      ctx,
      new Request(`${ORIGIN}/api/mcp`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-protocol-version": "2025-06-18",
          "cf-connecting-ip": CLIENT_IP,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      }),
    );
    return { status: response.status, body: await readAnswer(response) };
  };
});

afterEach(async () => {
  await fixture.close();
});

async function readAnswer(response: Response): Promise<Record<string, unknown> | null> {
  const text = await response.text();
  if (text.trim() === "") return null;
  const data = text.startsWith("event:") || text.startsWith("data:") ? text.split("\n").find((line) => line.startsWith("data:"))?.slice(5) ?? "" : text;
  return JSON.parse(data) as Record<string, unknown>;
}

/** Connects an assistant for the account the way claude.ai does: register, consent, exchange the code. */
async function connectAssistant(userId: string): Promise<{ accessToken: string; clientId: string }> {
  const registration = await handleClientRegistration(
    ctx,
    new Request(`${ORIGIN}/api/oauth/register`, {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": CLIENT_IP },
      body: JSON.stringify({ client_name: "Test assistant", redirect_uris: [REDIRECT_URI], token_endpoint_auth_method: "none" }),
    }),
  );
  expect(registration.status).toBe(201);
  const { client_id: clientId } = (await registration.json()) as { client_id: string };
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const decision = await handleAuthorizationDecision(
    ctx,
    new Request(`${ORIGIN}/api/oauth/authorize`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN, "cf-connecting-ip": CLIENT_IP },
      body: new URLSearchParams({
        client_id: clientId,
        redirect_uri: REDIRECT_URI,
        response_type: "code",
        code_challenge: challenge,
        code_challenge_method: "S256",
        state: "s1",
        decision: "allow",
      }),
    }),
    userId,
  );
  expect(decision.status).toBe(303);
  const code = new URL(decision.headers.get("location") ?? "").searchParams.get("code");
  expect(code).not.toBeNull();
  const token = await handleTokenRequest(
    ctx,
    new Request(`${ORIGIN}/api/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": CLIENT_IP },
      body: new URLSearchParams({ grant_type: "authorization_code", code: code ?? "", redirect_uri: REDIRECT_URI, client_id: clientId, code_verifier: verifier }),
    }),
  );
  expect(token.status).toBe(200);
  const tokens = (await token.json()) as { access_token: string; scope?: string };
  expect(tokens.scope ?? "").not.toContain("write");
  return { accessToken: tokens.access_token, clientId };
}

async function callTool(token: string, name: string, args: Record<string, unknown> = {}): Promise<{ text: string; isError: boolean }> {
  const { status, body } = await mcp(token, "tools/call", { name, arguments: args });
  expect(status).toBe(200);
  const result = body?.result as { content: { type: string; text: string }[]; isError?: boolean };
  return { text: result.content.map((part) => part.text).join("\n"), isError: result.isError === true };
}

describe("connecting an assistant over OAuth", () => {
  it("registers, takes the account's consent, and lists three read-only tools with their titles and annotations", async () => {
    const { accessToken } = await connectAssistant(aliceId);
    const listed = await mcp(accessToken, "tools/list");
    expect(listed.status).toBe(200);
    const tools = (listed.body?.result as { tools: { name: string; title?: string; annotations?: Record<string, unknown> }[] }).tools;
    expect(tools.map(({ name }) => name).sort()).toEqual([...VAULT_TOOL_NAMES].sort());
    for (const tool of tools) {
      expect(tool.title).toEqual(expect.any(String));
      expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: tool.title });
    }
  });

  it("sends the instructions with the account's own sentence between the markers", async () => {
    const { accessToken } = await connectAssistant(aliceId);
    const { body } = await mcp(accessToken, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    const result = body?.result as { instructions: string; serverInfo: { name: string; version: string } };
    expect(result.serverInfo.name).toBe("vaultconnector");
    expect(result.serverInfo.version).toMatch(/^0\.1\.0-tools-[0-9a-f]{12}$/);
    expect(result.instructions).toContain("WHEN TO USE");
    expect(result.instructions.endsWith(`${UNTRUSTED_OPEN}\nMy work notes: clients and plans.\n${UNTRUSTED_CLOSE}`)).toBe(true);
  });

  it("reads the table of contents and a whole note, the note's text between the markers", async () => {
    const { accessToken } = await connectAssistant(aliceId);
    const index = await callTool(accessToken, "vault_index");
    expect(index.isError).toBe(false);
    expect(index.text).toContain("- Work/ (3 notes, last change 2026-11-17) — Client work and plans.");
    expect(index.text).not.toContain("Personal");
    const note = await callTool(accessToken, "get_note", { path: "Work/Plan.md" });
    expect(note).toEqual({ isError: false, text: `${UNTRUSTED_OPEN}\n# Work/Plan.md\n\n${ALICE_VAULT["Work/Plan.md"]}\n${UNTRUSTED_CLOSE}` });
  });

  it("tells the status: source, shared folders, readable notes and the last sync", async () => {
    const { accessToken } = await connectAssistant(aliceId);
    const status = await callTool(accessToken, "vault_status");
    expect(status.text.split("\n")).toEqual([
      UNTRUSTED_OPEN,
      "Source: example/vault-1 (connected)",
      "Shared folders: Work",
      UNTRUSTED_CLOSE,
      "Notes the assistant can read: 3",
      "Last sync: 2026-11-17 12:00 UTC, succeeded",
      `Panel: ${PANEL_URL}`,
    ]);
  });

  it("refuses unknown arguments instead of ignoring them", async () => {
    const { accessToken } = await connectAssistant(aliceId);
    const answer = await callTool(accessToken, "get_note", { path: "Work/Plan.md", mode: "write" });
    expect(answer.isError).toBe(true);
    expect(answer.text).toContain("mode");
  });

  it("stops answering at once when the account disconnects the app", async () => {
    const { accessToken } = await connectAssistant(aliceId);
    const [grant] = await listOAuthGrants(ctx, aliceId);
    expect(grant).toBeDefined();
    expect((await revokeOAuthGrant(ctx, { userId: bobId, grantId: grant?.id ?? "" })).ok).toBe(false);
    expect((await revokeOAuthGrant(ctx, { userId: aliceId, grantId: grant?.id ?? "" })).ok).toBe(true);
    expect((await mcp(accessToken, "tools/list")).status).toBe(401);
  });

  it("names the read-only access on the consent page", () => {
    expect(getMcpAccessMessages(config).consent.readAccess).toBe("Read only: the notes in the folders you shared");
  });
});

describe("isolation between accounts and folders", () => {
  /** Every call an assistant could make, aimed at the other account's paths and the unshared folder too. */
  const PROBES: readonly [string, Record<string, unknown>][] = [
    ["vault_index", {}],
    ["vault_index", { recursive: true, max_results: 500 }],
    ["vault_index", { folder: "Work", recursive: true }],
    ["vault_index", { folder: "Notes" }],
    ["vault_index", { folder: "Personal" }],
    ["vault_index", { filter: "plan" }],
    ["vault_index", { filter: "diary" }],
    ["vault_index", { filter: "ideas" }],
    ["get_note", { path: "Work/Plan.md" }],
    ["get_note", { path: "Work/Clients/Acme.md" }],
    ["get_note", { path: "Personal/Diary.md" }],
    ["get_note", { path: "Notes/Ideas.md" }],
    ["get_note", { path: "../Personal/Diary.md" }],
    ["vault_status", {}],
  ];

  async function answersFor(token: string): Promise<string> {
    const texts: string[] = [];
    for (const [name, args] of PROBES) texts.push((await callTool(token, name, args)).text);
    return texts.join("\n");
  }

  it("never shows an account another account's notes, nor a note of a folder it did not share", async () => {
    const alice = (await connectAssistant(aliceId)).accessToken;
    const bob = (await connectAssistant(bobId)).accessToken;
    const aliceAnswers = await answersFor(alice);
    const bobAnswers = await answersFor(bob);
    expect(aliceAnswers).toContain("ALICE-WORK");
    expect(aliceAnswers).not.toMatch(/BOB-SECRET|ALICE-PRIVATE|vault-2/);
    expect(bobAnswers).toContain("BOB-SECRET");
    expect(bobAnswers).not.toMatch(/ALICE|Client work|vault-1/);
    // A path the account cannot read gets the same answer whether the note exists elsewhere or nowhere.
    const unshared = await callTool(alice, "get_note", { path: "Personal/Diary.md" });
    const missing = await callTool(alice, "get_note", { path: "Personal/Nothing.md" });
    expect(unshared.isError).toBe(true);
    expect(unshared.text.replace("Diary", "Nothing")).toBe(missing.text);
  });

  it("drops a folder's notes from every answer as soon as the pick is removed, before the next sync", async () => {
    const alice = (await connectAssistant(aliceId)).accessToken;
    await fixture.pick(aliceId, ["Work/Clients"]);
    const answers = await answersFor(alice);
    expect(answers).toContain("ALICE-CLIENT");
    expect(answers).not.toContain("ALICE-WORK");
    expect((await callTool(alice, "get_note", { path: "Work/Plan.md" })).isError).toBe(true);
  });

  it("serves a hand-issued token the same account-bound answers", async () => {
    const issued = await issueAccessToken(ctx, { userId: bobId, name: "CLI", canWrite: true });
    if (!issued.ok) throw new Error(issued.error);
    expect(issued.value.canWrite).toBe(false);
    const answers = await answersFor(issued.value.token);
    expect(answers).toContain("BOB-SECRET");
    expect(answers).not.toContain("ALICE");
  });

  it("changes nothing: the store and the tables are the same after every call", async () => {
    const alice = (await connectAssistant(aliceId)).accessToken;
    const before = await snapshot();
    await answersFor(alice);
    expect(await snapshot()).toEqual(before);
  });
});

describe("the tool catalog", () => {
  it("lists exactly the tools the server registers, none of them writing", async () => {
    await expectToolCatalogMatchesServer(config, createVaultServerFactory(() => Promise.resolve(fixture.readContext)));
  });
});

/** The store's objects and the vault and connector tables, as text: anything a tool wrote would change it. */
async function snapshot(): Promise<string> {
  const objects = [...fixture.storage.objects().entries()].map(([key, value]) => `${key}:${createHash("sha256").update(value).digest("hex")}`).sort();
  const tables = await ctx.db.execute(sql`
    SELECT table_schema || '.' || table_name AS name FROM information_schema.tables
    WHERE table_schema IN ('vault', 'connector') ORDER BY 1`);
  const rows: string[] = [];
  for (const { name } of tables.rows as { name: string }[]) {
    const result = await ctx.db.execute(sql.raw(`SELECT * FROM ${name}`));
    rows.push(`${name}:${JSON.stringify(result.rows.map((row) => JSON.stringify(row)).sort())}`);
  }
  return JSON.stringify({ objects, rows });
}
