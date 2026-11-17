// The proxy guards the panel. Next only picks up a proxy that sits next to the app directory (src/proxy.ts beside
// src/app); one at the repository root is silently ignored, and the OpenNext build then fails.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy.ts";

const ORIGIN = "http://localhost:3000";

describe("proxy", () => {
  it("sits next to the app directory, where Next looks for it", () => {
    expect(existsSync(join(import.meta.dirname, "app"))).toBe(true);
    expect(existsSync(join(import.meta.dirname, "..", "proxy.ts"))).toBe(false);
  });

  it("sends a visitor without a session cookie from the panel to the login page, with the panel as next", () => {
    const response = proxy(new NextRequest(`${ORIGIN}/panel`));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/login?next=%2Fpanel`);
  });

  it("lets a visitor through to a public page", () => {
    const response = proxy(new NextRequest(`${ORIGIN}/`));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
