import { describe, expect, it } from "vitest";
import { DEFAULT_SOURCE_CODE_URL, LOCAL_APP_ORIGIN, LOCAL_DATABASE_URL, readHost, readSettings } from "./settings.ts";

describe("readHost", () => {
  it("targets Cloudflare Workers only when SOFTURE_HOST is cloudflare", () => {
    expect(readHost({ SOFTURE_HOST: "cloudflare" })).toBe("cloudflare");
  });

  it("targets the self-hosted Node when SOFTURE_HOST is unset, empty or anything else", () => {
    expect(readHost({})).toBe("vps");
    expect(readHost({ SOFTURE_HOST: "" })).toBe("vps");
    expect(readHost({ SOFTURE_HOST: "vps" })).toBe("vps");
    expect(readHost({ SOFTURE_HOST: "Cloudflare" })).toBe("vps");
  });
});

describe("readSettings", () => {
  it("falls back to the local database, origin and the public repository when nothing is set", () => {
    expect(readSettings({})).toEqual({
      databaseUrl: LOCAL_DATABASE_URL,
      appOrigin: LOCAL_APP_ORIGIN,
      sourceCodeUrl: DEFAULT_SOURCE_CODE_URL,
      operator: null,
    });
  });

  it("takes every value from the environment when it is set", () => {
    expect(
      readSettings({
        DATABASE_URL: "postgresql://app:secret@db.example.com:5432/notes",
        APP_ORIGIN: "https://notes.example.com",
        SOURCE_CODE_URL: "https://git.example.com/fork",
        OPERATOR_NAME: "Example Notes Ltd",
        OPERATOR_CONTACT: "privacy@example.com",
      }),
    ).toEqual({
      databaseUrl: "postgresql://app:secret@db.example.com:5432/notes",
      appOrigin: "https://notes.example.com",
      sourceCodeUrl: "https://git.example.com/fork",
      operator: { name: "Example Notes Ltd", contact: "privacy@example.com" },
    });
  });

  it("treats an empty or blank variable as unset and trims the rest", () => {
    expect(readSettings({ DATABASE_URL: "", APP_ORIGIN: "   ", SOURCE_CODE_URL: " https://git.example.com/fork " })).toEqual({
      databaseUrl: LOCAL_DATABASE_URL,
      appOrigin: LOCAL_APP_ORIGIN,
      sourceCodeUrl: "https://git.example.com/fork",
      operator: null,
    });
  });

  it("names an operator without a contact when only OPERATOR_NAME is set", () => {
    expect(readSettings({ OPERATOR_NAME: " Example Notes Ltd ", OPERATOR_CONTACT: " " }).operator).toEqual({
      name: "Example Notes Ltd",
      contact: null,
    });
  });

  it("names no operator when OPERATOR_NAME is unset or blank, even with a contact", () => {
    expect(readSettings({ OPERATOR_CONTACT: "privacy@example.com" }).operator).toBeNull();
    expect(readSettings({ OPERATOR_NAME: "  ", OPERATOR_CONTACT: "privacy@example.com" }).operator).toBeNull();
  });
});
