import { SoftureThemeProvider, ThemeScript } from "@softure-ai/ui";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { en } from "../messages/en.ts";
// Registers the config for package code during `next build`, which prerenders without instrumentation.ts.
import config from "../../softure.config.ts";
import "./globals.css";

export const metadata: Metadata = {
  title: en.meta.title,
  description: en.meta.description,
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang={config.locale} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <SoftureThemeProvider>{children}</SoftureThemeProvider>
      </body>
    </html>
  );
}
