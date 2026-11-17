"use server";
// The overview's own save (VC-12): the account's sentence about its vault from the guided setup's "Add to Claude" step.
// The same check and write as the "Connect Claude" screen's, back to the overview with its result.
import { requireUser } from "@softure-ai/auth/next";
import { systemClock } from "@softure-ai/core";
import { redirect } from "next/navigation";
import { getRequestDatabase } from "../../../auth/module-context.ts";
import { DESCRIPTION_FIELD, toDescriptionResultPath } from "../../../mcp/connector-paths.ts";
import { saveVaultDescription } from "../../../mcp/profile/vault-description.ts";
import { PANEL_PATH } from "../../../panel-paths.ts";

export async function saveOnboardingDescriptionAction(formData: FormData): Promise<never> {
  const user = await requireUser({ next: PANEL_PATH });
  const value = formData.get(DESCRIPTION_FIELD);
  const saved = await saveVaultDescription(await getRequestDatabase(), {
    userId: user.id,
    description: typeof value === "string" ? value : "",
    now: systemClock.now(),
  });
  redirect(toDescriptionResultPath(PANEL_PATH, saved));
}
