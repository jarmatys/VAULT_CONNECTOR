// Where the signed-in panel lives. Every panel screen sits under this prefix (`src/app/(panel)/panel/**`), so the
// proxy's guard and the panel layout cover it without a list of routes.
export const PANEL_PATH = "/panel";
/** The "Connect Claude" screen: the connector URL, the account's sentence, connected apps and tokens (VC-9). */
export const CONNECTORS_PATH = `${PANEL_PATH}/connectors`;
