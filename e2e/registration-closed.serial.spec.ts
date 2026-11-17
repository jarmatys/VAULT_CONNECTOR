// Closing registration (the `auth.registration_closed` switch) on both hosts: the register page says so and offers no
// GitHub sign-up, and an existing account still logs in. It changes the whole app, so it runs after every other spec.
import { expect, logIn, openPageAsNewClient, registerAccount, test, uniqueEmail } from "@softure-ai/testing/playwright";
import { REGISTRATION_CLOSED_SWITCH } from "@softure-ai/auth";
import { randomUUID } from "node:crypto";
import { en } from "../src/messages/en.ts";
import { AUTH_COPY, deleteAccounts, openAccountsDatabase, PANEL_PATH } from "./accounts.ts";

const email = uniqueEmail("vc-closed");
const password = randomUUID();

async function setRegistrationClosed(isClosed: boolean): Promise<void> {
  const db = await openAccountsDatabase();
  try {
    await db.query(
      `INSERT INTO features.switches (name, enabled, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (name) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = EXCLUDED.updated_at`,
      [REGISTRATION_CLOSED_SWITCH, isClosed],
    );
  } finally {
    await db.close();
  }
}

test.beforeAll(async ({ browser }) => {
  const page = await openPageAsNewClient(browser);
  await registerAccount(page, {
    copy: AUTH_COPY,
    email,
    password,
    landingPath: PANEL_PATH,
  });
  await page.context().close();
  await setRegistrationClosed(true);
});

test.afterAll(async () => {
  await setRegistrationClosed(false);
  const db = await openAccountsDatabase();
  try {
    await deleteAccounts(db, [email]);
  } finally {
    await db.close();
  }
});

test("with registration closed, the register page says so and offers no GitHub sign-up", async ({ page }) => {
  await page.goto("/register");
  await expect(page.getByText(AUTH_COPY.register.closedTitle)).toBeVisible();
  await expect(page.getByText(en.auth.githubDivider)).toHaveCount(0);
});

test("with registration closed, an existing account still logs in", async ({ page }) => {
  await logIn(page, {
    copy: AUTH_COPY,
    email,
    password,
    landingPath: PANEL_PATH,
  });
});
