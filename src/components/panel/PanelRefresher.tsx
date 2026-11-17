"use client";
// Keeps the overview current while the index is being built (VC-12): it asks the server for the page again every few
// seconds while the tab is visible, and once more when the tab comes back. The page renders it only while it waits.
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** How often the waiting overview is read again. */
export const PANEL_REFRESH_MS = 3000;

export function PanelRefresher({ intervalMs = PANEL_REFRESH_MS }: { readonly intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = setInterval(refreshWhenVisible, intervalMs);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [router, intervalMs]);
  return null;
}
