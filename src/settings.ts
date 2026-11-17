// The app's settings from the environment. Every value that differs between the hosted instance and a self-hosted one
// (the address, the database) is an environment variable; the defaults are for a local, throwaway setup only.

/** The local Postgres a developer or the CI job runs; a throwaway database, so its password is not a secret. */
export const LOCAL_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/vaultconnector";

/** The address of a local `next start` or `wrangler dev`. */
export const LOCAL_APP_ORIGIN = "http://localhost:3000";

/**
 * Where the running code can be read (AGPL-3.0 section 13). A self-hosted instance that changes the code points this at
 * its own fork with `SOURCE_CODE_URL`.
 */
export const DEFAULT_SOURCE_CODE_URL = "https://github.com/jarmatys/VAULT_CONNECTOR";

/**
 * The sender of every mail until the owner sets the product's sending domain (`MAIL_FROM`). `.invalid` is reserved
 * (RFC 2606), so no real domain is claimed and nothing is hard-coded.
 */
export const DEFAULT_MAIL_FROM = "VaultConnector <hello@example.invalid>";

/** Where the app runs: `vps` is Node (self-hosted, Docker Compose), `cloudflare` is Workers behind Hyperdrive. */
export type Host = "vps" | "cloudflare";

export interface Settings {
  readonly databaseUrl: string;
  readonly appOrigin: string;
  readonly sourceCodeUrl: string;
  readonly mail: MailSettings;
}

/**
 * How mail leaves the app: through Resend once `RESEND_API_KEY` is set, otherwise through the test provider, which
 * writes to an outbox file (Node) or posts to an outbox address (Workers, which share no disk with a test) and refuses
 * to send when it has neither, so no mail silently disappears.
 */
export type MailTransport =
  | { readonly kind: "resend" }
  | { readonly kind: "outbox"; readonly outboxFile: string | undefined; readonly outboxUrl: string | undefined };

export interface MailSettings {
  readonly from: string;
  readonly transport: MailTransport;
}

type Environment = Readonly<Record<string, string | undefined>>;

/** The host the build and the config target, from `SOFTURE_HOST`; anything but `cloudflare` is the self-hosted Node. */
export function readHost(env: Environment): Host {
  return env.SOFTURE_HOST === "cloudflare" ? "cloudflare" : "vps";
}

/** The database, the public address, the source link and mail, falling back to the local defaults when a variable is unset or empty. */
export function readSettings(env: Environment): Settings {
  return {
    databaseUrl: readNonEmpty(env.DATABASE_URL) ?? LOCAL_DATABASE_URL,
    appOrigin: readNonEmpty(env.APP_ORIGIN) ?? LOCAL_APP_ORIGIN,
    sourceCodeUrl: readNonEmpty(env.SOURCE_CODE_URL) ?? DEFAULT_SOURCE_CODE_URL,
    mail: readMailSettings(env),
  };
}

/** The sender and the transport; the Resend key itself is read by the provider at send time, never kept here. */
export function readMailSettings(env: Environment): MailSettings {
  const transport: MailTransport =
    readNonEmpty(env.RESEND_API_KEY) === undefined
      ? { kind: "outbox", outboxFile: readNonEmpty(env.MAIL_OUTBOX), outboxUrl: readNonEmpty(env.MAIL_OUTBOX_URL) }
      : { kind: "resend" };
  return { from: readNonEmpty(env.MAIL_FROM) ?? DEFAULT_MAIL_FROM, transport };
}

function readNonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}
