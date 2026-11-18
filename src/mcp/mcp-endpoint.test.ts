// The MCP endpoint end to end on a test database, as an assistant uses it: dynamic client registration, the account's
// consent, the code exchange with PKCE, then the read-only tools over a bearer token; revoking the connection ends it.
// Two fixture accounts prove the isolation (NFR-2): no answer to one account carries the other's notes, or a note of a
// folder it did not share. The tools change nothing: the store and the tables are the same after every call.
import { createHash, randomBytes } from "node:crypto";
import type { ModuleContext } from "@softure-ai/core";
import type { Queryable } from "@softure-ai/db";
import { createMcpEndpoint, getAuthorizationServerMetadata, getMcpAccessMessages, getProtectedResourceMetadata, handleAuthorizationDecision, handleClientRegistration, handleTokenRequest, issueAccessToken, listOAuthGrants, revokeOAuthGrant } from "@softure-ai/mcp-access/server";
import { expectToolCatalogMatchesServer } from "@softure-ai/mcp-access/testing";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import config from "../../softure.config.ts";
import { saveVaultDescription } from "./profile/vault-description.ts";
import { consumeUsage, grantPlanManually } from "@softure-ai/billing/server";
import { METERS } from "../lib/plans.ts";
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

interface ConnectOptions {
  readonly redirectUri?: string;
  readonly clientName?: string;
  /** RFC 8707 `resource`, sent on the authorization and the token request as ChatGPT does. */
  readonly resource?: string;
}

/** Connects an assistant for the account the way claude.ai does: register, consent, exchange the code. */
async function connectAssistant(userId: string, options: ConnectOptions = {}): Promise<{ accessToken: string; clientId: string; callback: URL }> {
  const { redirectUri = REDIRECT_URI, clientName = "Test assistant", resource } = options;
  const withResource: Record<string, string> = resource === undefined ? {} : { resource };
  const registration = await handleClientRegistration(
    ctx,
    new Request(`${ORIGIN}/api/oauth/register`, {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": CLIENT_IP },
      body: JSON.stringify({ client_name: clientName, redirect_uris: [redirectUri], token_endpoint_auth_method: "none" }),
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
        redirect_uri: redirectUri,
        response_type: "code",
        code_challenge: challenge,
        code_challenge_method: "S256",
        state: "s1",
        decision: "allow",
        ...withResource,
      }),
    }),
    userId,
  );
  expect(decision.status).toBe(303);
  const callback = new URL(decision.headers.get("location") ?? "");
  const code = callback.searchParams.get("code");
  expect(code).not.toBeNull();
  const token = await handleTokenRequest(
    ctx,
    new Request(`${ORIGIN}/api/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": CLIENT_IP },
      body: new URLSearchParams({ grant_type: "authorization_code", code: code ?? "", redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier, ...withResource }),
    }),
  );
  expect(token.status).toBe(200);
  const tokens = (await token.json()) as { access_token: string; scope?: string };
  expect(tokens.scope ?? "").not.toContain("write");
  return { accessToken: tokens.access_token, clientId, callback };
}

async function callTool(token: string, name: string, args: Record<string, unknown> = {}): Promise<{ text: string; isError: boolean }> {
  const { status, body } = await mcp(token, "tools/call", { name, arguments: args });
  expect(status).toBe(200);
  const result = body?.result as { content: { type: string; text: string }[]; isError?: boolean };
  return { text: result.content.map((part) => part.text).join("\n"), isError: result.isError === true };
}

describe("connecting an assistant over OAuth", () => {
  it("registers, takes the account's consent, and lists four read-only tools with their titles and annotations", async () => {
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
      "Plan: Trial",
      "Notes copied: 3 of 5000",
      "Storage used: 0.1 MiB of 500 MiB",
      "Searches this month: 0 of 1000 (the allowance resets on 2026-12-01 00:00 UTC)",
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

describe("connecting ChatGPT (VC-19)", () => {
  const STABLE_REDIRECT = "https://chatgpt.com/connector_platform_oauth_redirect";
  const CALLBACK_ID_REDIRECT = "https://chatgpt.com/connector/oauth/c_0f3a9e";
  const RESOURCE = `${ORIGIN}/api/mcp`;

  it("advertises what ChatGPT reads: S256, registration, issuer identification, one issuer in both documents", () => {
    const server = getAuthorizationServerMetadata(config);
    const resource = getProtectedResourceMetadata(config, "endpoint");
    expect(server.code_challenge_methods_supported).toEqual(["S256"]);
    expect(server.registration_endpoint).toBe(`${server.issuer}/api/oauth/register`);
    expect(server.token_endpoint_auth_methods_supported).toContain("none");
    expect(server.authorization_response_iss_parameter_supported).toBe(true);
    expect(resource.resource).toBe(RESOURCE);
    expect(resource.authorization_servers).toEqual([server.issuer]);
  });

  for (const redirectUri of [STABLE_REDIRECT, CALLBACK_ID_REDIRECT]) {
    it(`completes OAuth with the redirect ${new URL(redirectUri).pathname} and lists the tools ChatGPT links to the account`, async () => {
      const { accessToken, callback } = await connectAssistant(aliceId, { redirectUri, clientName: "ChatGPT", resource: RESOURCE });
      expect(`${callback.origin}${callback.pathname}`).toBe(redirectUri);
      expect(callback.searchParams.get("state")).toBe("s1");
      expect(callback.searchParams.get("iss")).toBe(getAuthorizationServerMetadata(config).issuer);
      const listed = await mcp(accessToken, "tools/list");
      const tools = (listed.body?.result as { tools: { name: string; annotations?: Record<string, unknown>; _meta?: Record<string, unknown> }[] }).tools;
      expect(tools.map(({ name }) => name).sort()).toEqual([...VAULT_TOOL_NAMES].sort());
      for (const tool of tools) {
        expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, openWorldHint: false });
        expect(tool._meta).toEqual({ securitySchemes: [{ type: "oauth2", scopes: ["mcp:read"] }] });
      }
      expect((await callTool(accessToken, "get_note", { path: "Work/Plan.md" })).text).toContain("ALICE-WORK");
    });
  }
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
    ["search_vault", { query: "plan" }],
    ["search_vault", { query: "ship the report on Friday" }],
    ["search_vault", { query: "not shared private diary" }],
    ["search_vault", { query: "Bob own plan ideas secret" }],
    ["search_vault", { query: "client notes", folder: "Work" }],
    ["search_vault", { query: "diary", folder: "Personal" }],
    ["search_vault", { query: "plan", mode: "meaning", max_results: 20 }],
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

describe("searching the shared notes", () => {
  it("finds the passage that answers, with its path and score, the passage between the markers", async () => {
    const { accessToken } = await connectAssistant(aliceId);
    const answer = await callTool(accessToken, "search_vault", { query: "when do we ship the report" });
    expect(answer.isError).toBe(false);
    const [header, ...rest] = answer.text.split("\n");
    expect(header).toMatch(/^Search for "when do we ship the report" \(words and meaning\): \d passages?, best first\.$/);
    expect(rest[0]).toBe(UNTRUSTED_OPEN);
    expect(rest[1]).toMatch(/^1\. Work\/Plan\.md \(score 0\.\d{4}\)$/);
    expect(rest.at(-1)).toBe(UNTRUSTED_CLOSE);
    expect(answer.text).toContain("ALICE-WORK: ship the report on Friday.");
    expect(answer.text).not.toContain("ALICE-PRIVATE");
  });

  it("narrows to a folder, accepts it with slashes, and refuses a folder that is not shared", async () => {
    const { accessToken } = await connectAssistant(aliceId);
    const narrowed = await callTool(accessToken, "search_vault", { query: "notes", folder: "/Work/Clients/" });
    expect(narrowed.isError).toBe(false);
    expect(narrowed.text).toContain('Search for "notes" (words and meaning in Work/Clients/)');
    const listed = narrowed.text.split("\n").filter((line) => /^\d+\. /.test(line));
    expect(listed).toEqual([expect.stringMatching(/^1\. Work\/Clients\/Acme\.md /)]);
    const refused = await callTool(accessToken, "search_vault", { query: "diary", folder: "Personal" });
    expect(refused).toEqual({ isError: true, text: "No shared folder Personal. Search every shared folder by leaving `folder` out, or pick one of: Work" });
  });

  it("answers no results with the query echoed, and keeps to max_results", async () => {
    const { accessToken } = await connectAssistant(aliceId);
    const none = await callTool(accessToken, "search_vault", { query: "zebra", mode: "keyword" });
    expect(none).toEqual({
      isError: false,
      text: 'No results for "zebra". Try other words, the keyword or meaning mode, or vault_index to browse by name.',
    });
    const one = await callTool(accessToken, "search_vault", { query: "plan", max_results: 1 });
    expect(one.text).toContain("1. ");
    expect(one.text).not.toMatch(/^2\. /m);
    expect((await callTool(accessToken, "search_vault", { query: "plan", max_results: 21 })).isError).toBe(true);
    expect(await callTool(accessToken, "search_vault", { query: "   " })).toEqual({ isError: true, text: "Give something to search for, e.g. a question or a few words." });
  });

  it("refuses a search past the month's allowance with the reset date, while the other tools keep working", async () => {
    // The trial allows 1000 searches a month; 998 of them are used already.
    expect((await consumeUsage(ctx, { userId: aliceId, meter: METERS.searches, amount: 998 })).ok).toBe(true);
    const alice = (await connectAssistant(aliceId)).accessToken;
    const bob = (await connectAssistant(bobId)).accessToken;
    expect((await callTool(alice, "search_vault", { query: "plan" })).isError).toBe(false);
    // A refused call (no query) does not count.
    expect((await callTool(alice, "search_vault", { query: "" })).isError).toBe(true);
    expect((await callTool(alice, "search_vault", { query: "report" })).isError).toBe(false);
    const refused = await callTool(alice, "search_vault", { query: "client" });
    expect(refused).toEqual({
      isError: true,
      text: "This account has used all 1000 searches of this month. Search works again on 2026-12-01 00:00 UTC; vault_index and get_note keep working meanwhile.",
    });
    expect((await callTool(alice, "get_note", { path: "Work/Plan.md" })).isError).toBe(false);
    expect((await callTool(alice, "vault_index")).isError).toBe(false);
    expect((await callTool(alice, "vault_status")).text).toContain("Searches this month: 1000 of 1000 (the allowance resets on 2026-12-01 00:00 UTC)");
    // Another account has its own allowance.
    expect((await callTool(bob, "search_vault", { query: "plan" })).isError).toBe(false);
    // A new month starts a new allowance (the assistant connects again: its token from two weeks ago has expired). The
    // trial has ended by then, so the account is on the paid plan's allowance.
    expect((await grantPlanManually(ctx, { userId: aliceId, planId: "monthly", adminId: null })).ok).toBe(true);
    fixture.clock.set(new Date("2026-12-01T00:00:01Z"));
    const nextMonth = (await connectAssistant(aliceId)).accessToken;
    expect((await callTool(nextMonth, "search_vault", { query: "plan" })).isError).toBe(false);
    expect((await callTool(nextMonth, "vault_status")).text).toContain("Searches this month: 1 of 5000 (the allowance resets on 2027-01-01 00:00 UTC)");
  });

  it("uses no search for an account that shares nothing yet", async () => {
    const carolId = await fixture.createAccount("carol@example.com");
    const carol = (await connectAssistant(carolId)).accessToken;
    const answer = await callTool(carol, "search_vault", { query: "plan" });
    expect(answer.isError).toBe(true);
    expect(answer.text).toContain(PANEL_URL);
    expect((await callTool(carol, "vault_status")).text).toContain("Searches this month: 0 of 1000");
  });
});

describe("once the account's access ended (VC-15)", () => {
  const ENDED =
    `This account's access ended on 2026-12-01, so its notes cannot be read or searched until the person renews it on the VaultConnector website: ${ORIGIN} ` +
    "The shared notes are kept until 2026-12-31 and removed after that.";

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("points every reading tool to the product's website instead of note content, and status says the same", async () => {
    // The trial began on 2026-11-17 and ended when 2026-12-01 began.
    fixture.clock.set(new Date("2026-12-02T10:00:00Z"));
    const alice = (await connectAssistant(aliceId)).accessToken;
    expect(await callTool(alice, "vault_index")).toEqual({ isError: true, text: ENDED });
    expect(await callTool(alice, "get_note", { path: "Work/Plan.md" })).toEqual({ isError: true, text: ENDED });
    expect(await callTool(alice, "search_vault", { query: "plan" })).toEqual({ isError: true, text: ENDED });
    const status = await callTool(alice, "vault_status");
    expect(status.isError).toBe(false);
    expect(status.text).toContain("Plan: Access ended");
    expect(status.text).toContain(ENDED);
    expect(status.text).not.toContain("ALICE-");
  });

  it("says the copies are gone once the grace period is over", async () => {
    fixture.clock.set(new Date("2026-12-31T00:00:00Z"));
    const alice = (await connectAssistant(aliceId)).accessToken;
    expect(await callTool(alice, "vault_index")).toEqual({
      isError: true,
      text: `This account's access ended on 2026-12-01 and its copied notes were removed after the grace period. Once the person renews it on the VaultConnector website (${ORIGIN}), the shared folders are copied again.`,
    });
  });

  it("reads again as soon as the account pays", async () => {
    fixture.clock.set(new Date("2026-12-02T10:00:00Z"));
    expect((await grantPlanManually(ctx, { userId: aliceId, planId: "monthly", adminId: null })).ok).toBe(true);
    const alice = (await connectAssistant(aliceId)).accessToken;
    expect((await callTool(alice, "get_note", { path: "Work/Plan.md" })).text).toContain("ALICE-WORK");
    expect((await callTool(alice, "search_vault", { query: "report" })).isError).toBe(false);
    expect((await callTool(alice, "vault_status")).text).not.toContain("access ended");
  });

  it("never ends access on an instance without plans (PLAN_LIMITS=unlimited)", async () => {
    vi.stubEnv("PLAN_LIMITS", "unlimited");
    fixture.clock.set(new Date("2027-03-01T10:00:00Z"));
    const alice = (await connectAssistant(aliceId)).accessToken;
    expect((await callTool(alice, "get_note", { path: "Work/Plan.md" })).text).toContain("ALICE-WORK");
    expect((await callTool(alice, "vault_index")).isError).toBe(false);
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
