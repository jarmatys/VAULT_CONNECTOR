// The app's SOFTURE configuration. `softure migrate` loads this file with Node's type stripping, so relative imports
// name their `.ts` files.
import { analytics } from "@softure-ai/analytics";
import { countFunnelStep, getChannel } from "@softure-ai/analytics/next";
import { auth, AUTH_RATE_LIMIT_BUCKETS } from "@softure-ai/auth";
import { defineSoftureConfig } from "@softure-ai/core";
import { registerSoftureConfig } from "@softure-ai/core/next";
import { mailing, resend } from "@softure-ai/mailing";
import { fakeMailProvider } from "@softure-ai/mailing/testing";
import { ops } from "@softure-ai/ops";
import { privacy, PRIVACY_RATE_LIMIT_BUCKETS } from "@softure-ai/privacy";
import { cloudflareIp, security } from "@softure-ai/security";
import { seo } from "@softure-ai/seo";
import { waitlist, WAITLIST_RATE_LIMIT_BUCKETS } from "@softure-ai/waitlist";
import { withdrawWaitlistConsents } from "@softure-ai/waitlist/server";
import { LEGAL_DOCUMENTS, LEGAL_PATHS } from "./src/lib/legal-documents.ts";
import { FUNNEL_STEPS, LANDING_PATH, PRIVACY_POLICY_DOCUMENT, WAITLIST_PLACEMENT, WAITLIST_SCOPE } from "./src/site.ts";
import { en } from "./src/messages/en.ts";
import { readHost, readSettings, type MailTransport } from "./src/settings.ts";

const settings = readSettings(process.env);

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
    // Rate limits per client address. The hosted version sits behind Cloudflare, which sets CF-Connecting-IP; the
    // self-hosted compose (VC-18) chooses its own resolver.
    security({
      clientIp: cloudflareIp(),
      buckets: { ...AUTH_RATE_LIMIT_BUCKETS, ...PRIVACY_RATE_LIMIT_BUCKETS, ...WAITLIST_RATE_LIMIT_BUCKETS },
    }),
    // Accounts come with VC-5; the module is here because privacy (consents) and the waitlist depend on it.
    auth(),
    // The welcome mail is list mail: it carries the unsubscribe link (MAILING_UNSUBSCRIBE_SECRET signs it), and an
    // unsubscribe withdraws the waitlist's consents in the same transaction.
    mailing({
      from: settings.mail.from,
      provider: createMailProvider(settings.mail.transport),
      onUnsubscribed: withdrawWaitlistConsents,
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
    // The cookieless funnel: visits of the landing page, waitlist sign-ups, and registrations (VC-5 counts them).
    analytics({ funnel: { steps: FUNNEL_STEPS } }),
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
