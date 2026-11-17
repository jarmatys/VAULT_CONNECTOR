import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAIL_FROM,
  DEFAULT_SOURCE_CODE_URL,
  LOCAL_APP_ORIGIN,
  LOCAL_DATABASE_URL,
  readHost,
  readMailSettings,
  readSettings,
} from "./settings.ts";

const LOCAL_MAIL = { from: DEFAULT_MAIL_FROM, transport: { kind: "outbox", outboxFile: undefined, outboxUrl: undefined } };

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
      mail: LOCAL_MAIL,
    });
  });

  it("takes every value from the environment when it is set", () => {
    expect(
      readSettings({
        DATABASE_URL: "postgresql://app:secret@db.example.com:5432/notes",
        APP_ORIGIN: "https://notes.example.com",
        SOURCE_CODE_URL: "https://git.example.com/fork",
      }),
    ).toEqual({
      databaseUrl: "postgresql://app:secret@db.example.com:5432/notes",
      appOrigin: "https://notes.example.com",
      sourceCodeUrl: "https://git.example.com/fork",
      mail: LOCAL_MAIL,
    });
  });

  it("treats an empty or blank variable as unset and trims the rest", () => {
    expect(readSettings({ DATABASE_URL: "", APP_ORIGIN: "   ", SOURCE_CODE_URL: " https://git.example.com/fork " })).toEqual({
      databaseUrl: LOCAL_DATABASE_URL,
      appOrigin: LOCAL_APP_ORIGIN,
      sourceCodeUrl: "https://git.example.com/fork",
      mail: LOCAL_MAIL,
    });
  });
});

describe("readMailSettings", () => {
  it("sends through Resend once a key is set, and never keeps the key", () => {
    const mail = readMailSettings({ RESEND_API_KEY: "re_test_key", MAIL_FROM: "Notes <hello@mail.example.com>" });
    expect(mail).toEqual({ from: "Notes <hello@mail.example.com>", transport: { kind: "resend" } });
    expect(JSON.stringify(mail)).not.toContain("re_test_key");
  });

  it("writes to the test outbox without a key, by file on Node or by address on Workers", () => {
    expect(readMailSettings({ MAIL_OUTBOX: "/tmp/outbox.jsonl" }).transport).toEqual({
      kind: "outbox",
      outboxFile: "/tmp/outbox.jsonl",
      outboxUrl: undefined,
    });
    expect(readMailSettings({ RESEND_API_KEY: " ", MAIL_OUTBOX_URL: "http://127.0.0.1:3192/outbox" }).transport).toEqual({
      kind: "outbox",
      outboxFile: undefined,
      outboxUrl: "http://127.0.0.1:3192/outbox",
    });
  });

  it("uses the placeholder sender on a reserved domain until MAIL_FROM is set", () => {
    expect(readMailSettings({}).from).toBe(DEFAULT_MAIL_FROM);
    expect(DEFAULT_MAIL_FROM).toMatch(/@example\.invalid>$/);
  });
});
