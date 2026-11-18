// The account screen on both hosts (VC-16): the account downloads its data as JSON (every module's part, the vault's
// and the connector's among them, no note text), a wrong password does not delete it, and the right one with the
// confirmation deletes the account, lands on the landing page and leaves nothing to sign in to. A GitHub-only account
// (no password it knows) confirms by signing in with GitHub again instead.
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { privacyMessages } from "@softure-ai/privacy";
import { expect, registerAccount, submitLogin, test, uniqueEmail } from "@softure-ai/testing/playwright";
import { en } from "../src/messages/en.ts";
import { ACCOUNT_PATH } from "../src/panel-paths.ts";
import { approveGithubAs, AUTH_COPY, deleteAccounts, openAccountsDatabase, PANEL_PATH, uniqueGithubId } from "./accounts.ts";

const PRIVACY = privacyMessages.en;
const SIGN_IN_WITH_GITHUB = AUTH_COPY.oidc.signInWith.replace("{provider}", "GitHub");
const CONFIRM_WITH_GITHUB = PRIVACY.delete.confirmWith.replace("{provider}", "GitHub");
const created: string[] = [];

test.afterAll(async () => {
  const db = await openAccountsDatabase();
  try {
    await deleteAccounts(db, created);
  } finally {
    await db.close();
  }
});

test("an account downloads its data, keeps it on a wrong password and deletes itself with the right one", async ({ page }) => {
  const email = uniqueEmail("vc-privacy");
  const password = randomUUID();
  created.push(email);
  await registerAccount(page, { copy: AUTH_COPY, email, password, landingPath: PANEL_PATH });

  await page.getByRole("link", { name: en.panelShell.sections.account }).first().click();
  await expect(page).toHaveURL(ACCOUNT_PATH);
  await expect(page.getByRole("heading", { level: 1, name: en.account.title })).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: en.privacy.export.button }).click();
  const file = await (await download).path();
  const exported = JSON.parse(await readFile(file, "utf8")) as { format: string; data: Record<string, unknown> };
  expect(exported.format).toBe("softure.privacy-export");
  expect(JSON.stringify(exported.data.auth)).toContain(email);
  expect(exported.data.vault).toMatchObject({ source: null, sharedFolders: [], copiedNotes: [] });
  expect(exported.data.connector).toEqual({ vaultDescription: null, updatedAt: null });

  const form = page.getByTestId("account-delete");
  await form.getByLabel(PRIVACY.delete.password).fill(`${password}-wrong`);
  await form.getByLabel(PRIVACY.delete.confirm).check();
  await form.getByRole("button", { name: PRIVACY.delete.submit }).click();
  await expect(form.getByText(PRIVACY.errors.privacy.password_invalid)).toBeVisible();
  await expect(page).toHaveURL(ACCOUNT_PATH);

  await form.getByLabel(PRIVACY.delete.password).fill(password);
  await form.getByLabel(PRIVACY.delete.confirm).check();
  await form.getByRole("button", { name: PRIVACY.delete.submit }).click();
  await expect(page).toHaveURL("/");

  await page.goto(PANEL_PATH);
  await expect(page).toHaveURL(/\/login/);
  await submitLogin(page, { copy: AUTH_COPY, email, password });
  await expect(page.getByText(AUTH_COPY.errors.auth.invalid_credentials)).toBeVisible();
});

test("a GitHub-only account confirms by signing in with GitHub again and deletes itself without a password", async ({ page }) => {
  const email = uniqueEmail("vc-privacy-github");
  created.push(email);
  await approveGithubAs(page, { id: uniqueGithubId(), login: `octo-${String(Date.now())}`, email });
  await page.goto("/login");
  await page.getByRole("button", { name: SIGN_IN_WITH_GITHUB }).click();
  await expect(page).toHaveURL(PANEL_PATH);

  // The sign-in is twenty minutes old: the form asks for a fresh one (or a password the account does not have).
  const db = await openAccountsDatabase();
  try {
    await db.query("UPDATE auth.sessions SET created_at = created_at - interval '20 minutes' WHERE user_id = (SELECT id FROM auth.users WHERE email = $1)", [email]);
    await db.query("UPDATE auth.identities SET last_login_at = last_login_at - interval '20 minutes' WHERE email = $1", [email]);
  } finally {
    await db.close();
  }
  await page.goto(ACCOUNT_PATH);
  const form = page.getByTestId("account-delete");
  await form.getByLabel(PRIVACY.delete.confirm).check();
  await form.getByRole("button", { name: PRIVACY.delete.submit }).click();
  await expect(form.getByText(PRIVACY.errors.privacy.reauthentication_required)).toBeVisible();

  await form.getByRole("button", { name: CONFIRM_WITH_GITHUB }).click();
  await expect(page).toHaveURL(ACCOUNT_PATH);
  await expect(form.getByRole("status")).toHaveText(PRIVACY.delete.confirmedWith.replace("{provider}", "GitHub"));
  await expect(form.getByLabel(PRIVACY.delete.password)).toHaveCount(0);
  await form.getByLabel(PRIVACY.delete.confirm).check();
  await form.getByRole("button", { name: PRIVACY.delete.submit }).click();
  await expect(page).toHaveURL("/");

  const after = await openAccountsDatabase();
  try {
    expect(await after.countRows("auth.users", { email })).toBe(0);
  } finally {
    await after.close();
  }
});
