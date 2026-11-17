"use client";
// The panel's sections in the sidebar, the current one marked. A client component because the mark follows the
// address; choosing a section also closes the phone's sheet.
import { ICON_STROKE_WIDTH, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@softure-ai/theme-notion";
import { FolderGit2Icon, KeyRoundIcon, LayoutDashboardIcon, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { en } from "../../messages/en.ts";
import { findCurrentSection, PANEL_SECTIONS, type PanelSectionId } from "./panel-sections.ts";

const SECTION_ICONS: Record<PanelSectionId, LucideIcon> = {
  overview: LayoutDashboardIcon,
  source: FolderGit2Icon,
  password: KeyRoundIcon,
};

export function PanelNav() {
  const current = findCurrentSection(usePathname());
  const { setOpenMobile } = useSidebar();
  return (
    <nav aria-label={en.panel.nav}>
      <SidebarMenu>
        {PANEL_SECTIONS.map(({ id, href }) => {
          const Icon = SECTION_ICONS[id];
          const isCurrent = id === current;
          return (
            <SidebarMenuItem key={id}>
              <SidebarMenuButton asChild isActive={isCurrent}>
                <Link
                  href={href}
                  aria-current={isCurrent ? "page" : undefined}
                  onClick={() => {
                    setOpenMobile(false);
                  }}
                >
                  <Icon aria-hidden strokeWidth={ICON_STROKE_WIDTH} />
                  <span>{en.panelShell.sections[id]}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </nav>
  );
}
