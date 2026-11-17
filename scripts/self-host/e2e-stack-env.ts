// The values the self-hosted stack runs with in the e2e workflow. Throwaway test values only: the stack lives for one CI
// job on the runner's loopback and holds fictional data.

export interface E2eStackEnvOptions {
  /** The port the app listens on, on the runner's loopback (the e2e suite's E2E_PORT). */
  readonly port: number;
  readonly fakeServicesOrigin: string;
  readonly mailOutboxUrl: string;
  /** The commit the image is built from, named by GET /api/health/build. */
  readonly commit: string;
  /** The app's test environment shared with the other e2e runs (GitHub fake, S3 source, Stripe keys, unsubscribe secret). */
  readonly testEnv: Readonly<Record<string, string>>;
}

/** Every variable docker-compose.yml and docker/compose.e2e.yml read, for an e2e run. */
export function buildE2eStackEnv(options: E2eStackEnvOptions): Readonly<Record<string, string>> {
  return {
    ...options.testEnv,
    APP_ORIGIN: `http://localhost:${String(options.port)}`,
    E2E_PORT: String(options.port),
    SOFTURE_BUILD_COMMIT: options.commit,
    POSTGRES_PASSWORD: "e2e-postgres-password",
    SOFTURE_MIGRATOR_PASSWORD: "e2e-migrator-password",
    SOFTURE_APP_PASSWORD: "e2e-app-password",
    VAULT_S3_ACCESS_KEY_ID: "e2e-notes-access-key",
    VAULT_S3_SECRET_ACCESS_KEY: "e2e-notes-secret-key-not-for-production",
    VAULT_STORAGE_KEY_SECRET: "e2e-storage-key-secret-not-for-production-0000",
    // The tests send CF-Connecting-IP with every request (@softure-ai/testing), as the other e2e runs do.
    CLIENT_IP_SOURCE: "cloudflare",
    // The suite checks the plans' limits, so the e2e stack enforces them (compose lifts them by default).
    PLAN_LIMITS: "enforced",
    MAIL_OUTBOX_URL: options.mailOutboxUrl,
    GH_AUTH_FAKE_ORIGIN: options.fakeServicesOrigin,
    DROPBOX_FAKE_ORIGIN: options.fakeServicesOrigin,
    STRIPE_API_BASE: options.fakeServicesOrigin,
  };
}

/** A compose .env file: one KEY='value' line each, single-quoted so compose reads the value as it is. */
export function formatEnvFile(env: Readonly<Record<string, string>>): string {
  return Object.entries(env)
    .map(([name, value]) => {
      if (value.includes("'") || value.includes("\n")) throw new Error(`formatEnvFile: ${name} holds a quote or a newline`);
      return `${name}='${value}'\n`;
    })
    .join("");
}
