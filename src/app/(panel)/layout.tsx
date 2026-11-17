// The signed-in panel's frame. proxy.ts sends a visitor without a session cookie to the login page; requireUser checks
// the session itself before anything renders, so an expired or forged cookie gets the same redirect.
import { LogoutButton, requireUser } from "@softure-ai/auth/next";
import { THEME_SWITCH_LOOK } from "@softure-ai/theme-flat-paint";
import { ThemeSwitch } from "@softure-ai/ui";
import type { ReactNode } from "react";
import { en } from "../../messages/en.ts";
import { PANEL_PATH } from "../../panel-paths.ts";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { readonly children: ReactNode }) {
  const user = await requireUser({ next: PANEL_PATH });
  return (
    <div className="mx-auto grid max-w-measure gap-6 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label={en.panel.nav}>
          <a href={PANEL_PATH} className="text-subsection">
            {en.meta.title}
          </a>
        </nav>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-body-sm text-muted" data-testid="panel-account">
            {en.panel.signedInAs} <span className="text-foreground">{user.displayName ?? user.email}</span>
          </p>
          <LogoutButton />
          <ThemeSwitch unstyled classNames={THEME_SWITCH_LOOK} />
        </div>
      </header>
      {children}
    </div>
  );
}
