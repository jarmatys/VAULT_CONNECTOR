// Where the signed-in panel lives. Every panel screen sits under this prefix (`src/app/(panel)/panel/**`), so the
// proxy's guard and the panel layout cover it without a list of routes.
export const PANEL_PATH = "/panel";

/** The status screen: the copy and the search index of the shared notes. */
export const STATUS_PATH = `${PANEL_PATH}/status`;
