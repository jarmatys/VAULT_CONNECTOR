// The reviewer command's arguments and environment: what it accepts, what it refuses, and which variables it names.
import { describe, expect, it } from "vitest";
import { parseReviewerArgs, readReviewerVault, REVIEWER_VAULT_ENV } from "./reviewer-command.ts";

describe("parseReviewerArgs", () => {
  it("creates with the default fourteen days", () => {
    expect(parseReviewerArgs(["--email=reviewer@example.com"])).toEqual({ kind: "create", email: "reviewer@example.com", days: 14 });
  });

  it("creates with the days asked, in any order", () => {
    expect(parseReviewerArgs(["--days=30", "--email=reviewer@example.com"])).toEqual({ kind: "create", email: "reviewer@example.com", days: 30 });
  });

  it("removes by the address", () => {
    expect(parseReviewerArgs(["--remove", "--email=reviewer@example.com"])).toEqual({ kind: "remove", email: "reviewer@example.com" });
  });

  it.each([
    [[]],
    [["--days=14"]],
    [["--email=not-an-address"]],
    [["--email=a@example.com", "--email=b@example.com"]],
    [["--email=a@example.com", "--days=-1"]],
    [["--email=a@example.com", "--days=1000"]],
    [["--remove", "--email=a@example.com", "--days=3"]],
    [["--email=a@example.com", "--force"]],
  ])("refuses %j", (argv) => {
    expect(parseReviewerArgs(argv)).toBeNull();
  });
});

describe("readReviewerVault", () => {
  it("reads the bucket, trimmed, with an empty region and prefix when unset", () => {
    expect(
      readReviewerVault({
        [REVIEWER_VAULT_ENV.endpoint]: " https://storage.example.com ",
        [REVIEWER_VAULT_ENV.bucket]: "reviewer-vault",
        [REVIEWER_VAULT_ENV.accessKeyId]: "AKIAFICTIONAL",
        [REVIEWER_VAULT_ENV.secretAccessKey]: "fictional",
      }),
    ).toEqual({
      ok: true,
      value: { endpoint: "https://storage.example.com", region: "", bucket: "reviewer-vault", prefix: "", accessKeyId: "AKIAFICTIONAL", secretAccessKey: "fictional" },
    });
  });

  it("names every missing variable", () => {
    expect(readReviewerVault({ [REVIEWER_VAULT_ENV.bucket]: "reviewer-vault" })).toEqual({
      ok: false,
      missing: ["REVIEWER_VAULT_ENDPOINT", "REVIEWER_VAULT_ACCESS_KEY_ID", "REVIEWER_VAULT_SECRET_ACCESS_KEY"],
    });
  });
});
