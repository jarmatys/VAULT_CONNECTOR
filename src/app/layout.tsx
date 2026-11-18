import "@softure-ai/ui/styles.css";
// The design-system layer (Tailwind and the Notion theme) after the package sheet, which sets the layer order.
import "./globals.css";

import { buildAiCatalogLink } from "@softure-ai/agent-ready";
import { SoftureThemeProvider, ThemeScript } from "@softure-ai/ui";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteFooter } from "../components/legal-footer.tsx";
import { en } from "../messages/en.ts";
import { readSettings } from "../settings.ts";
// Registers the config for package code during `next build`, which prerenders without instrumentation.ts.
import config from "../../softure.config.ts";

const AI_CATALOG = buildAiCatalogLink();

export const metadata: Metadata = {
  title: en.meta.title,
  description: en.meta.description,
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang={config.locale} suppressHydrationWarning>
      <head>
        <ThemeScript />
        <link rel={AI_CATALOG.rel} href={AI_CATALOG.href} type={AI_CATALOG.type} />
      </head>
      <body>
        <SoftureThemeProvider>
          {children}
          <SiteFooter sourceCodeUrl={readSettings(process.env).sourceCodeUrl} />
        </SoftureThemeProvider>
      </body>
    </html>
  );
}
