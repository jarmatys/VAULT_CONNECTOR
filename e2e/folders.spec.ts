// Picking the shared folders on both hosts, through the real git adapter against the fake GitHub App's fixture vault
// (e2e/fake-services.mjs): the picker shows the vault's folders with note counts and nothing ticked; ticking two
// folders and saving stores exactly those two; unticking one removes it from what is shared.
import type { Page } from "@playwright/test";
import { expect, test, uniqueEmail } from "@softure-ai/testing/playwright";
import { en } from "../src/messages/en.ts";
import {
  AUTH_COPY,
  approveGithubAs,
  deleteAccounts,
  openAccountsDatabase,
  PANEL_PATH,
  signInToFakeGithub,
  uniqueGithubId,
  type FakeGithubUser,
} from "./accounts.ts";

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

function createGithubUser(prefix: string): FakeGithubUser {
  const email = uniqueEmail(prefix);
  created.push(email);
  return { id: uniqueGithubId(), login: `${prefix}-${String(Date.now())}`, email };
}

/** Signs up with GitHub and connects the user's one repository (the fixture vault). */
async function connectVault(page: Page, user: FakeGithubUser): Promise<void> {
  await approveGithubAs(page, user);
  await page.goto("/register");
  await page.getByRole("button", { name: SIGN_IN_WITH_GITHUB }).click();
  await expect(page).toHaveURL(PANEL_PATH);
  await signInToFakeGithub(page, user, [`${user.login}/vault`]);
  await page.goto("/panel/source");
  await page.getByRole("button", { name: en.source.connectAction }).click();
  await expect(page.getByTestId("source-card")).toHaveAttribute("data-status", "connected");
}

async function readSharedFolders(email: string): Promise<string[]> {
  const db = await openAccountsDatabase();
  try {
    const result = await db.query<{ path: string }>(
      "SELECT path FROM vault.shared_folders WHERE user_id = (SELECT id FROM auth.users WHERE email = $1) ORDER BY path",
      [email],
    );
    return result.map((row) => row.path);
  } finally {
    await db.close();
  }
}

function folderBox(page: Page, path: string) {
  return page.locator(`[data-testid="folder-item"][data-path="${path}"]`).getByRole("checkbox").first();
}

test("an account sees its vault's folders with nothing ticked, shares two, then unshares one", async ({ page }) => {
  const user = createGithubUser("vc-folders");
  await connectVault(page, user);

  await page.goto(PANEL_PATH);
  await expect(page.getByTestId("panel-folders")).toContainText("0");
  await page.getByRole("link", { name: en.panel.foldersStepAction }).click();
  await expect(page.getByRole("heading", { name: en.folders.title })).toBeVisible();

  const items = page.getByTestId("folder-item");
  await expect(items).toHaveCount(4);
  expect(await items.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-path")))).toEqual([
    "Journal",
    "Projects",
    "Projects/Archive",
    "Recipes",
  ]);
  await expect(page.locator('[data-path="Projects"] [data-testid="folder-count"]').first()).toHaveText("3 notes");
  await expect(page.locator('[data-path="Recipes"] [data-testid="folder-count"]')).toHaveText("2 notes");
  for (const path of ["Journal", "Projects", "Projects/Archive", "Recipes"]) await expect(folderBox(page, path)).not.toBeChecked();
  await expect(page.getByTestId("folders-none-shared")).toBeVisible();
  await expect(page.getByTestId("folders-top-level")).toContainText("1 note");
  expect(await readSharedFolders(user.email)).toEqual([]);

  await folderBox(page, "Projects").check();
  await folderBox(page, "Recipes").check();
  await page.getByRole("button", { name: en.folders.save }).click();

  await expect(page.getByTestId("folders-saved")).toHaveText(en.folders.saved);
  expect(await readSharedFolders(user.email)).toEqual(["Projects", "Recipes"]);
  await expect(folderBox(page, "Projects")).toBeChecked();
  await expect(folderBox(page, "Projects/Archive")).toBeChecked();
  await expect(folderBox(page, "Projects/Archive")).toBeDisabled();
  await expect(folderBox(page, "Journal")).not.toBeChecked();

  await page.goto("/panel/folders");
  await expect(page.getByTestId("folders-saved")).toHaveCount(0);
  await folderBox(page, "Recipes").uncheck();
  await page.getByRole("button", { name: en.folders.save }).click();
  await expect(page.getByTestId("folders-saved")).toBeVisible();
  expect(await readSharedFolders(user.email)).toEqual(["Projects"]);
  await expect(folderBox(page, "Recipes")).not.toBeChecked();

  await page.goto(PANEL_PATH);
  await expect(page.getByTestId("panel-folders")).toContainText("1");
});

test("the picker sends an account without a source to connect one first", async ({ page }) => {
  const user = createGithubUser("vc-folders-none");
  await approveGithubAs(page, user);
  await page.goto("/register");
  await page.getByRole("button", { name: SIGN_IN_WITH_GITHUB }).click();
  await expect(page).toHaveURL(PANEL_PATH);
  await expect(page.getByRole("link", { name: en.panel.foldersStepAction })).toHaveCount(0);

  await page.goto("/panel/folders");
  await expect(page.getByTestId("folders-no-source")).toBeVisible();
  await page.getByRole("link", { name: en.folders.noSourceAction }).click();
  await expect(page.getByRole("heading", { name: en.source.title })).toBeVisible();
});
