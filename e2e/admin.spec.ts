// The operator's admin pages on both hosts: a signed-in account without the admin role gets a 404 on the jobs and
// alerts pages, and the same account sees both once it holds the role (granted in auth.user_roles, as the operator would).
import { alertsMessages } from "@softure-ai/alerts";
import { jobsMessages } from "@softure-ai/jobs";
import { expect, registerAccount, test, uniqueEmail } from "@softure-ai/testing/playwright";
import { randomUUID } from "node:crypto";
import { ADMIN_ALERTS_PATH, ADMIN_JOBS_PATH } from "../src/jobs/alerts.ts";
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

test("the jobs and alerts pages are hidden from an account without the admin role and shown to an admin", async ({ page }) => {
  const email = uniqueEmail("vc-admin");
  created.push(email);
  await registerAccount(page, { copy: AUTH_COPY, email, password: randomUUID(), landingPath: PANEL_PATH });

  for (const path of [ADMIN_JOBS_PATH, ADMIN_ALERTS_PATH]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
  }

  const db = await openAccountsDatabase();
  try {
    await db.query("INSERT INTO auth.user_roles (user_id, role, granted_at) SELECT id, 'admin', now() FROM auth.users WHERE email = $1", [email]);
  } finally {
    await db.close();
  }

  await page.goto(ADMIN_JOBS_PATH);
  await expect(page.getByText(jobsMessages.en.page.title, { exact: true })).toBeVisible();
  await page.goto(ADMIN_ALERTS_PATH);
  await expect(page.getByText(alertsMessages.en.page.title, { exact: true })).toBeVisible();
});
