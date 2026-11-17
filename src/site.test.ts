import { WAITLIST_RATE_LIMIT_BUCKETS } from "@softure-ai/waitlist";
import { describe, expect, it } from "vitest";
import config from "../softure.config.ts";
import { en } from "./messages/en.ts";
import { FUNNEL_STEPS, PRIVACY_POLICY_DOCUMENT, PRIVACY_POLICY_VERSION, WAITLIST_PLACEMENT, WAITLIST_SCOPE } from "./site.ts";

function readOptions(id: string): unknown {
  const found = config.modules.find((module) => module.id === id);
  if (found === undefined) throw new Error(`module ${id} is not configured`);
  return found.options;
}

describe("the waitlist", () => {
  it("asks for one required consent, tied to the privacy policy, from the landing page only", () => {
    expect(readOptions("waitlist")).toMatchObject({
      scopes: [{ id: WAITLIST_SCOPE, required: true, document: PRIVACY_POLICY_DOCUMENT, label: { en: en.landing.waitlistConsent } }],
      placements: [WAITLIST_PLACEMENT],
      welcomeMail: true,
      doubleOptIn: null,
    });
  });

  it("declares the document its consent refers to, at the version the policy page shows", () => {
    expect(readOptions("privacy")).toMatchObject({
      documents: [{ id: PRIVACY_POLICY_DOCUMENT, version: PRIVACY_POLICY_VERSION }, { id: "terms" }],
    });
    expect(PRIVACY_POLICY_VERSION).toBe("2026-11-18");
  });

  it("is rate limited per client and per address", () => {
    expect(readOptions("security")).toMatchObject({ buckets: WAITLIST_RATE_LIMIT_BUCKETS });
  });

  it("links the privacy policy from its consent statement", () => {
    expect(en.landing.waitlistConsent).toContain(en.landing.privacyPolicy);
  });
});

describe("the funnel", () => {
  it("counts landing visits by pixel from / only, and sign-ups and registrations on the server", () => {
    expect(FUNNEL_STEPS).toEqual([
      { id: "landing", via: "pixel", pages: ["/"] },
      { id: "waitlist", via: "server" },
      { id: "signup", via: "server" },
    ]);
    expect(readOptions("analytics")).toMatchObject({ funnel: { steps: FUNNEL_STEPS } });
  });
});

describe("the landing copy", () => {
  it("answers each of the five pains", () => {
    expect(en.landing.pains).toHaveLength(5);
    for (const { pain, answer } of en.landing.pains) {
      expect(pain.length).toBeGreaterThan(0);
      expect(answer.length).toBeGreaterThan(0);
    }
  });
});

describe("crawlers", () => {
  it("may read the public pages but not the API, and the sitemap lists the landing page and the legal pages", () => {
    expect(readOptions("seo")).toMatchObject({
      robots: { allow: ["/"], disallow: ["/api"] },
      sitemap: {
        entries: [
          { path: "/", priority: 1 },
          { path: "/privacy", priority: 0.3 },
          { path: "/terms", priority: 0.3 },
        ],
      },
    });
  });
});
