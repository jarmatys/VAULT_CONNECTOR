// @softure-ai/waitlist on both hosts, single opt-in: a sign-up with the consent stores the address, records the
// consent with the privacy policy's version and sends one welcome mail (list mail, with the unsubscribe link); the
// same address again gets the same answer and stays one row with one mail; without the consent nothing is stored.
// Every test gets its own client address and email.
import { expect, test, type Page } from "@playwright/test";
import { readMailOutbox } from "@softure-ai/mailing/testing";
import { deliveries } from "@softure-ai/mailing";
import { consents } from "@softure-ai/privacy";
import { clientAddressHeaders, uniqueEmail, waitFor } from "@softure-ai/testing/playwright";
import { signups, waitlistMessages } from "@softure-ai/waitlist";
import { eq, inArray, like } from "drizzle-orm";
import { en } from "../src/messages/en.ts";
import { PRIVACY_POLICY_DOCUMENT, PRIVACY_POLICY_VERSION, WAITLIST_PLACEMENT, WAITLIST_SCOPE } from "../src/site.ts";
import { getTestEmailKey, MAIL_OUTBOX, openTestDatabase } from "./support.ts";

const copy = waitlistMessages.en;
const createdEmails: string[] = [];

function newEmail(): string {
  const email = uniqueEmail("e2e-waitlist");
  createdEmails.push(email);
  return email;
}

test.beforeEach(({ context }) => context.setExtraHTTPHeaders(clientAddressHeaders()));

test.afterAll(async () => {
  if (createdEmails.length === 0) return;
  const database = await openTestDatabase();
  try {
    const rows = await database.db.select({ id: signups.id }).from(signups).where(inArray(signups.email, createdEmails));
    for (const { id } of rows) await database.db.delete(deliveries).where(like(deliveries.scope, `waitlist.welcome:${id}`));
    await database.db.delete(signups).where(inArray(signups.email, createdEmails));
    await database.db.delete(consents).where(inArray(consents.emailKey, createdEmails.map(getTestEmailKey)));
  } finally {
    await database.close();
  }
});

async function submit(page: Page, email: string, { consent }: { consent: boolean }): Promise<void> {
  await page.goto("/");
  const form = page.getByRole("region", { name: en.landing.waitlistTitle });
  await form.getByRole("textbox", { name: copy.form.email }).fill(email);
  if (consent) await form.getByRole("checkbox").check();
  await form.getByRole("button", { name: copy.form.submit }).click();
}

async function readSignup(email: string) {
  const database = await openTestDatabase();
  try {
    const rows = await database.db.select().from(signups).where(eq(signups.email, email));
    const recorded = await database.db
      .select({ purpose: consents.purpose, granted: consents.granted, documentVersion: consents.documentVersion, source: consents.source })
      .from(consents)
      .where(eq(consents.emailKey, getTestEmailKey(email)));
    return { rows, consents: recorded };
  } finally {
    await database.close();
  }
}

test("a visitor who consents joins the list, the consent is recorded and one welcome mail goes out", async ({ page }) => {
  const email = newEmail();
  await submit(page, email, { consent: true });
  await expect(page.getByText(copy.form.success)).toBeVisible();

  const { rows, consents: recorded } = await readSignup(email);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ scopes: [WAITLIST_SCOPE], placement: WAITLIST_PLACEMENT, locale: "en" });
  expect(rows[0]?.confirmedAt).not.toBeNull();
  expect(recorded).toEqual([{ purpose: WAITLIST_SCOPE, granted: true, documentVersion: PRIVACY_POLICY_VERSION, source: "waitlist" }]);
  expect(PRIVACY_POLICY_DOCUMENT).toBe("privacy-policy");

  const mails = await waitFor(async () => {
    const found = await readMailOutbox(MAIL_OUTBOX, { to: email });
    return found.length > 0 ? found : null;
  }, { description: "the welcome mail in the outbox" });
  expect(mails).toHaveLength(1);
  expect(mails[0]?.subject).toBe(copy.welcomeMail.subject);
  expect(mails[0]?.text).toContain("/unsubscribe?");
});

test("the same address again gets the same answer and stays one sign-up with one welcome mail", async ({ page }) => {
  const email = newEmail();
  await submit(page, email, { consent: true });
  await expect(page.getByText(copy.form.success)).toBeVisible();
  await waitFor(async () => ((await readMailOutbox(MAIL_OUTBOX, { to: email })).length > 0 ? true : null), {
    description: "the first welcome mail in the outbox",
  });

  await submit(page, email.toUpperCase(), { consent: true });
  await expect(page.getByText(copy.form.success)).toBeVisible();

  const { rows, consents: recorded } = await readSignup(email);
  expect(rows).toHaveLength(1);
  expect(recorded).toHaveLength(1);
  // The second answer is on screen only once the action finished, after the response; the welcome is sent once per
  // sign-up, so a second mail would already be in the outbox.
  expect(await readMailOutbox(MAIL_OUTBOX, { to: email })).toHaveLength(1);
});

test("without the consent the sign-up is refused and nothing is stored", async ({ page }) => {
  const email = newEmail();
  await submit(page, email, { consent: false });
  // The browser blocks a required, unticked box; the server refuses it too when the form is posted without it.
  await expect(page.getByText(copy.form.success)).toHaveCount(0);
  await page.evaluate(() => {
    for (const box of document.querySelectorAll<HTMLInputElement>("input[type=checkbox]")) box.required = false;
  });
  await page.getByRole("button", { name: copy.form.submit }).click();
  await expect(page.getByText(copy.errors.waitlist.consent_required)).toBeVisible();

  const { rows, consents: recorded } = await readSignup(email);
  expect(rows).toEqual([]);
  expect(recorded).toEqual([]);
});
