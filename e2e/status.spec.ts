// The status screen on both hosts: a new account sees that nothing is copied or indexed yet; once its notes are
// copied and partly indexed (written straight to the database, as the background jobs would), the screen shows the
// last sync and the share of notes already searchable, by words on an instance without an embedding model. Above them
// the plan card shows the trial's limits against the account's use and how many shared notes the plan left out.
import { expect, registerAccount, test, uniqueEmail } from "@softure-ai/testing/playwright";
import { randomUUID } from "node:crypto";
import { en } from "../src/messages/en.ts";
import { STATUS_PATH } from "../src/panel-paths.ts";
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

/** Three copied notes, two of them indexed by words, and a finished sync run that left two notes out over the plan. */
async function seedCopiedNotes(email: string): Promise<void> {
  const db = await openAccountsDatabase();
  try {
    const params = [email];
    await db.query(
      `INSERT INTO vault.sync_runs (user_id, status, trigger, planned_copies, copied, skipped_over_limit, started_at, finished_at)
       SELECT id, 'succeeded', 'picks', 3, 3, 2, '2026-11-17T12:00:00Z', '2026-11-17T12:01:00Z' FROM auth.users WHERE email = $1`,
      params,
    );
    await db.query(
      `INSERT INTO vault.notes (user_id, path, version, size, title, changed_at, synced_at, indexed_version, indexed_model, indexed_at)
       SELECT id, n.path, 'v1', 10, n.title, now(), now(), n.indexed, CASE WHEN n.indexed IS NULL THEN NULL ELSE '' END,
         CASE WHEN n.indexed IS NULL THEN NULL ELSE TIMESTAMPTZ '2026-11-17T12:02:00Z' END
       FROM auth.users, (VALUES ('Work/A.md', 'A', 'v1'), ('Work/B.md', 'B', 'v1'), ('Work/C.md', 'C', NULL)) AS n(path, title, indexed)
       WHERE email = $1`,
      params,
    );
  } finally {
    await db.close();
  }
}

test("the status screen says what is copied and how much is searchable", async ({ page }) => {
  const email = uniqueEmail("vc-status");
  created.push(email);
  await registerAccount(page, { copy: AUTH_COPY, email, password: randomUUID(), landingPath: PANEL_PATH });

  await page.getByRole("link", { name: en.panelShell.sections.status }).first().click();
  await expect(page).toHaveURL(STATUS_PATH);
  await expect(page.getByRole("heading", { level: 1, name: en.status.title })).toBeVisible();
  await expect(page.getByTestId("status-plan")).toContainText(en.status.planNames.trial);
  await expect(page.getByTestId("status-plan-notes")).toContainText("0 of 5000");
  await expect(page.getByTestId("status-plan-searches")).toContainText("0 of 1000");
  await expect(page.getByTestId("status-over-limit")).toHaveCount(0);
  await expect(page.getByTestId("status-sync")).toContainText(en.status.syncNever);
  await expect(page.getByTestId("status-index")).toContainText(en.status.indexEmpty);

  await seedCopiedNotes(email);
  await page.reload();

  await expect(page.getByTestId("status-plan-notes")).toContainText("3 of 5000");
  await expect(page.getByTestId("status-plan-storage")).toContainText("0.1 MiB of 500 MiB");
  await expect(page.getByTestId("status-over-limit")).toContainText("2 shared notes are over your plan's limit");
  await expect(page.getByTestId("status-sync")).toContainText(en.status.syncSucceeded);
  await expect(page.getByTestId("status-sync")).toContainText("17 Nov 2026, 12:01 UTC");
  await expect(page.getByTestId("status-index")).toContainText(en.status.indexRunning);
  await expect(page.getByTestId("status-index")).toContainText("2 / 3");
  await expect(page.getByTestId("status-mode")).toHaveText(en.status.byWords);
});
