// Accounts on both hosts: registering with email and password lands in the panel, logging out and in again works,
// and a visitor without a session is sent to the login page.
import { expect, logIn, registerAccount, test, uniqueEmail } from "@softure-ai/testing/playwright";
import { randomUUID } from "node:crypto";
import { en } from "../src/messages/en.ts";
import { AUTH_COPY, deleteAccounts, openAccountsDatabase, PANEL_PATH } from "./accounts.ts";

const created: string[] = [];

test.afterAll(async () => {
  const db = await openAccountsDatabase();
  try {
    await deleteAccounts(db, created);
  } finally {
    await db.close();
  }
});

test("a new account registers with email and password, lands in the panel, logs out and logs in again", async ({
  page,
}) => {
  const email = uniqueEmail("vc-register");
  const password = randomUUID();
  created.push(email);

  await registerAccount(page, {
    copy: AUTH_COPY,
    email,
    password,
    landingPath: PANEL_PATH,
  });
  await expect(page.getByRole("heading", { level: 1, name: en.panel.title })).toBeVisible();
  await expect(page.getByTestId("panel-account")).toContainText(email);
  const nextStep = page.getByRole("region", { name: en.panel.nextStepLabel });
  await expect(nextStep.getByText(en.panel.nextStepTitle)).toBeVisible();

  await page.getByRole("button", { name: AUTH_COPY.logout.submit }).click();
  await expect(page).not.toHaveURL(PANEL_PATH);
  await page.goto(PANEL_PATH);
  await expect(page).toHaveURL(/\/login/);

  await logIn(page, {
    copy: AUTH_COPY,
    email,
    password,
    landingPath: PANEL_PATH,
  });
  await expect(page.getByTestId("panel-account")).toContainText(email);
});

test("the register page names the terms and the privacy policy as links in the consent", async ({ page }) => {
  await page.goto("/register");
  const consent = page.getByLabel(AUTH_COPY.fields.consent);
  await expect(consent).toBeVisible();
  await expect(page.getByRole("link", { name: en.auth.terms, exact: true }).first()).toHaveAttribute("href", "/terms");
  await expect(page.getByRole("link", { name: en.auth.privacy, exact: true }).first()).toHaveAttribute(
    "href",
    "/privacy",
  );
});

test("a visitor without a session who opens the panel is sent to the login page with the panel as the next stop", async ({
  page,
}) => {
  await page.goto(PANEL_PATH);
  await expect(page).toHaveURL(/\/login\?next=%2Fpanel$/);
  await expect(page.getByRole("button", { name: AUTH_COPY.login.submit })).toBeVisible();
});

test("a wrong password is refused with the module's message and no session", async ({ page }) => {
  const email = uniqueEmail("vc-wrong-password");
  const password = randomUUID();
  created.push(email);
  await registerAccount(page, {
    copy: AUTH_COPY,
    email,
    password,
    landingPath: PANEL_PATH,
  });
  await page.getByRole("button", { name: AUTH_COPY.logout.submit }).click();
  await expect(page).not.toHaveURL(PANEL_PATH);

  await logIn(page, {
    copy: AUTH_COPY,
    email,
    password: `${password}-wrong`,
    landingPath: null,
  });
  await expect(page.getByText(AUTH_COPY.errors.auth.invalid_credentials)).toBeVisible();
  await page.goto(PANEL_PATH);
  await expect(page).toHaveURL(/\/login/);
});
