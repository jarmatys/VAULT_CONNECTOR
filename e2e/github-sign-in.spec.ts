// Signing up and in with GitHub on both hosts, against the fake GitHub (e2e/fake-services.mjs): the first sign-in
// creates the account and lands in the panel, a later one signs into the same account, and an unverified address is
// refused.
import { expect, test, uniqueEmail } from "@softure-ai/testing/playwright";
import { en } from "../src/messages/en.ts";
import {
  AUTH_COPY,
  approveGithubAs,
  deleteAccounts,
  openAccountsDatabase,
  PANEL_PATH,
  uniqueGithubId,
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

test("the first GitHub sign-in creates the account and a later one signs into the same account", async ({ page }) => {
  const email = uniqueEmail("vc-github");
  created.push(email);
  const user = {
    id: uniqueGithubId(),
    login: `octo-${String(Date.now())}`,
    email,
    name: "Test Octocat",
  };
  await approveGithubAs(page, user);

  await page.goto("/register");
  await expect(page.getByText(en.auth.githubDivider)).toBeVisible();
  await expect(page.getByTestId("github-notice")).toBeVisible();
  await page.getByRole("button", { name: SIGN_IN_WITH_GITHUB }).click();
  await expect(page).toHaveURL(PANEL_PATH);
  await expect(page.getByTestId("panel-account")).toContainText(user.name);

  await page.getByRole("button", { name: AUTH_COPY.logout.submit }).click();
  await expect(page).not.toHaveURL(PANEL_PATH);
  await page.goto("/login");
  await page.getByRole("button", { name: SIGN_IN_WITH_GITHUB }).click();
  await expect(page).toHaveURL(PANEL_PATH);

  const db = await openAccountsDatabase();
  try {
    expect(await db.countRows("auth.users", { email })).toBe(1);
  } finally {
    await db.close();
  }
});

test("a GitHub account without a verified email is refused and no account is created", async ({ page }) => {
  const email = uniqueEmail("vc-github-unverified");
  created.push(email);
  await approveGithubAs(page, {
    id: uniqueGithubId(),
    login: `unverified-${String(Date.now())}`,
    email,
    isVerified: false,
  });

  await page.goto("/login");
  await page.getByRole("button", { name: SIGN_IN_WITH_GITHUB }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("alert")).toBeVisible();

  const db = await openAccountsDatabase();
  try {
    expect(await db.countRows("auth.users", { email })).toBe(0);
  } finally {
    await db.close();
  }
});
