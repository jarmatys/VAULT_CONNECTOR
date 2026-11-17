// The connector's part of an account's export and deletion (FR-20): the account's sentence about its vault.
import { ok, type ModuleContext, type Result } from "@softure-ai/core";
import type { Queryable } from "@softure-ai/db";
import { sql } from "drizzle-orm";

export interface ConnectorUserData {
  readonly vaultDescription: string | null;
  readonly updatedAt: string | null;
}

export async function exportConnectorUserData(context: ModuleContext, userId: string): Promise<Result<ConnectorUserData>> {
  const result = await (context.db as Queryable).execute<{ vault_description: string; updated_at: string | Date }>(sql`
    SELECT vault_description, updated_at FROM connector.profiles WHERE user_id = ${userId}`);
  const row = result.rows[0];
  if (row === undefined) return ok({ vaultDescription: null, updatedAt: null });
  const updatedAt = row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at);
  return ok({ vaultDescription: row.vault_description, updatedAt: updatedAt.toISOString() });
}

export async function deleteConnectorUserData(context: ModuleContext, userId: string): Promise<Result<undefined>> {
  await (context.db as Queryable).execute(sql`DELETE FROM connector.profiles WHERE user_id = ${userId}`);
  return ok();
}
