// Shared e2e fixtures: the test provider's outbox file, the mail secrets of the app under test, and direct
// database access for checks and cleanup through the same package the app uses.
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabase, type DatabaseHandle } from "@softure-ai/db";
import { getEmailKey } from "@softure-ai/privacy/server";
import config from "../softure.config.ts";

/** Where the test mail provider of the app under test writes every mail (playwright configs set MAIL_OUTBOX). */
export const MAIL_OUTBOX = join(tmpdir(), "vaultconnector-e2e-mail-outbox.jsonl");

/** The secret the app under test signs unsubscribe links with. A test value: the e2e server is local and throwaway. */
export const MAILING_UNSUBSCRIBE_SECRET = "e2e-unsubscribe-secret-not-for-production";

/** The secret the app under test keys addresses with (mailing's recipient key, privacy's email key; 32+ characters). */
export const SOFTURE_EMAIL_KEY_SECRET = "e2e-email-key-secret-not-for-production";

/** The environment every app server under test gets, on both hosts. */
export const APP_TEST_ENV = { MAILING_UNSUBSCRIBE_SECRET, SOFTURE_EMAIL_KEY_SECRET } as const;

/** The key the app under test stores an address's consents under, derived with the app's own secret. */
export function getTestEmailKey(email: string): string {
  return getEmailKey(email, APP_TEST_ENV);
}

export async function openTestDatabase(): Promise<DatabaseHandle> {
  if (config.database === null) throw new Error("openTestDatabase: softure.config.ts has no database");
  return createDatabase(config.database.url, { max: 1 });
}
