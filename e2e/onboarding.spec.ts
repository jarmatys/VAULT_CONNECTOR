// The two-minute onboarding (VC-12, G-2) on both hosts, timed: a new account signs up with GitHub, connects the fixture
// vault, shares one folder, watches the overview fill its search index by itself, saves a sentence about its vault,
// adds the connector the way Claude does it and gets its first answer from a shared note. The whole run, from the
// sign-up page to that answer, must take two minutes or less; the time is recorded on the test.
import type { Page } from "@playwright/test";
import { expect, test, uniqueEmail } from "@softure-ai/testing/playwright";
import { en } from "../src/messages/en.ts";
import { AUTH_COPY, approveGithubAs, deleteAccounts, openAccountsDatabase, PANEL_PATH, signInToFakeGithub, uniqueGithubId } from "./accounts.ts";
import { connectAssistant } from "./assistant.ts";

/** G-2: from a new account to the first answer. */
const ONBOARDING_BUDGET_MS = 120_000;
const SIGN_IN_WITH_GITHUB = AUTH_COPY.oidc.signInWith.replace("{provider}", "GitHub");
const created: string[] = [];

test.afterAll(async () => {
  const db = await openAccountsDatabase();
  try {
    await deleteAccounts(db, created);
  } finally {
    await db.close();
  }
});

function step(page: Page, id: string) {
  return page.getByTestId(`onboarding-${id}`);
}

test("a new account goes from sign-up to Claude's first answer from its notes in two minutes or less", async ({ page, request, baseURL }) => {
  test.setTimeout(ONBOARDING_BUDGET_MS + 30_000);
  const email = uniqueEmail("vc-onboarding");
  created.push(email);
  const user = { id: uniqueGithubId(), login: `vc-onboarding-${String(Date.now())}`, email };
  const startedAt = Date.now();

  await approveGithubAs(page, user);
  await page.goto("/register");
  await page.getByRole("button", { name: SIGN_IN_WITH_GITHUB }).click();
  await expect(page).toHaveURL(PANEL_PATH);
  await expect(step(page, "source")).toHaveAttribute("data-state", "current");
  await expect(step(page, "folders")).toHaveCount(0);

  await signInToFakeGithub(page, user, [`${user.login}/vault`]);
  await page.getByRole("link", { name: en.panel.nextStepAction }).click();
  await page.getByRole("button", { name: en.source.connectAction }).click();
  await expect(page.getByTestId("source-card")).toHaveAttribute("data-status", "connected");

  await page.goto(PANEL_PATH);
  await expect(step(page, "folders")).toHaveAttribute("data-state", "current");
  await page.getByRole("link", { name: en.panel.foldersStepAction }).click();
  await page.locator('[data-testid="folder-item"][data-path="Projects"]').getByRole("checkbox").first().check();
  await page.getByRole("button", { name: en.folders.save }).click();
  await expect(page.getByTestId("folders-saved")).toBeVisible();

  // The overview reads itself again while the index fills; nothing here reloads it.
  await page.goto(PANEL_PATH);
  await expect(step(page, "index")).toHaveAttribute("data-state", "done", { timeout: 90_000 });
  await expect(page.getByTestId("panel-status")).toContainText("3 / 3");
  await expect(step(page, "assistant")).toHaveAttribute("data-state", "current");
  await expect(step(page, "assistant").getByTestId("connector-url")).toHaveText(`${baseURL ?? ""}/api/mcp`);
  await expect(step(page, "assistant").getByRole("button", { name: en.onboarding.copyUrl })).toBeVisible();

  await page.getByLabel(en.connectors.descriptionTitle).fill("My home notes: the garden and the kitchen.");
  await page.getByRole("button", { name: en.connectors.descriptionSave }).click();
  await expect(page.getByTestId("description-saved")).toBeVisible();
  await expect(page.getByLabel(en.connectors.descriptionTitle)).toHaveValue("My home notes: the garden and the kitchen.");

  const assistant = await connectAssistant({ page, request, baseURL, clientName: "E2E Claude" });
  const answer = await assistant.callTool("search_vault", { query: "raised beds" });
  expect(answer.status()).toBe(200);
  expect(await answer.text()).toContain("Projects/Garden.md");
  const elapsedMs = Date.now() - startedAt;

  await page.goto(PANEL_PATH);
  await expect(step(page, "assistant")).toHaveAttribute("data-state", "done");
  await expect(step(page, "question")).toHaveAttribute("data-state", "current");
  await expect(page.getByTestId("onboarding-complete")).toBeVisible();

  test.info().annotations.push({ type: "onboarding-ms", description: String(elapsedMs) });
  console.log(`onboarding: ${String(elapsedMs)} ms from sign-up to the first answer`);
  expect(elapsedMs).toBeLessThanOrEqual(ONBOARDING_BUDGET_MS);
});
