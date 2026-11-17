import { describe, expect, it } from "vitest";
import { legalEn } from "../messages/legal.ts";
import { fillOperator } from "./legal-text.ts";

describe("fillOperator", () => {
  it("names the operator and the contact set for the instance", () => {
    expect(fillOperator("Run by {operator}. Write to {contact}, {operator}.", { name: "Example Notes Ltd", contact: "privacy@example.com" })).toBe(
      "Run by Example Notes Ltd. Write to privacy@example.com, Example Notes Ltd.",
    );
  });

  it("uses the neutral wording when the instance names no operator", () => {
    expect(fillOperator("Run by {operator}. Write to {contact}.", null)).toBe(
      `Run by ${legalEn.unnamedOperator}. Write to ${legalEn.unnamedContact}.`,
    );
  });

  it("uses the neutral contact when the operator has none", () => {
    expect(fillOperator("{contact}", { name: "Example Notes Ltd", contact: null })).toBe(legalEn.unnamedContact);
  });

  it("leaves text without placeholders unchanged", () => {
    expect(fillOperator("", null)).toBe("");
    expect(fillOperator("No training.", null)).toBe("No training.");
  });
});
