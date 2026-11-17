// @softure-ai/seo on both hosts: robots.txt opens the public pages to every crawler, names the AI crawlers, closes the
// API and points at the sitemap; sitemap.xml lists the landing page on the app's origin.
import { expect, test } from "@playwright/test";

test("robots.txt names AI crawlers, closes the API and points at the sitemap", async ({ request, baseURL }) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain("User-Agent: *");
  expect(body).toContain("Disallow: /api");
  expect(body).toMatch(/User-Agent: (GPTBot|ClaudeBot|Claude-User)/);
  expect(body).toContain(`Sitemap: ${String(baseURL)}/sitemap.xml`);
});

test("sitemap.xml lists the landing page and the legal pages on the app's origin", async ({ request, baseURL }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  const sitemap = await response.text();
  for (const path of ["/", "/privacy", "/terms"]) {
    expect(sitemap).toContain(`<loc>${String(baseURL)}${path}</loc>`);
  }
});
