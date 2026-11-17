// Where the signed-in panel lives. Every panel screen sits under this prefix (`src/app/(panel)/panel/**`), so the
// proxy's guard and the panel layout cover it without a list of routes.
export const PANEL_PATH = "/panel";

// The operator's pages (`src/app/(admin)/admin/**`): the jobs' health and the recent alerts, for the `admin` role only.
export const ADMIN_PATH = "/admin";
