// Paying for a plan (VC-15) end to end without Stripe's network: from the panel's plan screen the account orders the
// monthly plan, the app creates a Checkout session on the fake Stripe (e2e/fake-services.mjs), the person pays on its
// hosted page, and the signed `checkout.session.completed` turns the trial into paid access, shown in the panel.
import { billingMessages } from "@softure-ai/billing";
import { expect, registerAccount, test, uniqueEmail } from "@softure-ai/testing/playwright";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { en } from "../src/messages/en.ts";
import { BILLING_PATH } from "../src/panel-paths.ts";
import { AUTH_COPY, deleteAccounts, openAccountsDatabase, PANEL_PATH } from "./accounts.ts";
import { FAKE_SERVICES_ORIGIN, STRIPE_TEST_SECRET_KEY } from "./services.ts";

const copy = billingMessages.en;
/** How long the webhook's effect may take to show in the panel. */
const DELIVERY_TIMEOUT_MS = 15_000;
const created: string[] = [];

test.afterAll(async () => {
  const db = await openAccountsDatabase();
  try {
    await deleteAccounts(db, created);
  } finally {
    await db.close();
  }
});

/** What the fake Stripe recorded of a Checkout session. */
const sessionSchema = z.object({
  status: z.string(),
  currency: z.string(),
  amount_total: z.number(),
  customer_email: z.string(),
});

async function readSession(id: string): Promise<z.infer<typeof sessionSchema>> {
  const response = await fetch(new URL(`/v1/checkout/sessions/${id}`, FAKE_SERVICES_ORIGIN), {
    headers: { Authorization: `Bearer ${STRIPE_TEST_SECRET_KEY}` },
  });
  expect(response.status).toBe(200);
  return sessionSchema.parse(await response.json());
}

test("an account on its trial pays for the monthly plan on Stripe Checkout and gets paid access", async ({ page }) => {
  const email = uniqueEmail("vc-billing");
  created.push(email);
  await registerAccount(page, { copy: AUTH_COPY, email, password: randomUUID(), landingPath: PANEL_PATH });
  const access = page.getByTestId("panel-access").locator("[data-status]");
  await expect(access).toHaveAttribute("data-status", "trial");

  await page.getByRole("link", { name: en.panelShell.sections.billing, exact: true }).click();
  await expect(page).toHaveURL(BILLING_PATH);
  await expect(page.getByRole("heading", { level: 1, name: en.billing.title })).toBeVisible();

  await page.goto(`${BILLING_PATH}?plan=monthly`);
  await page.getByRole("button", { name: copy.payment.checkout }).click();
  await page.waitForURL((url) => url.origin === FAKE_SERVICES_ORIGIN && url.pathname.startsWith("/c/pay/"));
  const sessionId = new URL(page.url()).pathname.split("/").at(-1) ?? "";
  expect(await readSession(sessionId)).toMatchObject({ status: "open", customer_email: email });

  await page.getByRole("button", { name: "Pay" }).click();
  await page.waitForURL((url) => url.pathname === BILLING_PATH && url.searchParams.get("checkout") === "success");
  expect((await readSession(sessionId)).status).toBe("complete");
  await expect
    .poll(
      async () => {
        await page.reload();
        return access.getAttribute("data-status");
      },
      { timeout: DELIVERY_TIMEOUT_MS },
    )
    .toBe("paid");
});
