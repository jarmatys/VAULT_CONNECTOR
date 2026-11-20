import { describe, expect, it } from "vitest";
import nextConfig from "./next.config.ts";

describe("next.config headers", () => {
  it("forbid every other site from framing the OAuth consent page", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const consent = rules.find((rule) => rule.source === "/oauth/authorize");
    expect(consent?.headers).toEqual([
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
      { key: "X-Frame-Options", value: "DENY" },
    ]);
  });

  it("keep the home page's Link header for agents", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    expect(rules.some((rule) => rule.source === "/" && rule.headers.some((header) => header.key === "Link"))).toBe(true);
  });
});
