// The docs' parse and render: the front matter's rules, the order, heading anchors and escaped raw HTML.
import { describe, expect, it } from "vitest";
import { parseDocPage, renderDocBody, sortDocPages, toHeadingId, type DocPage } from "./docs-content.ts";

const PAGE = "---\ntitle: Tools\ndescription: The tools.\norder: 2\n---\n\n# Body\n";

describe("parseDocPage", () => {
  it("reads the title, the description, the order and the body after the front matter", () => {
    expect(parseDocPage("tools", PAGE)).toEqual({ ok: true, value: { slug: "tools", title: "Tools", description: "The tools.", order: 2, body: "# Body" } });
  });

  it("reads a file with Windows line ends the same way", () => {
    expect(parseDocPage("tools", PAGE.replace(/\n/g, "\r\n"))).toEqual(parseDocPage("tools", PAGE));
  });

  it.each([
    ["tools", "# No front matter", "docs.front_matter_missing"],
    ["tools", "---\ndescription: d\norder: 1\n---\n", "docs.title_missing"],
    ["tools", "---\ntitle: t\norder: 1\n---\n", "docs.description_missing"],
    ["tools", "---\ntitle: t\ndescription: d\norder: 0\n---\n", "docs.order_invalid"],
    ["tools", "---\ntitle: t\ndescription: d\norder: two\n---\n", "docs.order_invalid"],
    ["Tools", PAGE, "docs.slug_invalid"],
    ["../tools", PAGE, "docs.slug_invalid"],
  ])("refuses slug %s with %j as %s", (slug, source, error) => {
    expect(parseDocPage(slug, source)).toEqual({ ok: false, error });
  });
});

describe("sortDocPages", () => {
  it("orders by order, then by slug", () => {
    const page = (slug: string, order: number): DocPage => ({ slug, order, title: slug, description: slug, body: "" });
    expect(sortDocPages([page("b", 2), page("c", 1), page("a", 2)]).map((p) => p.slug)).toEqual(["c", "a", "b"]);
  });
});

describe("renderDocBody", () => {
  it("gives h2 and h3 an anchor and leaves h1 without one", () => {
    expect(renderDocBody("# Top\n\n## Your notes are data\n\n### Step 2: pick")).toBe(
      '<h1>Top</h1>\n<h2 id="your-notes-are-data">Your notes are data</h2>\n<h3 id="step-2-pick">Step 2: pick</h3>\n',
    );
  });

  it("escapes raw HTML instead of rendering it", () => {
    expect(renderDocBody('<script>alert("x")</script>')).toBe("<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>\n");
  });

  it("renders tables and inline code", () => {
    expect(renderDocBody("| A |\n| --- |\n| `b` |")).toContain("<td><code>b</code></td>");
  });
});

describe("toHeadingId", () => {
  it("drops accents and joins words with dashes", () => {
    expect(toHeadingId("Café  & Notes!")).toBe("cafe-notes");
  });
});
