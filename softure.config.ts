// The app's SOFTURE configuration. `softure migrate` loads this file with Node's type stripping, so relative imports
// name their `.ts` files.
import { analytics } from "@softure-ai/analytics";
import { countFunnelStep, countRegistration, getChannel } from "@softure-ai/analytics/next";
import {
  auth,
  AUTH_RATE_LIMIT_BUCKETS,
  REGISTRATION_CLOSED_SWITCH,
  type OidcProviderInput,
  type OnRegisteredHook,
} from "@softure-ai/auth";
import { mailingResetSender } from "@softure-ai/auth/mailing";
import { backup } from "@softure-ai/backup";
import { defineSoftureConfig } from "@softure-ai/core";
import { registerSoftureConfig } from "@softure-ai/core/next";
import { featureSwitches } from "@softure-ai/feature-switches";
import { jobs } from "@softure-ai/jobs";
import { mailing, resend } from "@softure-ai/mailing";
import { fakeMailProvider } from "@softure-ai/mailing/testing";
import { ops } from "@softure-ai/ops";
import { privacy, PRIVACY_RATE_LIMIT_BUCKETS } from "@softure-ai/privacy";
import { recordRegistrationConsent } from "@softure-ai/privacy/server";
import { cloudflareIp, security } from "@softure-ai/security";
import { securityJobSchedules } from "@softure-ai/security/jobs";
import { seo } from "@softure-ai/seo";
import { waitlist, WAITLIST_RATE_LIMIT_BUCKETS } from "@softure-ai/waitlist";
import { withdrawWaitlistConsents } from "@softure-ai/waitlist/server";
import { GITHUB_CLIENT_ID_ENV, GITHUB_CLIENT_SECRET_ENV, readAccountSettings } from "./src/account-settings.ts";
import { createGithubFakeFetch } from "./src/auth/github-fetch.ts";
import { LEGAL_DOCUMENTS, LEGAL_PATHS } from "./src/lib/legal-documents.ts";
import { FUNNEL_STEPS, LANDING_PATH, PRIVACY_POLICY_DOCUMENT, WAITLIST_PLACEMENT, WAITLIST_SCOPE } from "./src/site.ts";
import { en } from "./src/messages/en.ts";
import { PANEL_PATH } from "./src/panel-paths.ts";
import { vault } from "./src/vault/module.ts";
import { VAULT_INDEX_QUEUES, VAULT_INDEX_SCHEDULES } from "./src/vault/index/index-queues.ts";
import { VAULT_SYNC_QUEUES, VAULT_SYNC_SCHEDULES } from "./src/vault/sync/sync-queues.ts";
import { readHost, readSettings, type MailTransport } from "./src/settings.ts";

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

/** Runs auth's registration hooks one after another, inside the registration transaction. */
function runInOrder(...hooks: readonly OnRegisteredHook[]): OnRegisteredHook {
  return async (event, ctx) => {
    for (const hook of hooks) await hook(event, ctx);
  };
}

/** Resend once the owner sets a key; until then the test provider, which never sends a real mail. */
function createMailProvider(transport: MailTransport) {
  return transport.kind === "resend" ? resend() : fakeMailProvider({ outboxFile: transport.outboxFile, outboxUrl: transport.outboxUrl });
}

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
    // The table backup.runs, where the nightly off-site copy (.github/workflows/backup.yml) records each run.
    backup(),
    // Rate limits per client address. The hosted version sits behind Cloudflare, which sets CF-Connecting-IP; the
    // self-hosted compose (VC-18) chooses its own resolver. Without that header (next dev, a test stack) a request is
    // refused unless RATE_LIMIT_SHARED_FALLBACK=1 counts all of them under one key.
    security({
      clientIp: cloudflareIp(),
      unidentified: accounts.hasSharedRateLimitFallback ? { key: "local" } : "refuse",
      buckets: { ...AUTH_RATE_LIMIT_BUCKETS, ...PRIVACY_RATE_LIMIT_BUCKETS, ...WAITLIST_RATE_LIMIT_BUCKETS },
    }),
    // Accounts: email and password with the required consent, GitHub, password reset by mail; the panel is home. A
    // registration records the consent to the legal documents and counts as the funnel's `signup` step.
    auth({
      routes: { afterLogin: PANEL_PATH, changePassword: `${PANEL_PATH}/password` },
      passwordReset: { send: mailingResetSender() },
      oidc: {
        providers: accounts.isGithubSignInEnabled ? [githubProvider] : [],
        ...(accounts.githubFakeOrigin === undefined ? {} : { fetch: createGithubFakeFetch(accounts.githubFakeOrigin) }),
      },
      onRegistered: runInOrder(recordRegistrationConsent(), countRegistration("signup")),
    }),
    // The welcome mail is list mail: it carries the unsubscribe link (MAILING_UNSUBSCRIBE_SECRET signs it), and an
    // unsubscribe withdraws the waitlist's consents in the same transaction.
    mailing({
      from: settings.mail.from,
      provider: createMailProvider(settings.mail.transport),
      onUnsubscribed: withdrawWaitlistConsents,
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
    // The documents a consent refers to, with the history the legal pages show; the version is the newest entry.
    privacy({ documents: LEGAL_DOCUMENTS.map(({ id, history }) => ({ id, history: [...history] })) }),
    // Single opt-in: a sign-up counts at once and gets the welcome mail. A sign-up that counts is the funnel's
    // `waitlist` step, under the channel of the page the form was sent from.
    waitlist({
      scopes: [{ id: WAITLIST_SCOPE, required: true, document: PRIVACY_POLICY_DOCUMENT, label: { en: en.landing.waitlistConsent } }],
      placements: [WAITLIST_PLACEMENT],
      onJoined: countFunnelStep("waitlist"),
      resolveChannel: () => getChannel(),
    }),
    // The cookieless funnel: visits of the landing page, waitlist sign-ups, and registrations (auth's hook above).
    analytics({ funnel: { steps: FUNNEL_STEPS } }),
    // The vault source an account connects (VC-6): the `vault` schema, owned by this app.
    vault(),
    // Background jobs (VC-8): the vault sync's steps and its five-minute check. On Workers a Cron Trigger runs one tick
    // a minute (worker.ts); on Node the worker process (scripts/worker.ts). Security's prunes keep the rate limit
    // rows and the webhook delivery ids bounded.
    jobs({
      queues: { ...VAULT_SYNC_QUEUES, ...VAULT_INDEX_QUEUES },
      schedules: { ...securityJobSchedules, ...VAULT_SYNC_SCHEDULES, ...VAULT_INDEX_SCHEDULES },
    }),
    // robots.txt names the AI crawlers (all welcome on public pages) and closes the API; sitemap.xml lists the
    // public pages: the landing page and the legal documents.
    seo({
      robots: { disallow: ["/api"] },
      sitemap: {
        entries: [
          { path: LANDING_PATH, priority: 1 },
          { path: LEGAL_PATHS["privacy-policy"], priority: 0.3 },
          { path: LEGAL_PATHS.terms, priority: 0.3 },
        ],
      },
    }),
  ],
});

registerSoftureConfig(config);
export default config;
