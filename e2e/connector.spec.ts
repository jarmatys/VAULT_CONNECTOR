// Connecting an assistant on both hosts, the way claude.ai does it: dynamic client registration over HTTP, the consent
// page in the browser (it names the signed-in account and the read-only access), the code exchange with PKCE, then the
// four read-only tools through /api/mcp. The "Connect Claude" screen shows the connector URL, saves the account's
// sentence and lists the connected app; disconnecting it ends the access at once.
import { randomUUID } from "node:crypto";
import { mcpAccessMessages } from "@softure-ai/mcp-access";
import { expect, registerAccount, test, uniqueEmail } from "@softure-ai/testing/playwright";
import { en } from "../src/messages/en.ts";
import { AUTH_COPY, deleteAccounts, openAccountsDatabase, PANEL_PATH } from "./accounts.ts";
import { connectAssistant } from "./assistant.ts";

const CLIENT_NAME = "E2E assistant";
const ACCESS = mcpAccessMessages.en;
const created: string[] = [];

test.afterAll(async () => {
  const db = await openAccountsDatabase();
  try {
    await deleteAccounts(db, created);
  } finally {
    await db.close();
  }
});

test("an assistant registers, gets the account's read-only consent, lists the tools and loses access when disconnected", async ({ page, request, baseURL }) => {
  const email = uniqueEmail("vc-connector");
  created.push(email);
  await registerAccount(page, { copy: AUTH_COPY, email, password: randomUUID(), landingPath: PANEL_PATH });

  const assistant = await connectAssistant({
    page,
    request,
    baseURL,
    clientName: CLIENT_NAME,
    onConsent: async (consent) => {
      await expect(consent.getByText(email)).toBeVisible();
      await expect(consent.getByText(en.mcpAccess.consent.readAccess)).toBeVisible();
      await expect(consent.getByText(ACCESS.consent.allowWrite)).toHaveCount(0);
    },
  });
  const listTools = () => assistant.listTools();
  const listed = await listTools();
  expect(listed.status()).toBe(200);
  const body = await listed.text();
  for (const name of ["vault_index", "get_note", "search_vault", "vault_status"]) expect(body).toContain(`"name":"${name}"`);
  expect(body).toContain('"readOnlyHint":true');

  await page.goto("/panel/connectors");
  await expect(page.getByRole("heading", { level: 1, name: en.connectors.title })).toBeVisible();
  await expect(page.getByTestId("connector-url")).toContainText(`${baseURL ?? ""}/api/mcp`);
  await page.getByLabel(en.connectors.descriptionLabel).fill("My work notes: clients and plans.");
  await page.getByRole("button", { name: en.connectors.descriptionSave }).click();
  await expect(page.getByTestId("description-saved")).toBeVisible();
  await expect(page.getByLabel(en.connectors.descriptionLabel)).toHaveValue("My work notes: clients and plans.");

  await page.getByRole("button", { name: `${ACCESS.grants.disconnect}: ${CLIENT_NAME}` }).click();
  await expect(page.getByText(ACCESS.grants.empty)).toBeVisible();
  expect((await listTools()).status()).toBe(401);
});

test("the sentence about the vault refuses more than the limit and keeps what was saved", async ({ page }) => {
  const email = uniqueEmail("vc-sentence");
  created.push(email);
  await registerAccount(page, { copy: AUTH_COPY, email, password: randomUUID(), landingPath: PANEL_PATH });
  await page.goto("/panel/connectors");
  await page.getByLabel(en.connectors.descriptionLabel).fill("x".repeat(301));
  await page.getByRole("button", { name: en.connectors.descriptionSave }).click();
  await expect(page.getByTestId("description-error")).toContainText("300");
  await expect(page.getByLabel(en.connectors.descriptionLabel)).toHaveValue("");
});

test("the OAuth discovery documents name the MCP endpoint and the app as its authorization server", async ({ request, baseURL }) => {
  const resource = await request.get("/.well-known/oauth-protected-resource/api/mcp");
  expect(resource.status()).toBe(200);
  expect(await resource.json()).toMatchObject({ resource: `${baseURL ?? ""}/api/mcp`, authorization_servers: [baseURL] });
  const server = await request.get("/.well-known/oauth-authorization-server");
  expect(await server.json()).toMatchObject({ registration_endpoint: `${baseURL ?? ""}/api/oauth/register`, code_challenge_methods_supported: ["S256"] });
  const anonymous = await request.post("/api/mcp", { data: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
  expect(anonymous.status()).toBe(401);
  expect(anonymous.headers()["www-authenticate"]).toContain("resource_metadata");
});
