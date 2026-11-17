// Connecting a Dropbox folder as the vault source on both hosts (VC-21), against the fake Dropbox of
// e2e/fake-services.mjs: access declined on Dropbox's consent page is reported on the form and nothing is stored; an
// approved read-only grant connects the folder, the source screen names it, and the folder picker lists the vault's
// folders from Dropbox.
import type { Page } from "@playwright/test";
import { expect, test, uniqueEmail } from "@softure-ai/testing/playwright";
import { en } from "../src/messages/en.ts";
import { AUTH_COPY, approveGithubAs, deleteAccounts, openAccountsDatabase, PANEL_PATH, uniqueGithubId } from "./accounts.ts";
import { DROPBOX_TEST_FOLDER, FAKE_SERVICES_ORIGIN } from "./services.ts";

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

async function setDropboxDenial(page: Page, isDenied: boolean): Promise<void> {
  await page.context().addCookies([{ name: "fake_dropbox_deny", value: isDenied ? "1" : "0", url: FAKE_SERVICES_ORIGIN }]);
}

async function submitFolder(page: Page, folder: string): Promise<void> {
  await page.getByLabel(en.dropbox.folder, { exact: true }).fill(folder);
  await page.getByRole("button", { name: en.dropbox.submit }).click();
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

test("a person connects a Dropbox folder read-only, sees it named, and picks folders from it", async ({ page }) => {
  const email = await signUp(page, "vc-dropbox");
  await page.goto("/panel/source");
  await expect(page.getByTestId("dropbox-connect-card")).toBeVisible();
  await page.getByRole("link", { name: en.dropbox.cardAction }).click();
  await expect(page.getByRole("heading", { name: en.dropbox.title })).toBeVisible();

  await submitFolder(page, "../up");
  await expect(page.getByTestId("dropbox-error")).toHaveText(en.dropbox.errors["vault.dropbox_folder_invalid"]);

  await setDropboxDenial(page, true);
  await submitFolder(page, DROPBOX_TEST_FOLDER);
  await expect(page.getByTestId("dropbox-error")).toHaveText(en.dropbox.errors["vault.dropbox_denied"]);
  expect(await countSources(email)).toBe(0);

  await setDropboxDenial(page, false);
  await submitFolder(page, `${DROPBOX_TEST_FOLDER}/Missing`);
  await expect(page.getByTestId("dropbox-error")).toHaveText(en.dropbox.errors["vault.dropbox_folder_not_found"]);
  expect(await countSources(email)).toBe(0);

  await submitFolder(page, DROPBOX_TEST_FOLDER);
  await expect(page).toHaveURL(/\/panel\/source\?linked=dropbox$/);
  await expect(page.getByTestId("source-linked")).toHaveText(en.dropbox.linked);
  const card = page.getByTestId("source-card");
  await expect(card).toHaveAttribute("data-status", "connected");
  await expect(card).toHaveAttribute("data-kind", "dropbox");
  await expect(page.getByTestId("source-repository")).toContainText(DROPBOX_TEST_FOLDER);

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
  await expect(page.getByTestId("dropbox-connect-card")).toBeVisible();
  expect(await countSources(email)).toBe(0);
});
