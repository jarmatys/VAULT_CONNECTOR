// What the account specs share: the auth form copy with the product's consent label, the panel route, a database
// client for cleanup and the fake GitHub's sign-in.
import type { Page } from "@playwright/test";
import { authMessages } from "@softure-ai/auth";
import { createTestDatabaseClient, type TestDatabaseClient } from "@softure-ai/testing/playwright";
import { en } from "../src/messages/en.ts";
import { PANEL_PATH } from "../src/panel-paths.ts";
import { LOCAL_DATABASE_URL } from "../src/settings.ts";
import { FAKE_SERVICES_ORIGIN } from "./services.ts";

export { PANEL_PATH };

/** auth's copy, with the consent label the register page renders (the product's, with links). */
export const AUTH_COPY = {
  ...authMessages.en,
  fields: {
    ...authMessages.en.fields,
    consent: `${en.auth.consentBefore}${en.auth.terms}${en.auth.consentBetween}${en.auth.privacy}${en.auth.consentAfter}`,
  },
};

/** The database the app under test uses; the specs only clean up after themselves and flip the registration switch. */
export function openTestDatabase(): Promise<TestDatabaseClient> {
  return createTestDatabaseClient(process.env.DATABASE_URL ?? LOCAL_DATABASE_URL);
}

/** Deletes the accounts with these addresses (sessions, identities and resets go with them by foreign key). */
export async function deleteAccounts(db: TestDatabaseClient, emails: readonly string[]): Promise<void> {
  if (emails.length === 0) return;
  await db.query("DELETE FROM auth.users WHERE email = ANY($1::text[])", [emails]);
}

export interface FakeGithubUser {
  readonly id: number;
  readonly login: string;
  readonly email: string;
  readonly name?: string;
  /** Whether GitHub reports the address as verified; true by default. */
  readonly isVerified?: boolean;
}

/** A GitHub user id no other test uses. */
export function uniqueGithubId(): number {
  return 1_000_000 + Math.floor(Math.random() * 1_000_000_000);
}

/**
 * Sends the browser's visit to GitHub's authorize page to the fake GitHub, which approves as `user` and redirects back
 * to the app's callback; the app's own calls to GitHub already go to the fake (GH_AUTH_FAKE_ORIGIN).
 */
export async function approveGithubAs(page: Page, user: FakeGithubUser): Promise<void> {
  await page.route("https://github.com/login/oauth/authorize**", async (route) => {
    const target = new URL(`${FAKE_SERVICES_ORIGIN}/authorize`);
    target.searchParams.set("url", route.request().url());
    target.searchParams.set("id", String(user.id));
    target.searchParams.set("login", user.login);
    target.searchParams.set("email", user.email);
    if (user.name !== undefined) target.searchParams.set("name", user.name);
    if (user.isVerified === false) target.searchParams.set("verified", "0");
    await route.fulfill({
      status: 302,
      headers: { location: target.toString() },
    });
  });
}
