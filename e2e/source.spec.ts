// Connecting the vault's repository on both hosts, against the fake GitHub and its fake App (e2e/fake-services.mjs):
// the person installs the App on one repository, confirms on GitHub, and the panel names the repository; once the App
// is uninstalled on GitHub the screen shows the source disconnected. An installation on two repositories is refused.
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
import { FAKE_SERVICES_ORIGIN } from "./services.ts";

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

/** The screen re-checks a source at most once a minute: move the last check back instead of waiting. */
async function makeSourceCheckDue(email: string): Promise<void> {
  const db = await openAccountsDatabase();
  try {
    await db.query(
      "UPDATE vault.sources SET checked_at = checked_at - interval '1 hour' WHERE user_id = (SELECT id FROM auth.users WHERE email = $1)",
      [email],
    );
  } finally {
    await db.close();
  }
}

async function signUpWithGithub(page: Page, user: FakeGithubUser): Promise<void> {
  await approveGithubAs(page, user);
  await page.goto("/register");
  await page.getByRole("button", { name: SIGN_IN_WITH_GITHUB }).click();
  await expect(page).toHaveURL(PANEL_PATH);
}

test("a person connects one repository, sees it named, and sees it disconnected once the App is removed", async ({ page, request }) => {
  const user = createGithubUser("vc-source");
  const repository = `${user.login}/vault`;
  await signUpWithGithub(page, user);
  await signInToFakeGithub(page, user, [repository]);

  await page.getByRole("link", { name: en.panel.nextStepAction }).click();
  await expect(page.getByRole("heading", { name: en.source.title })).toBeVisible();
  await page.getByRole("button", { name: en.source.connectAction }).click();

  await expect(page.getByTestId("source-linked")).toHaveText(en.source.linked);
  await expect(page.getByTestId("source-card")).toHaveAttribute("data-status", "connected");
  await expect(page.getByTestId("source-repository")).toHaveText(repository);
  await page.goto(PANEL_PATH);
  await expect(page.getByTestId("panel-source")).toContainText(repository);

  expect((await request.post(`${FAKE_SERVICES_ORIGIN}/uninstall?login=${encodeURIComponent(user.login)}`)).status()).toBe(204);
  await makeSourceCheckDue(user.email);
  await page.getByRole("link", { name: en.panel.nextStepManage }).click();
  await expect(page.getByTestId("source-card")).toHaveAttribute("data-status", "disconnected");
  await expect(page.getByRole("button", { name: en.source.reconnectAction })).toBeVisible();

  await page.getByRole("button", { name: en.source.disconnectAction }).click();
  await expect(page.getByRole("button", { name: en.source.connectAction })).toBeVisible();
});

test("an installation on more than one repository is refused with the reason", async ({ page }) => {
  const user = createGithubUser("vc-source-two");
  await signUpWithGithub(page, user);
  await signInToFakeGithub(page, user, [`${user.login}/vault`, `${user.login}/other`]);

  await page.goto("/panel/source");
  await page.getByRole("button", { name: en.source.connectAction }).click();

  await expect(page.getByTestId("source-error")).toHaveText(en.source.errors["vault.link_one_repository"]);
  await expect(page.getByRole("button", { name: en.source.connectAction })).toBeVisible();
});
