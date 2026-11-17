// Connecting an S3-compatible bucket as the vault source on both hosts (VC-20), against the fake S3 of
// e2e/fake-services.mjs: a key the storage refuses is reported on the form and nothing is stored; the right read-only
// key connects the bucket, the source screen names it, and the folder picker lists the vault's folders from the bucket.
import type { Page } from "@playwright/test";
import { expect, test, uniqueEmail } from "@softure-ai/testing/playwright";
import { en } from "../src/messages/en.ts";
import { AUTH_COPY, approveGithubAs, deleteAccounts, openAccountsDatabase, PANEL_PATH, uniqueGithubId, type FakeGithubUser } from "./accounts.ts";
import { S3_TEST_ACCESS_KEY_ID, S3_TEST_BUCKET, S3_TEST_ENDPOINT, S3_TEST_PREFIX, S3_TEST_SECRET_ACCESS_KEY } from "./services.ts";

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

async function signUp(page: Page, prefix: string): Promise<FakeGithubUser> {
  const email = uniqueEmail(prefix);
  created.push(email);
  const user = { id: uniqueGithubId(), login: `${prefix}-${String(Date.now())}`, email };
  await approveGithubAs(page, user);
  await page.goto("/register");
  await page.getByRole("button", { name: SIGN_IN_WITH_GITHUB }).click();
  await expect(page).toHaveURL(PANEL_PATH);
  return user;
}

async function fillBucketForm(page: Page, secretAccessKey: string): Promise<void> {
  await page.getByLabel(en.s3.endpoint, { exact: true }).fill(S3_TEST_ENDPOINT);
  await page.getByLabel(en.s3.bucket, { exact: true }).fill(S3_TEST_BUCKET);
  await page.getByLabel(en.s3.prefix, { exact: true }).fill(S3_TEST_PREFIX);
  await page.getByLabel(en.s3.accessKeyId, { exact: true }).fill(S3_TEST_ACCESS_KEY_ID);
  await page.getByLabel(en.s3.secretAccessKey, { exact: true }).fill(secretAccessKey);
  await page.getByRole("button", { name: en.s3.submit }).click();
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

test("a person connects a bucket with a read-only key, sees it named, and picks folders from it", async ({ page }) => {
  const user = await signUp(page, "vc-s3");
  await page.goto("/panel/source");
  await expect(page.getByTestId("s3-connect-card")).toBeVisible();
  await page.getByRole("link", { name: en.s3.cardAction }).click();
  await expect(page.getByRole("heading", { name: en.s3.title })).toBeVisible();

  await fillBucketForm(page, "a-wrong-secret");
  await expect(page.getByTestId("s3-error")).toHaveText(en.s3.errors["vault.s3_keys_refused"]);
  expect(await countSources(user.email)).toBe(0);

  await fillBucketForm(page, S3_TEST_SECRET_ACCESS_KEY);
  await expect(page).toHaveURL(/\/panel\/source\?linked=s3$/);
  await expect(page.getByTestId("source-linked")).toHaveText(en.s3.linked);
  const card = page.getByTestId("source-card");
  await expect(card).toHaveAttribute("data-status", "connected");
  await expect(card).toHaveAttribute("data-kind", "s3");
  await expect(page.getByTestId("source-repository")).toContainText(S3_TEST_BUCKET);
  await expect(page.getByTestId("source-repository")).toContainText(S3_TEST_PREFIX);
  await expect(page.content()).resolves.not.toContain(S3_TEST_SECRET_ACCESS_KEY);

  await page.goto("/panel/folders");
  const items = page.getByTestId("folder-item");
  await expect(items).toHaveCount(4);
  expect(await items.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-path")))).toEqual([
    "Journal",
    "Projects",
    "Projects/Archive",
    "Recipes",
  ]);
  await page.locator('[data-testid="folder-item"][data-path="Recipes"]').getByRole("checkbox").first().check();
  await page.getByRole("button", { name: en.folders.save }).click();
  await expect(page.getByTestId("folders-saved")).toHaveText(en.folders.saved);
});
