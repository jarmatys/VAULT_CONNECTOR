// The sentence an account writes about what its vault holds (FR-17): at most 300 characters, empty allowed (no row).
// Every read and write names the account.
import { err, ok, type Result } from "@softure-ai/core";
import type { Queryable } from "@softure-ai/db";
import { sql } from "drizzle-orm";

export const MAX_VAULT_DESCRIPTION_LENGTH = 300;

export type VaultDescriptionErrorCode = "connector.description_too_long";

/** The account's sentence, or an empty string when it wrote none. */
export async function getVaultDescription(db: Queryable, userId: string): Promise<string> {
  const result = await db.execute<{ vault_description: string }>(sql`
    SELECT vault_description FROM connector.profiles WHERE user_id = ${userId}`);
  return result.rows[0]?.vault_description ?? "";
}

/** Saves the sentence, trimmed with its whitespace collapsed; an empty one removes the row. */
export async function saveVaultDescription(
  db: Queryable,
  input: { readonly userId: string; readonly description: string; readonly now: Date },
): Promise<Result<string, VaultDescriptionErrorCode>> {
  const description = normalizeVaultDescription(input.description);
  if ([...description].length > MAX_VAULT_DESCRIPTION_LENGTH) return err("connector.description_too_long");
  if (description === "") {
    await db.execute(sql`DELETE FROM connector.profiles WHERE user_id = ${input.userId}`);
    return ok("");
  }
  await db.execute(sql`
    INSERT INTO connector.profiles (user_id, vault_description, updated_at)
    VALUES (${input.userId}, ${description}, ${input.now.toISOString()})
    ON CONFLICT (user_id) DO UPDATE SET vault_description = EXCLUDED.vault_description, updated_at = EXCLUDED.updated_at`);
  return ok(description);
}

/** One line: control characters and runs of whitespace become one space, the ends trimmed. */
export function normalizeVaultDescription(text: string): string {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is removed
  return text.replace(/[\u0000-\u001f\u007f\s]+/g, " ").trim();
}
