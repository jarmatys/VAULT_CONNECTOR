import { describe, expect, it } from "vitest";
import { DEFAULT_MAIL_FROM, readAccountSettings, toLoopbackOrigin } from "./account-settings.ts";

describe("readAccountSettings", () => {
  it("falls back to the placeholder sender, no GitHub, no fake and no shared rate-limit key when nothing is set", () => {
    expect(readAccountSettings({})).toEqual({
      mail: { from: DEFAULT_MAIL_FROM, replyTo: undefined, hasResendKey: false, outboxUrl: undefined },
      isGithubSignInEnabled: false,
      githubFakeOrigin: undefined,
      hasSharedRateLimitFallback: false,
    });
  });

  it("takes every value from the environment when it is set", () => {
    expect(
      readAccountSettings({
        MAIL_FROM: "Notes <hello@notes.example.com>",
        MAIL_REPLY_TO: "support@notes.example.com",
        RESEND_API_KEY: "re_test",
        MAIL_OUTBOX_URL: "http://127.0.0.1:3199/outbox",
        GH_AUTH_CLIENT_ID: "Iv1.client",
        GH_AUTH_CLIENT_SECRET: "secret",
        GH_AUTH_FAKE_ORIGIN: "http://127.0.0.1:3199",
        RATE_LIMIT_SHARED_FALLBACK: "1",
      }),
    ).toEqual({
      mail: { from: "Notes <hello@notes.example.com>", replyTo: "support@notes.example.com", hasResendKey: true, outboxUrl: "http://127.0.0.1:3199/outbox" },
      isGithubSignInEnabled: true,
      githubFakeOrigin: "http://127.0.0.1:3199",
      hasSharedRateLimitFallback: true,
    });
  });

  it("enables GitHub sign-in only when both the client id and the secret are set", () => {
    expect(readAccountSettings({ GH_AUTH_CLIENT_ID: "Iv1.client" }).isGithubSignInEnabled).toBe(false);
    expect(readAccountSettings({ GH_AUTH_CLIENT_SECRET: "secret" }).isGithubSignInEnabled).toBe(false);
    expect(readAccountSettings({ GH_AUTH_CLIENT_ID: " ", GH_AUTH_CLIENT_SECRET: "secret" }).isGithubSignInEnabled).toBe(false);
  });

  it("shares the rate-limit key only for the exact value 1", () => {
    expect(readAccountSettings({ RATE_LIMIT_SHARED_FALLBACK: "true" }).hasSharedRateLimitFallback).toBe(false);
    expect(readAccountSettings({ RATE_LIMIT_SHARED_FALLBACK: "0" }).hasSharedRateLimitFallback).toBe(false);
  });
});

describe("toLoopbackOrigin", () => {
  it("keeps the origin of a loopback http or https URL", () => {
    expect(toLoopbackOrigin("http://localhost:3199/anything")).toBe("http://localhost:3199");
    expect(toLoopbackOrigin("http://127.0.0.1:3199")).toBe("http://127.0.0.1:3199");
    expect(toLoopbackOrigin("https://[::1]:8443")).toBe("https://[::1]:8443");
  });

  it("ignores any other host, protocol, credentials or a malformed value, so production never leaves GitHub", () => {
    expect(toLoopbackOrigin("https://github.example.com")).toBeUndefined();
    expect(toLoopbackOrigin("http://localhost.example.com")).toBeUndefined();
    expect(toLoopbackOrigin("http://10.0.0.5:3199")).toBeUndefined();
    expect(toLoopbackOrigin("ftp://localhost")).toBeUndefined();
    expect(toLoopbackOrigin("http://user:pass@localhost:3199")).toBeUndefined();
    expect(toLoopbackOrigin("not a url")).toBeUndefined();
    expect(toLoopbackOrigin(undefined)).toBeUndefined();
  });
});
