import { PageFrame } from "@softure-ai/theme-notion";
import type { ReactNode } from "react";

// The auth module's pages (sign-in, registration, password reset) take the Notion tokens through the frame's
// `--sft-*` bridge, on the theme's background (DESIGN.md, "Package pages").
export default function AuthPagesLayout({ children }: { readonly children: ReactNode }) {
  return <PageFrame>{children}</PageFrame>;
}
