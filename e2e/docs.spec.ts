// The public docs and the agent discovery documents (VC-17, FR-21) on both hosts: the docs home lists every page, each
// page opens with its title and its text, and the documents agents read (API catalog, server card, AI catalog, skills,
// auth.md, the home page's Link header) answer and name the four read-only tools.
import { expect, test } from "@playwright/test";
import { DOCS_PATH, PUBLISHED_DOC_SLUGS } from "../src/docs/docs-content.ts";
import { loadDocPages } from "../src/docs/load-docs.ts";
import { en } from "../src/messages/en.ts";

const PAGES = loadDocPages();
const TOOLS = ["get_note", "search_vault", "vault_index", "vault_status"];

test("the docs home lists every page and opens one", async ({ page }) => {
  await page.goto(DOCS_PATH);
  await expect(page.getByRole("heading", { level: 1, name: en.docs.title })).toBeVisible();
  const navigation = page.getByRole("navigation", { name: en.docs.navLabel });
  for (const doc of PAGES) await expect(navigation.getByRole("link", { name: doc.title, exact: true })).toHaveAttribute("href", `${DOCS_PATH}/${doc.slug}`);
  await navigation.getByRole("link", { name: "Tools", exact: true }).click();
  await expect(page).toHaveURL(`${DOCS_PATH}/tools`);
  await expect(page.getByRole("heading", { level: 1, name: "Tools" })).toBeVisible();
});

for (const doc of PAGES) {
  test(`the docs page ${doc.slug} opens with its title, description and text`, async ({ page }) => {
    const response = await page.goto(`${DOCS_PATH}/${doc.slug}`);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(new RegExp(doc.title));
    await expect(page.getByRole("heading", { level: 1, name: doc.title })).toBeVisible();
    await expect(page.locator('[data-slot="prose"]')).toBeVisible();
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", doc.description);
  });
}

test("an unknown docs page answers 404", async ({ request }) => {
  expect((await request.get(`${DOCS_PATH}/no-such-page`)).status()).toBe(404);
});

test("sitemap.xml lists every docs page", async ({ request, baseURL }) => {
  const sitemap = await (await request.get("/sitemap.xml")).text();
  for (const slug of PUBLISHED_DOC_SLUGS) expect(sitemap).toContain(`<loc>${String(baseURL)}${DOCS_PATH}/${slug}</loc>`);
});

test("the API catalog points at the MCP endpoint, the docs and the health check", async ({ request }) => {
  const response = await request.get("/.well-known/api-catalog");
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain("/api/mcp");
  expect(body).toContain(DOCS_PATH);
  expect(body).toContain("/api/health");
});

test("the MCP server card and the A2A card list exactly the four read-only tools", async ({ request }) => {
  const card = (await (await request.get("/.well-known/mcp/server-card.json")).json()) as { tools?: { name: string }[] };
  expect((card.tools ?? []).map((tool) => tool.name).sort()).toEqual(TOOLS);
  const agentCard = (await (await request.get("/.well-known/agent-card.json")).json()) as { skills?: { id: string }[] };
  expect((agentCard.skills ?? []).map((skill) => skill.id).sort()).toEqual(TOOLS);
});

test("the AI catalog, the skills index and its skill, auth.md and OpenAPI answer", async ({ request }) => {
  expect((await request.get("/.well-known/ai-catalog.json")).status()).toBe(200);
  const index = (await (await request.get("/.well-known/agent-skills/index.json")).json()) as { skills: { url: string }[] };
  expect(index.skills.length).toBeGreaterThan(0);
  for (const skill of index.skills) expect((await request.get(skill.url)).status()).toBe(200);
  const authMd = await request.get("/auth.md");
  expect(authMd.status()).toBe(200);
  expect(await authMd.text()).toContain("/.well-known/oauth-authorization-server");
  expect((await request.get("/openapi.json")).status()).toBe(200);
});

test("the home page's Link header points agents at the catalog and the docs", async ({ request }) => {
  const link = (await request.get("/")).headers()["link"] ?? "";
  expect(link).toContain("/.well-known/api-catalog");
  expect(link).toContain(DOCS_PATH);
});
