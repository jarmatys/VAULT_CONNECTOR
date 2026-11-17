import { describe, expect, it } from "vitest";
import { getLegalDocument, LEGAL_DOCUMENTS, LEGAL_PATHS } from "./legal-documents.ts";

describe("LEGAL_DOCUMENTS", () => {
  it("declares the privacy policy and the terms, each with a dated history", () => {
    expect(LEGAL_DOCUMENTS.map((document) => document.id)).toEqual(["privacy-policy", "terms"]);
    for (const document of LEGAL_DOCUMENTS) {
      expect(document.history.length).toBeGreaterThan(0);
      for (const revision of document.history) expect(revision.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("publishes each document at its own path", () => {
    expect(LEGAL_PATHS).toEqual({ "privacy-policy": "/privacy", terms: "/terms" });
  });
});

describe("getLegalDocument", () => {
  it("answers the first published version of the privacy policy", () => {
    expect(getLegalDocument("privacy-policy")).toEqual({
      id: "privacy-policy",
      version: "2026-11-17",
      history: [{ version: "2026-11-17", date: "2026-11-17", summary: "First version." }],
    });
  });

  it("puts the history newest first and takes the newest date as the version in force", () => {
    const documents = [
      {
        id: "terms" as const,
        history: [
          { date: "2026-11-17", summary: "First version." },
          { date: "2027-02-01", summary: "Paid plans." },
          { date: "2026-12-05", summary: "Search limits." },
        ],
      },
    ];
    const document = getLegalDocument("terms", documents);
    expect(document.version).toBe("2027-02-01");
    expect(document.history.map((revision) => revision.date)).toEqual(["2027-02-01", "2026-12-05", "2026-11-17"]);
  });

  it("refuses a document with no published text", () => {
    expect(() => getLegalDocument("terms", [{ id: "terms", history: [] }])).toThrow(
      'getLegalDocument: no published text for the legal document "terms"',
    );
    expect(() => getLegalDocument("terms", [])).toThrow('no published text for the legal document "terms"');
  });
});
