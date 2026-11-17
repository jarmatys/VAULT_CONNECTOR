// The fake outside services (e2e/fake-services.mjs) and what the app under test is started with to use them
// (playwright.config.ts, playwright.workers.config.ts). Test values only: the servers are local and throwaway.
import { readMailOutbox } from "@softure-ai/mailing/testing";
import { MAIL_OUTBOX } from "./support.ts";

export const FAKE_SERVICES_PORT = Number(process.env.FAKE_SERVICES_PORT ?? 3199);
export const FAKE_SERVICES_ORIGIN = `http://127.0.0.1:${String(FAKE_SERVICES_PORT)}`;

/** Where a Worker posts its mail (it shares no disk with the test); the fake services append it to MAIL_OUTBOX. */
export const MAIL_OUTBOX_URL = `${FAKE_SERVICES_ORIGIN}/outbox`;

/** The GitHub client the app is configured with; the fake GitHub accepts only these. */
export const GITHUB_CLIENT_ID = "e2e-github-client";
export const GITHUB_CLIENT_SECRET = "e2e-github-secret-not-for-production";

/** GitHub sign-in against the fake, on Node and on workerd alike. */
export const GITHUB_TEST_ENV: Readonly<Record<string, string>> = {
  GH_AUTH_CLIENT_ID: GITHUB_CLIENT_ID,
  GH_AUTH_CLIENT_SECRET: GITHUB_CLIENT_SECRET,
  GH_AUTH_FAKE_ORIGIN: FAKE_SERVICES_ORIGIN,
};

/** The fake services, started before the app. */
export const FAKE_SERVICES_SERVER = {
  command: "node e2e/fake-services.mjs",
  url: `${FAKE_SERVICES_ORIGIN}/health`,
  reuseExistingServer: process.env.E2E_REUSE_SERVER === "1",
  timeout: 30_000,
  env: {
    FAKE_SERVICES_PORT: String(FAKE_SERVICES_PORT),
    MAIL_OUTBOX,
    GH_AUTH_CLIENT_ID: GITHUB_CLIENT_ID,
    GH_AUTH_CLIENT_SECRET: GITHUB_CLIENT_SECRET,
  },
};

/** A reset link as auth builds it: the reset route with a 43-character token. */
const RESET_LINK = /^https?:\/\/\S+\/reset-password\?token=[A-Za-z0-9_-]{43}$/m;

/** Every reset link mailed to `email` so far, oldest first (the link is a line of the text body). */
export async function readResetLinks(email: string): Promise<string[]> {
  const mails = await readMailOutbox(MAIL_OUTBOX, { to: email });
  return mails.flatMap((mail) => mail.text.match(RESET_LINK) ?? []);
}
