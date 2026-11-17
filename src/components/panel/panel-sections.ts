// The panel's sections as the sidebar lists them, in order. A new panel screen adds its row here and its label to
// `en.panelShell.sections`; the sidebar marks the row whose path is the longest prefix of the current one.
import { ACCOUNT_PATH, BILLING_PATH, CONNECTORS_PATH, PANEL_PATH, STATUS_PATH } from "../../panel-paths.ts";
import { FOLDERS_PATH } from "../../vault/folders/folder-paths.ts";
import { SOURCE_PATH } from "../../vault/sources/source-paths.ts";

export type PanelSectionId = "overview" | "source" | "folders" | "connectors" | "status" | "billing" | "account" | "password";

export interface PanelSection {
  readonly id: PanelSectionId;
  readonly href: string;
}

export const PANEL_SECTIONS: readonly PanelSection[] = [
  { id: "overview", href: PANEL_PATH },
  { id: "source", href: SOURCE_PATH },
  { id: "folders", href: FOLDERS_PATH },
  { id: "connectors", href: CONNECTORS_PATH },
  { id: "status", href: STATUS_PATH },
  { id: "billing", href: BILLING_PATH },
  { id: "account", href: ACCOUNT_PATH },
  { id: "password", href: `${PANEL_PATH}/password` },
];

/** The sections an instance shows: the plan screen only where accounts pay (not with `PLAN_LIMITS=unlimited`). */
export function getPanelSections(hasPayment: boolean): readonly PanelSection[] {
  return hasPayment ? PANEL_SECTIONS : PANEL_SECTIONS.filter(({ id }) => id !== "billing");
}

/** The section a path belongs to: the one with the longest matching path, `null` outside the panel. */
export function findCurrentSection(pathname: string, sections: readonly PanelSection[] = PANEL_SECTIONS): PanelSectionId | null {
  const matches = sections.filter(({ href }) => pathname === href || pathname.startsWith(`${href}/`));
  const longest = matches.reduce<PanelSection | null>((best, section) => (best === null || section.href.length > best.href.length ? section : best), null);
  return longest?.id ?? null;
}
