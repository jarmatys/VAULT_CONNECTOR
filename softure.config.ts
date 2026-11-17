// The app's SOFTURE configuration. `softure migrate` loads this file with Node's type stripping, so relative imports
// name their `.ts` files.
import { auth, AUTH_RATE_LIMIT_BUCKETS, REGISTRATION_CLOSED_SWITCH, type OidcProviderInput } from "@softure-ai/auth";
import { mailingResetSender } from "@softure-ai/auth/mailing";
import { defineSoftureConfig } from "@softure-ai/core";
import { registerSoftureConfig } from "@softure-ai/core/next";
import { featureSwitches } from "@softure-ai/feature-switches";
import { mailing, resend } from "@softure-ai/mailing";
import { fakeMailProvider } from "@softure-ai/mailing/testing";
import { ops } from "@softure-ai/ops";
import { cloudflareIp, security } from "@softure-ai/security";
import { GITHUB_CLIENT_ID_ENV, GITHUB_CLIENT_SECRET_ENV, readAccountSettings } from "./src/account-settings.ts";
import { createGithubFakeFetch } from "./src/auth/github-fetch.ts";
import { en } from "./src/messages/en.ts";
import { PANEL_PATH } from "./src/panel-paths.ts";
import { readHost, readSettings } from "./src/settings.ts";

const settings = readSettings(process.env);
const accounts = readAccountSettings(process.env);

// Sign-in with GitHub (one GitHub App for sign-in and, from VC-6, the vault source; research of account-signs-up-to-panel).
// Anyone with a verified GitHub email may sign up while registration is open. Without the two client variables the
// provider is left out, so an instance without GitHub shows no button.
const githubProvider: OidcProviderInput = {
  type: "github",
  id: "github",
  name: "GitHub",
  clientIdEnv: GITHUB_CLIENT_ID_ENV,
  clientSecretEnv: GITHUB_CLIENT_SECRET_ENV,
  openSignUp: true,
};

const config = defineSoftureConfig({
  database: { url: settings.databaseUrl },
  // One codebase on both hosts (SOFTURE/AI docs/07-runtime-providers.md): `SOFTURE_HOST=cloudflare` builds and runs the
  // app in workerd behind Hyperdrive; anything else is the self-hosted `vps+node`.
  ...(readHost(process.env) === "cloudflare" ? { platform: { host: "cloudflare" as const } } : {}),
  locale: "en",
  timezone: "UTC",
  appOrigin: settings.appOrigin,
  modules: [
    // GET /api/health checks the database and every module; the answer names no check, so a stranger learns nothing.
    ops(),
    // Rate limits keyed by the client address Cloudflare passes on. Without that header (next dev, a test stack) a
    // request is refused unless RATE_LIMIT_SHARED_FALLBACK=1 counts all of them under one key.
    security({
      clientIp: cloudflareIp(),
      unidentified: accounts.hasSharedRateLimitFallback ? { key: "local" } : "refuse",
      buckets: { ...AUTH_RATE_LIMIT_BUCKETS },
    }),
    // Accounts: email and password with the required consent, GitHub, password reset by mail; the panel is home.
    auth({
      routes: { afterLogin: PANEL_PATH, changePassword: `${PANEL_PATH}/password` },
      passwordReset: { send: mailingResetSender() },
      oidc: {
        providers: accounts.isGithubSignInEnabled ? [githubProvider] : [],
        ...(accounts.githubFakeOrigin === undefined ? {} : { fetch: createGithubFakeFetch(accounts.githubFakeOrigin) }),
      },
    }),
    // Resend when its key is set. Otherwise the fake provider: in tests it posts each mail to the outbox sink
    // (MAIL_OUTBOX_URL); anywhere else it refuses to send, so no mail silently disappears.
    mailing({
      from: accounts.mail.from,
      ...(accounts.mail.replyTo === undefined ? {} : { replyTo: accounts.mail.replyTo }),
      provider: accounts.mail.hasResendKey ? resend() : fakeMailProvider({ outboxUrl: accounts.mail.outboxUrl }),
    }),
    // Registration can be closed: the stored value, or SOFTURE_SWITCH_AUTH_REGISTRATION_CLOSED over it. A failed read
    // keeps registration closed (fail mode open = the switch reads as on).
    featureSwitches({
      switches: [
        {
          name: REGISTRATION_CLOSED_SWITCH,
          label: { en: en.switches.registrationClosed.label },
          description: { en: en.switches.registrationClosed.description },
          default: false,
          failMode: "open",
        },
      ],
    }),
  ],
});

registerSoftureConfig(config);
export default config;
