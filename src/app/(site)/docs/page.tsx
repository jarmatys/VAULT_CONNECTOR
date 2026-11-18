import { Card, CardDescription, CardHeader, CardTitle, PageHeader } from "@softure-ai/theme-notion";
import type { Metadata } from "next";
import { DOCS_PATH } from "../../../docs/docs-content.ts";
import { loadDocPages } from "../../../docs/load-docs.ts";
import { en } from "../../../messages/en.ts";

export const metadata: Metadata = {
  title: `${en.docs.title} · ${en.meta.title}`,
  description: en.docs.description,
};

export const dynamic = "force-static";

// The docs' home: every page with its description.
export default function DocsHome() {
  const pages = loadDocPages();
  return (
    <main className="grid gap-8">
      <PageHeader title={en.docs.title} description={en.docs.description} crumbs={[{ label: en.docs.home, href: "/" }, { label: en.docs.title }]} />
      <ul className="grid gap-3">
        {pages.map((page) => (
          <li key={page.slug}>
            <a href={`${DOCS_PATH}/${page.slug}`} className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Card className="transition-colors hover:bg-accent">
                <CardHeader>
                  <CardTitle className="text-heading-3">{page.title}</CardTitle>
                  <CardDescription>{page.description}</CardDescription>
                </CardHeader>
              </Card>
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
