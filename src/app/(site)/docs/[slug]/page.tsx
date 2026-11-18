import { PageHeader, Prose } from "@softure-ai/theme-notion";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DOCS_PATH, renderDocBody } from "../../../../docs/docs-content.ts";
import { getDocPage, getDocPages } from "../../../../docs/doc-pages.ts";
import { en } from "../../../../messages/en.ts";

interface DocPageProps {
  readonly params: Promise<{ readonly slug: string }>;
}

// Every page is prerendered from content/docs; any other slug is a 404.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams(): { slug: string }[] {
  return getDocPages().map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: DocPageProps): Promise<Metadata> {
  const page = getDocPage((await params).slug);
  return page === null ? {} : { title: `${page.title} · ${en.meta.title}`, description: page.description };
}

// One documentation page: its title and description, then its Markdown in the theme's long-read styles. The HTML comes
// only from the repository's own files (raw HTML in them is escaped).
export default async function DocPageView({ params }: DocPageProps) {
  const page = getDocPage((await params).slug);
  if (page === null) notFound();
  return (
    <main className="grid gap-6">
      <PageHeader
        title={page.title}
        description={page.description}
        crumbs={[{ label: en.docs.home, href: "/" }, { label: en.docs.title, href: DOCS_PATH }, { label: page.title }]}
      />
      <Prose asChild>
        <article dangerouslySetInnerHTML={{ __html: renderDocBody(page.body) }} />
      </Prose>
    </main>
  );
}
