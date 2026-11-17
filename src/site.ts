// The public site's fixed names, shared by the config, the pages and the tests: paths, the waitlist's scope and
// placement, the legal document a consent refers to, and the funnel's steps.
import type { FunnelStep } from "@softure-ai/analytics";

/** The landing page. */
export const LANDING_PATH = "/";

/** The privacy policy's page (its content comes with VC-3). */
export const PRIVACY_POLICY_PATH = "/privacy";

/** The privacy policy's id in `privacy({ documents })`, and the version a waitlist consent records. */
export const PRIVACY_POLICY_DOCUMENT = "privacy-policy";
export const PRIVACY_POLICY_VERSION = "2026-11-17";

/** The one consent the waitlist asks for: a mail when the hosted version opens. */
export const WAITLIST_SCOPE = "launch";

/** Where the waitlist form sits. */
export const WAITLIST_PLACEMENT = "landing";

/**
 * The funnel, from visit to account: a view of the landing page (a pixel, counted from `/` only), a waitlist sign-up
 * (the waitlist's hook) and a registration (auth's hook, wired with VC-5). Server steps cannot be counted from outside.
 */
export const FUNNEL_STEPS: FunnelStep[] = [
  { id: "landing", via: "pixel", pages: [LANDING_PATH] },
  { id: "waitlist", via: "server" },
  { id: "signup", via: "server" },
];
