// Connecting a vault of an Obsidian Sync subscription as the vault source on both hosts (VC-22), against the fake sync
// service of e2e/fake-services.mjs: a wrong account password is reported and nothing is stored; after sign-in the
// vaults are listed with their encryption; an end-to-end vault refuses a wrong encryption password and connects with
// the right one, whose text never leaves the browser; the folder picker then lists the vault's folders read over the
// sync socket; a standard vault connects with no password at all; disconnecting forgets the source.
import type { Page } from "@playwright/test";
import { expect, test, uniqueEmail } from "@softure-ai/testing/playwright";
import { en } from "../src/messages/en.ts";
import { AUTH_COPY, approveGithubAs, deleteAccounts, openAccountsDatabase, PANEL_PATH, uniqueGithubId } from "./accounts.ts";
import { SYNC_TEST_E2EE_PASSWORD, SYNC_TEST_E2EE_VAULT, SYNC_TEST_EMAIL, SYNC_TEST_PASSWORD, SYNC_TEST_STANDARD_VAULT } from "./services.ts";

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

async function signUp(page: Page, prefix: string): Promise<string> {
  const email = uniqueEmail(prefix);
  created.push(email);
  await approveGithubAs(page, { id: uniqueGithubId(), login: `${prefix}-${String(Date.now())}`, email });
  await page.goto("/register");
  await page.getByRole("button", { name: SIGN_IN_WITH_GITHUB }).click();
  await expect(page).toHaveURL(PANEL_PATH);
  return email;
}

async function signInToSync(page: Page, password: string): Promise<void> {
  await page.getByLabel(en.headlessSync.email, { exact: true }).fill(SYNC_TEST_EMAIL);
  await page.getByLabel(en.headlessSync.password, { exact: true }).fill(password);
  await page.getByRole("button", { name: en.headlessSync.signIn }).click();
}

async function countSources(email: string): Promise<number> {
  const db = await openAccountsDatabase();
  try {
    const rows = await db.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM vault.sources WHERE user_id = (SELECT id FROM auth.users WHERE email = $1)",
      [email],
    );
    return Number(rows[0]?.count ?? "0");
  } finally {
    await db.close();
  }
}

test("a person connects an end-to-end vault from Obsidian Sync without the encryption password leaving the browser", async ({ page }) => {
  const sent: string[] = [];
  page.on("request", (request) => sent.push(`${request.url()} ${request.postData() ?? ""}`));
  const email = await signUp(page, "vc-sync");
  await page.goto("/panel/source");
  await expect(page.getByTestId("sync-connect-card")).toBeVisible();
  await page.getByRole("link", { name: en.headlessSync.cardAction }).click();
  await expect(page.getByRole("heading", { name: en.headlessSync.title })).toBeVisible();

  await signInToSync(page, "not the password");
  await expect(page.getByTestId("sync-error")).toHaveText(en.headlessSync.errors["vault.headless_sign_in_refused"]);
  expect(await countSources(email)).toBe(0);

  await signInToSync(page, SYNC_TEST_PASSWORD);
  const vaults = page.getByTestId("sync-vault");
  await expect(vaults).toHaveCount(2);
  const privateVault = vaults.filter({ hasText: SYNC_TEST_E2EE_VAULT });
  await expect(privateVault).toContainText(en.headlessSync.e2ee);
  await expect(vaults.filter({ hasText: SYNC_TEST_STANDARD_VAULT })).toContainText(en.headlessSync.standard);

  await privateVault.getByLabel(en.headlessSync.e2eePassword).fill("a wrong guess");
  await privateVault.getByRole("button", { name: en.headlessSync.connect }).click();
  await expect(page.getByTestId("sync-error")).toHaveText(en.headlessSync.errors["vault.headless_key_refused"]);
  expect(await countSources(email)).toBe(0);

  const retry = page.getByTestId("sync-vault").filter({ hasText: SYNC_TEST_E2EE_VAULT });
  await retry.getByLabel(en.headlessSync.e2eePassword).fill(SYNC_TEST_E2EE_PASSWORD);
  await retry.getByRole("button", { name: en.headlessSync.connect }).click();
  await expect(page).toHaveURL(/\/panel\/source\?linked=headless-sync$/);
  await expect(page.getByTestId("source-linked")).toHaveText(en.headlessSync.linked);
  const card = page.getByTestId("source-card");
  await expect(card).toHaveAttribute("data-status", "connected");
  await expect(card).toHaveAttribute("data-kind", "headless-sync");
  await expect(page.getByTestId("source-repository")).toContainText(SYNC_TEST_E2EE_VAULT);
  expect(sent.filter((line) => line.includes(SYNC_TEST_E2EE_PASSWORD))).toEqual([]);

  await page.goto("/panel/folders");
  const items = page.getByTestId("folder-item");
  await expect(items).toHaveCount(4);
  expect(await items.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-path")))).toEqual([
    "Journal",
    "Projects",
    "Projects/Archive",
    "Recipes",
  ]);

  await page.goto("/panel/source");
  await page.getByRole("button", { name: en.source.disconnectAction }).click();
  await expect(page.getByTestId("sync-connect-card")).toBeVisible();
  expect(await countSources(email)).toBe(0);
});

test("a person connects a standard vault from Obsidian Sync with no encryption password", async ({ page }) => {
  await signUp(page, "vc-sync-std");
  await page.goto("/panel/source/headless-sync");
  await signInToSync(page, SYNC_TEST_PASSWORD);
  const standard = page.getByTestId("sync-vault").filter({ hasText: SYNC_TEST_STANDARD_VAULT });
  await expect(standard).toContainText(en.headlessSync.standardBody);
  await standard.getByRole("button", { name: en.headlessSync.connect }).click();
  await expect(page).toHaveURL(/\/panel\/source\?linked=headless-sync$/);
  await expect(page.getByTestId("source-repository")).toContainText(SYNC_TEST_STANDARD_VAULT);
});
