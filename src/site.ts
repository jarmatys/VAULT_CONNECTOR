// The public site's fixed names, shared by the config, the pages and the tests: paths, the waitlist's scope and
// placement, the legal document a consent refers to, and the funnel's steps.
import type { FunnelStep } from "@softure-ai/analytics";
import { getLegalDocument, LEGAL_PATHS } from "./lib/legal-documents.ts";

/** The landing page. */
export const LANDING_PATH = "/";

/** The privacy policy's id in `privacy({ documents })`. */
export const PRIVACY_POLICY_DOCUMENT = "privacy-policy";

/** The privacy policy's page. */
export const PRIVACY_POLICY_PATH = LEGAL_PATHS[PRIVACY_POLICY_DOCUMENT];

/** The version a waitlist consent records: the newest entry of the policy's history. */
export const PRIVACY_POLICY_VERSION = getLegalDocument(PRIVACY_POLICY_DOCUMENT).version;

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
