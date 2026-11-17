// @softure-ai/ops on the built app, on both hosts: GET /api/health checks the database (through Hyperdrive on workerd)
// and every module, and GET /api/health/build names the build.
import { expect, test } from "@playwright/test";

test("GET /api/health answers 200 ok with the database reachable, never cached", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(await response.json()).toEqual({ status: "ok" });
});

test("GET /api/health/build answers the build's commit and times, with no release outside a deploy", async ({ request }) => {
  const response = await request.get("/api/health/build");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  const info = (await response.json()) as Record<string, unknown>;
  expect(Object.keys(info).sort()).toEqual(["builtAt", "commit", "release", "startedAt"]);
  expect(info.release).toBeNull();
  expect(info.commit).toMatch(/^[0-9a-f]{40}$/);
  expect(Date.parse(String(info.builtAt))).toBeLessThanOrEqual(Date.now());
});
