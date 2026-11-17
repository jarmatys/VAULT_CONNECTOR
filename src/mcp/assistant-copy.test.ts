// What an assistant reads never sells (VC-19, FR-25): ChatGPT's directory forbids showing plans, prices or upgrades and
// linking to a checkout inside the assistant, so the server's instructions, tool texts and answers name no price,
// currency, upgrade, subscription, payment or checkout, and never the payment page. Pointing to the product's website
// is allowed, and that is where an ended access sends the person.
import { describe, expect, it } from "vitest";
import { en } from "../messages/en.ts";
import { BILLING_PATH } from "../panel-paths.ts";
import { describeEndedAccess } from "./access.ts";

const SELLING_WORDS = /\b(upgrade|upgrades|price|prices|pricing|checkout|subscribe|subscription|payment|pay|paid|cheaper|discount|(larger|bigger|higher|better) plan)\b|[$€£]|\bEUR\b|\bUSD\b|\/billing/i;

function collectStrings(value: unknown, path: string, into: [string, string][]): [string, string][] {
  if (typeof value === "string") into.push([path, value]);
  else if (value !== null && typeof value === "object") for (const [key, child] of Object.entries(value)) collectStrings(child, `${path}.${key}`, into);
  return into;
}

describe("what an assistant reads", () => {
  const strings = collectStrings(en.mcp, "mcp", []);

  it("covers the instructions, every tool text and every answer", () => {
    const paths = strings.map(([path]) => path);
    expect(paths).toContain("mcp.instructions");
    expect(paths).toContain("mcp.tools.searchVault.description");
    expect(paths).toContain("mcp.answers.accessEnded");
    expect(paths).toContain("mcp.answers.statusOverLimit");
  });

  it.each(strings)("%s names no price, upgrade, payment or checkout", (_path, text) => {
    expect(text).not.toMatch(SELLING_WORDS);
  });

  it("points an ended access to the product's website, never to the payment page", () => {
    const ended = { since: new Date("2026-12-01T00:00:00Z"), removeAt: new Date("2026-12-31T00:00:00Z"), isPastGrace: false };
    const text = describeEndedAccess(ended, "https://vault.example");
    expect(text).toBe(
      "This account's access ended on 2026-12-01, so its notes cannot be read or searched until the person renews it on the VaultConnector website: https://vault.example The shared notes are kept until 2026-12-31 and removed after that.",
    );
    expect(text).not.toContain(BILLING_PATH);
    expect(describeEndedAccess({ ...ended, isPastGrace: true }, "https://vault.example")).toBe(
      "This account's access ended on 2026-12-01 and its copied notes were removed after the grace period. Once the person renews it on the VaultConnector website (https://vault.example), the shared folders are copied again.",
    );
  });
});
