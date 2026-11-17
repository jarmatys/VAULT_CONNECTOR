"use server";
// Saves the account's sentence about its vault (FR-17). It checks the session and writes only the signed-in account's
// own row; the MCP server reads it on the next connection.
import { requireUser } from "@softure-ai/auth/next";
import { systemClock } from "@softure-ai/core";
import { redirect } from "next/navigation";
import { getRequestDatabase } from "../../../../auth/module-context.ts";
import { DESCRIPTION_FIELD, toConnectorsResultPath } from "../../../../mcp/connector-paths.ts";
import { saveVaultDescription } from "../../../../mcp/profile/vault-description.ts";
import { CONNECTORS_PATH } from "../../../../panel-paths.ts";

export async function saveVaultDescriptionAction(formData: FormData): Promise<never> {
  const user = await requireUser({ next: CONNECTORS_PATH });
  const value = formData.get(DESCRIPTION_FIELD);
  const saved = await saveVaultDescription(await getRequestDatabase(), {
    userId: user.id,
    description: typeof value === "string" ? value : "",
    now: systemClock.now(),
  });
  redirect(toConnectorsResultPath(saved));
}
