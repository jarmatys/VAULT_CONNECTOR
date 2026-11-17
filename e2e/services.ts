// The fake outside services (e2e/fake-services.mjs) and what the app under test is started with to use them
// (playwright.config.ts, playwright.workers.config.ts). Test values only: the servers are local and throwaway.
import { generateKeyPairSync } from "node:crypto";
import { readMailOutbox } from "@softure-ai/mailing/testing";
import { MAIL_OUTBOX } from "./support.ts";

export const FAKE_SERVICES_PORT = Number(process.env.FAKE_SERVICES_PORT ?? 3199);
export const FAKE_SERVICES_ORIGIN = `http://127.0.0.1:${String(FAKE_SERVICES_PORT)}`;

/** Where a Worker posts its mail (it shares no disk with the test); the fake services append it to MAIL_OUTBOX. */
export const MAIL_OUTBOX_URL = `${FAKE_SERVICES_ORIGIN}/outbox`;

/** The GitHub client the app is configured with; the fake GitHub accepts only these. */
export const GITHUB_CLIENT_ID = "e2e-github-client";
export const GITHUB_CLIENT_SECRET = "e2e-github-secret-not-for-production";

/** The app under test's own origin, where the fake GitHub App sends the browser after an installation. */
const APP_ORIGIN = `http://localhost:${String(Number(process.env.E2E_PORT ?? 3100))}`;

/** The fake GitHub App of the vault source: its id, URL name and a key made for this run (never a real key). */
export const GITHUB_APP_ID = "4242";
export const GITHUB_APP_SLUG = "vault-e2e-app";
export const GITHUB_APP_PRIVATE_KEY = readRunKey();

/**
 * One key per run: the runner makes it and keeps it in its environment, which the test workers and the servers it
 * starts inherit, so the app and the fake sign and check with the same pair. Escaped newlines, as an environment
 * variable carries a PEM.
 */
function readRunKey(): string {
  const existing = process.env.E2E_GH_APP_PRIVATE_KEY;
  if (existing !== undefined && existing !== "") return existing;
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const escaped = privateKey.trim().replaceAll("\n", "\\n");
  process.env.E2E_GH_APP_PRIVATE_KEY = escaped;
  return escaped;
}

/** GitHub sign-in and the vault source's GitHub App against the fake, on Node and on workerd alike. */
export const GITHUB_TEST_ENV: Readonly<Record<string, string>> = {
  GH_AUTH_CLIENT_ID: GITHUB_CLIENT_ID,
  GH_AUTH_CLIENT_SECRET: GITHUB_CLIENT_SECRET,
  GH_AUTH_FAKE_ORIGIN: FAKE_SERVICES_ORIGIN,
  GH_APP_ID: GITHUB_APP_ID,
  GH_APP_SLUG: GITHUB_APP_SLUG,
  GH_APP_PRIVATE_KEY: GITHUB_APP_PRIVATE_KEY,
};

/** The bucket of the fake S3 (VC-20) and the one read-only key pair it accepts; test values, never a real key. */
export const S3_TEST_BUCKET = "e2e-vault-bucket";
export const S3_TEST_PREFIX = "vaults/main";
export const S3_TEST_ACCESS_KEY_ID = "AKIAE2EFICTIONAL0001";
export const S3_TEST_SECRET_ACCESS_KEY = "e2e-fictional-secret-not-for-production";
export const S3_TEST_ENDPOINT = `${FAKE_SERVICES_ORIGIN}/s3`;

/**
 * The app's side of the bucket source: a keyring for the sealed keys (a fixed test key, 32 zero bytes) and the opt-in
 * that lets it call the fake on 127.0.0.1 over http.
 */
export const S3_TEST_ENV: Readonly<Record<string, string>> = {
  VAULT_SOURCE_KEYS: "e2e:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  VAULT_S3_ALLOW_PRIVATE_ENDPOINTS: "1",
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
    GH_APP_ID: GITHUB_APP_ID,
    GH_APP_SLUG: GITHUB_APP_SLUG,
    GH_APP_PRIVATE_KEY: GITHUB_APP_PRIVATE_KEY,
    GH_APP_SETUP_URL: `${APP_ORIGIN}/panel/source/github/setup`,
    E2E_S3_BUCKET: S3_TEST_BUCKET,
    E2E_S3_ACCESS_KEY_ID: S3_TEST_ACCESS_KEY_ID,
    E2E_S3_SECRET_ACCESS_KEY: S3_TEST_SECRET_ACCESS_KEY,
  },
};

/** A reset link as auth builds it: the reset route with a 43-character token. */
const RESET_LINK = /^https?:\/\/\S+\/reset-password\?token=[A-Za-z0-9_-]{43}$/m;

/** Every reset link mailed to `email` so far, oldest first (the link is a line of the text body). */
export async function readResetLinks(email: string): Promise<string[]> {
  const mails = await readMailOutbox(MAIL_OUTBOX, { to: email });
  return mails.flatMap((mail) => mail.text.match(RESET_LINK) ?? []);
}
