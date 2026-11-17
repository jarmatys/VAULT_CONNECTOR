// The app's SOFTURE configuration. `softure migrate` loads this file with Node's type stripping, so relative imports
// name their `.ts` files.
import { alerts, webhookChannel, type AlertChannel } from "@softure-ai/alerts";
import { alertsFromJobs, alertsJobQueues, alertsJobSchedules } from "@softure-ai/alerts/jobs";
import { mailChannel } from "@softure-ai/alerts/mailing";
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
import { MCP_RATE_LIMIT_BUCKETS, mcpAccess } from "@softure-ai/mcp-access";
import { mcpAccessJobSchedules } from "@softure-ai/mcp-access/jobs";
import { metering } from "@softure-ai/metering";
import { createMeteringJobSchedules } from "@softure-ai/metering/jobs";
import { fakeMailProvider } from "@softure-ai/mailing/testing";
import { ops } from "@softure-ai/ops";
import { privacy, PRIVACY_RATE_LIMIT_BUCKETS } from "@softure-ai/privacy";
import { recordRegistrationConsent } from "@softure-ai/privacy/server";
import { cloudflareIp, security } from "@softure-ai/security";
import { securityJobSchedules } from "@softure-ai/security/jobs";
import { seo } from "@softure-ai/seo";
import { waitlist, WAITLIST_RATE_LIMIT_BUCKETS } from "@softure-ai/waitlist";
import { withdrawWaitlistConsents } from "@softure-ai/waitlist/server";
import { adminPanelGuard } from "./src/admin-guard.ts";
import { GITHUB_CLIENT_ID_ENV, GITHUB_CLIENT_SECRET_ENV, readAccountSettings } from "./src/account-settings.ts";
import { createGithubFakeFetch } from "./src/auth/github-fetch.ts";
import { ADMIN_ALERTS_PATH, ADMIN_JOBS_PATH, OPERATOR_HEARTBEAT_QUEUES, OPERATOR_HEARTBEAT_SCHEDULES } from "./src/jobs/alerts.ts";
import { readOperatorAlertSettings } from "./src/jobs/alert-settings.ts";
import { operator } from "./src/jobs/operator-module.ts";
import { LEGAL_DOCUMENTS, LEGAL_PATHS } from "./src/lib/legal-documents.ts";
import { FUNNEL_STEPS, LANDING_PATH, PRIVACY_POLICY_DOCUMENT, WAITLIST_PLACEMENT, WAITLIST_SCOPE } from "./src/site.ts";
import { en } from "./src/messages/en.ts";
import { ACCOUNT_PATH, CONNECTORS_PATH, PANEL_PATH, PRIVACY_EXPORT_PATH } from "./src/panel-paths.ts";
import { connector } from "./src/mcp/profile/module.ts";
import { MCP_SERVER_NAME, VAULT_TOOL_CATALOG } from "./src/mcp/catalog.ts";
import { SEARCH_CHARGES_KEEP_DAYS, searchMeteringProvider } from "./src/mcp/search-allowance.ts";
import { vault } from "./src/vault/module.ts";
import { VAULT_ERASE_QUEUES, VAULT_ERASE_SCHEDULES } from "./src/vault/erase/erase-queues.ts";
import { VAULT_INDEX_QUEUES, VAULT_INDEX_SCHEDULES } from "./src/vault/index/index-queues.ts";
import { VAULT_RATE_LIMIT_BUCKETS } from "./src/vault/sources/s3/rate-limit.ts";
import { VAULT_SYNC_QUEUE, VAULT_SYNC_QUEUES, VAULT_SYNC_SCHEDULES } from "./src/vault/sync/sync-queues.ts";
import { readHost, readSettings, type MailTransport } from "./src/settings.ts";

const settings = readSettings(process.env);
const accounts = readAccountSettings(process.env);
const operatorAlerts = readOperatorAlertSettings(process.env);
// The admin pages check the `admin` role from the session (ADMIN_EMAILS, or a role granted in auth.user_roles).
const panelGuard = adminPanelGuard;

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

/** The operator's mail always (unconfigured until ALERTS_MAIL_TO is set), and a webhook when one is set. */
function createAlertChannels(): Record<string, AlertChannel> {
  return {
    mail: mailChannel({ to: operatorAlerts.mailTo }),
    ...(operatorAlerts.webhookUrl === undefined ? {} : { webhook: webhookChannel({ url: operatorAlerts.webhookUrl }) }),
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
      buckets: { ...AUTH_RATE_LIMIT_BUCKETS, ...PRIVACY_RATE_LIMIT_BUCKETS, ...WAITLIST_RATE_LIMIT_BUCKETS, ...MCP_RATE_LIMIT_BUCKETS, ...VAULT_RATE_LIMIT_BUCKETS },
    }),
    // Accounts: email and password with the required consent, GitHub, password reset by mail; the panel is home. A
    // registration records the consent to the legal documents and counts as the funnel's `signup` step.
    auth({
      routes: { afterLogin: PANEL_PATH, changePassword: `${PANEL_PATH}/password` },
      adminEmails: operatorAlerts.adminEmails,
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
    // The documents a consent refers to, with the history the legal pages show; the version is the newest entry. The
    // panel's account screen (VC-16) downloads the account's data and deletes the account: every module's rows, the
    // vault's copies (queued for `vault.erase-copies`), the index and the assistants' tokens.
    privacy({
      documents: LEGAL_DOCUMENTS.map(({ id, history }) => ({ id, history: [...history] })),
      routes: { account: ACCOUNT_PATH, export: PRIVACY_EXPORT_PATH, afterDelete: LANDING_PATH },
      messages: { en: en.privacy },
    }),
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
    // What lane C keeps of an account (VC-9): its sentence about the vault, sent in the MCP server's instructions.
    connector(),
    // The monthly search allowance (VC-11): each search_vault call counts one request against the account's month,
    // SEARCHES_PER_MONTH by default; metering refuses a search once the month is used and names the reset date.
    metering({ providers: [searchMeteringProvider(process.env)] }),
    // Assistants connect over MCP (VC-9): OAuth 2.1 with open dynamic registration (claude.ai and ChatGPT register
    // before anyone signs in; a client gets nothing without the account's consent), and hand-issued tokens for other
    // clients. Every token reads only: writes are off and the server has no write tool. The panel's "Connect Claude"
    // screen lists the connected apps and tokens and revokes them.
    mcpAccess({
      serverName: MCP_SERVER_NAME,
      allowWrites: false,
      tools: VAULT_TOOL_CATALOG.map((tool) => ({ ...tool })),
      routes: { page: CONNECTORS_PATH },
      oauth: { enabled: true, registration: "open" },
      messages: { en: en.mcpAccess },
    }),
    // Background jobs (VC-8): the vault sync's steps and its five-minute check; the deleted accounts' copies (VC-16); mcp-access prunes expired tokens and
    // OAuth records daily (VC-9). On Workers a Cron Trigger runs one tick
    // a minute (worker.ts); on Node the worker process (scripts/worker.ts). Security's prunes keep the rate limit
    // rows and the webhook delivery ids bounded.
    // The operator's alerts (VC-13): three failed syncs in a row for one account, a failed job, a failing or late
    // schedule and a paused queue; the heartbeat's log line lets the observability backend see a dead tick.
    jobs({
      queues: { ...VAULT_SYNC_QUEUES, ...VAULT_INDEX_QUEUES, ...VAULT_ERASE_QUEUES, ...alertsJobQueues, ...OPERATOR_HEARTBEAT_QUEUES },
      schedules: {
        ...securityJobSchedules,
        ...mcpAccessJobSchedules,
        ...createMeteringJobSchedules({ keepDays: SEARCH_CHARGES_KEEP_DAYS }),
        ...VAULT_SYNC_SCHEDULES,
        ...VAULT_INDEX_SCHEDULES,
        ...VAULT_ERASE_SCHEDULES,
        ...alertsJobSchedules,
        ...OPERATOR_HEARTBEAT_SCHEDULES,
      },
      // A failed sync step is counted per account instead (src/jobs/alerts.ts): three in a row alert, not each one.
      ...alertsFromJobs({ link: new URL(ADMIN_JOBS_PATH, settings.appOrigin).toString(), ignoreQueues: [VAULT_SYNC_QUEUE] }),
      routes: { panel: ADMIN_JOBS_PATH },
      panelGuard,
    }),
    // The operator's own module (the failed syncs in a row) and the alerts' channels and admin list.
    operator(),
    alerts({ channels: createAlertChannels(), routes: { panel: ADMIN_ALERTS_PATH }, panelGuard }),
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
