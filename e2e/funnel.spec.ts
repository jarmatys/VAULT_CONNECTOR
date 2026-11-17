// @softure-ai/analytics on both hosts: a visit to the landing page and a waitlist sign-up are counted in the funnel
// under the visit's channel (`?z=`), the operator's report shows them, and no cookie is set on the way.
import { expect, test } from "@playwright/test";
import { systemClock } from "@softure-ai/core";
import { funnelCounts } from "@softure-ai/analytics";
import { getFunnelReport } from "@softure-ai/analytics/server";
import { consents } from "@softure-ai/privacy";
import { getEmailKey } from "@softure-ai/privacy/server";
import { clientAddressHeaders, uniqueEmail, uniqueName, waitFor } from "@softure-ai/testing/playwright";
import { signups, waitlistMessages } from "@softure-ai/waitlist";
import { eq } from "drizzle-orm";
import config from "../softure.config.ts";
import { en } from "../src/messages/en.ts";
import { openTestDatabase } from "./support.ts";

const copy = waitlistMessages.en;

async function readChannelCounts(channel: string): Promise<Readonly<Record<string, number>> | null> {
  const database = await openTestDatabase();
  try {
    const report = await getFunnelReport({ db: database.db, clock: systemClock, config }, { days: 1 });
    const row = report.rows.find((candidate) => candidate.channel.kind === "tagged" && candidate.channel.channel === channel);
    return row?.counts ?? null;
  } finally {
    await database.close();
  }
}

test("a tagged visit and its sign-up count as landing and waitlist under the channel, without a cookie", async ({ page, context }) => {
  await context.setExtraHTTPHeaders(clientAddressHeaders());
  const channel = uniqueName("e2e").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  const email = uniqueEmail("e2e-funnel");
  try {
    await page.goto(`/?z=${channel}`);
    await waitFor(async () => ((await readChannelCounts(channel))?.landing === 1 ? true : null), {
      description: "the landing visit counted under the channel",
    });

    const form = page.getByRole("region", { name: en.landing.waitlistTitle });
    await form.getByRole("textbox", { name: copy.form.email }).fill(email);
    await form.getByRole("checkbox").check();
    await form.getByRole("button", { name: copy.form.submit }).click();
    await expect(page.getByText(copy.form.success)).toBeVisible();

    expect(await readChannelCounts(channel)).toEqual({ landing: 1, waitlist: 1, signup: 0 });
    expect(await context.cookies()).toEqual([]);
  } finally {
    const database = await openTestDatabase();
    try {
      await database.db.delete(funnelCounts).where(eq(funnelCounts.channel, channel));
      await database.db.delete(signups).where(eq(signups.email, email));
      await database.db.delete(consents).where(eq(consents.emailKey, getEmailKey(email)));
    } finally {
      await database.close();
    }
  }
});

test("the funnel endpoint answers a server step from outside without counting it", async ({ request, baseURL }) => {
  const channel = uniqueName("e2e").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  const referer = `${String(baseURL)}/?z=${channel}`;
  const refused = await request.get("/api/analytics/funnel?step=waitlist", { headers: { referer, "sec-fetch-site": "same-origin" } });
  expect(refused.headers()["cache-control"]).toContain("no-store");
  expect(await readChannelCounts(channel)).toBeNull();
});
