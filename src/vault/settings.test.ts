// The git source is configured only with all five GitHub App values, well formed.
import { describe, expect, it } from "vitest";
import { readGithubSourceSettings } from "./settings.ts";

const COMPLETE = {
  GH_APP_ID: "123456",
  GH_APP_SLUG: "vault-connector-test",
  GH_APP_PRIVATE_KEY: "fake-private-key",
  GH_AUTH_CLIENT_ID: "Iv1.client",
  GH_AUTH_CLIENT_SECRET: "secret",
};

describe("the git source settings", () => {
  it("are configured with the App id, its URL name, its key and the sign-in client", () => {
    expect(readGithubSourceSettings(COMPLETE)).toEqual({
      kind: "configured",
      appId: "123456",
      slug: "vault-connector-test",
      privateKey: COMPLETE.GH_APP_PRIVATE_KEY,
      clientId: "Iv1.client",
      clientSecret: "secret",
    });
  });

  it("are unconfigured when a value is missing, empty or malformed", () => {
    for (const name of Object.keys(COMPLETE)) {
      expect(readGithubSourceSettings({ ...COMPLETE, [name]: undefined }).kind).toBe("unconfigured");
      expect(readGithubSourceSettings({ ...COMPLETE, [name]: "  " }).kind).toBe("unconfigured");
    }
    expect(readGithubSourceSettings({ ...COMPLETE, GH_APP_ID: "12a" }).kind).toBe("unconfigured");
    expect(readGithubSourceSettings({ ...COMPLETE, GH_APP_SLUG: "bad/slug" }).kind).toBe("unconfigured");
    expect(readGithubSourceSettings({ ...COMPLETE, GH_APP_SLUG: "-dash" }).kind).toBe("unconfigured");
  });
});
