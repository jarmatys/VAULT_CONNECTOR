// The signed-in panel's frame: the Notion app shell (DESIGN.md, "Panel"), a sidebar with the product's name, the
// sections and the account at its foot, and the screen beside it in the content column; on a phone a bar on top with
// the button that opens the sidebar as a sheet. proxy.ts sends a visitor without a session cookie to the login page;
// requireUser checks the session itself before anything renders, so an expired or forged cookie gets the same redirect.
import { LogoutButton, requireUser } from "@softure-ai/auth/next";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@softure-ai/theme-notion";
import { ThemeSwitch } from "@softure-ai/ui";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { PanelNav } from "../../components/panel/PanelNav.tsx";
import { en } from "../../messages/en.ts";
import { PANEL_PATH } from "../../panel-paths.ts";

export const dynamic = "force-dynamic";

// The design system's sidebar width (`sidebar-width`, 240 px) on the provider, as the theme's Sidebar asks.
const SIDEBAR_STYLE = { "--sidebar-width": "calc(var(--spacing) * 60)" } as CSSProperties;

const copy = en.panelShell;

export default async function PanelLayout({ children }: { readonly children: ReactNode }) {
  const user = await requireUser({ next: PANEL_PATH });
  return (
    <SidebarProvider style={SIDEBAR_STYLE} className="bg-background font-sans text-foreground">
      <Sidebar mobileTitle={copy.menuTitle} mobileDescription={copy.menuDescription}>
        <SidebarHeader>
          <Link href={PANEL_PATH} className="flex items-center gap-2 rounded-md px-2 py-1 text-ui font-medium hover:bg-accent">
            <span aria-hidden className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-foreground text-small font-semibold text-background">
              V
            </span>
            <span>{copy.brand}</span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup className="py-1">
            <PanelNav />
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="grid gap-2">
          <p className="truncate px-2 text-small text-muted-foreground" data-testid="panel-account">
            {en.panel.signedInAs} <span className="text-foreground">{user.displayName ?? user.email}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2 px-2">
            <LogoutButton variant="ghost" />
            <ThemeSwitch />
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0">
        <header className="flex items-center gap-2 border-b border-border px-2 py-1 md:hidden">
          <SidebarTrigger label={copy.openMenu} />
          <span className="text-ui font-medium">{copy.brand}</span>
        </header>
        <div data-slot="panel-content" className="mx-auto w-full max-w-content-width px-4 py-8 md:px-12 md:py-12">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
