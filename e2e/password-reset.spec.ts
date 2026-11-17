// Password reset by mail on both hosts: the link arrives through the mail outbox sink, sets a new password, and the
// old one stops working.
import { expect, logIn, registerAccount, test, uniqueEmail, waitFor } from "@softure-ai/testing/playwright";
import { randomUUID } from "node:crypto";
import { AUTH_COPY, deleteAccounts, openAccountsDatabase, PANEL_PATH } from "./accounts.ts";
import { readResetLinks } from "./services.ts";

const created: string[] = [];

test.afterAll(async () => {
  const db = await openAccountsDatabase();
  try {
    await deleteAccounts(db, created);
  } finally {
    await db.close();
  }
});

test("a forgotten password is reset through the mailed link, and only the new one logs in", async ({ page }) => {
  const email = uniqueEmail("vc-reset");
  const oldPassword = randomUUID();
  const newPassword = randomUUID();
  created.push(email);
  await registerAccount(page, {
    copy: AUTH_COPY,
    email,
    password: oldPassword,
    landingPath: PANEL_PATH,
  });
  await page.getByRole("button", { name: AUTH_COPY.logout.submit }).click();
  await expect(page).not.toHaveURL(PANEL_PATH);

  await page.goto("/forgot-password");
  await page.getByLabel(AUTH_COPY.fields.email, { exact: true }).fill(email);
  await page.getByRole("button", { name: AUTH_COPY.forgotPassword.submit }).click();
  await expect(page.getByText(AUTH_COPY.forgotPassword.sent.split("{")[0] ?? "")).toBeVisible();

  const links = await waitFor(
    async () => {
      const found = await readResetLinks(email);
      return found.length > 0 ? found : undefined;
    },
    { description: `a reset link mailed to ${email}` },
  );
  const link = new URL(links.at(-1) ?? "");
  await page.goto(`${link.pathname}${link.search}`);
  await page.getByLabel(AUTH_COPY.fields.newPassword, { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: AUTH_COPY.resetPassword.submit }).click();
  await expect(page.getByText(AUTH_COPY.resetPassword.success)).toBeVisible();

  await logIn(page, {
    copy: AUTH_COPY,
    email,
    password: oldPassword,
    landingPath: null,
  });
  await expect(page.getByText(AUTH_COPY.errors.auth.invalid_credentials)).toBeVisible();
  await logIn(page, {
    copy: AUTH_COPY,
    email,
    password: newPassword,
    landingPath: PANEL_PATH,
  });
});
