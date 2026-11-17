import { describe, expect, it } from "vitest";
import { parseListObjectsPage } from "./s3-listing.ts";

describe("parseListObjectsPage", () => {
  it("reads keys, ETags, sizes and the next token, unescaping XML", () => {
    const page = parseListObjectsPage(
      `<?xml version="1.0"?><ListBucketResult><IsTruncated>true</IsTruncated><Contents><Key>A &amp; B&#x2F;C.md</Key><ETag>&quot;abc-2&quot;</ETag><Size>12</Size></Contents><NextContinuationToken>t/1==</NextContinuationToken></ListBucketResult>`,
    );
    expect(page).toEqual({ objects: [{ key: "A & B/C.md", etag: "abc-2", size: 12 }], nextToken: "t/1==" });
  });

  it("reads an empty last page", () => {
    expect(parseListObjectsPage(`<ListBucketResult xmlns="x"><IsTruncated>false</IsTruncated></ListBucketResult>`)).toEqual({ objects: [], nextToken: null });
  });

  it.each([
    ["an error document", `<Error><Code>AccessDenied</Code></Error>`],
    ["an entry without an ETag", `<ListBucketResult><Contents><Key>a</Key><Size>1</Size></Contents></ListBucketResult>`],
    ["a negative size", `<ListBucketResult><Contents><Key>a</Key><ETag>e</ETag><Size>-1</Size></Contents></ListBucketResult>`],
    ["a truncated page without a token", `<ListBucketResult><IsTruncated>true</IsTruncated></ListBucketResult>`],
  ])("refuses %s", (_name, xml) => {
    expect(parseListObjectsPage(xml)).toBeNull();
  });
});
