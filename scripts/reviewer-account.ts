// The directory reviewer's account, for the operator (VC-17): `npm run reviewer -- --email=<address> [--days=<n>]`
// creates it against the fixture bucket of the REVIEWER_VAULT_* variables and prints the sign-in once;
// `npm run reviewer -- --remove --email=<address>` erases it. It connects with DATABASE_URL, as the app does.
import { systemClock } from "@softure-ai/core";
import { createDatabase } from "@softure-ai/db";
import config from "../softure.config.ts";
import { createReviewerAccount, removeReviewerAccount } from "../src/reviewer/reviewer-account.ts";
import { parseReviewerArgs, readReviewerVault, REVIEWER_USAGE } from "../src/reviewer/reviewer-command.ts";
import { readS3SourceSettings } from "../src/vault/settings.ts";

async function main(): Promise<number> {
  const command = parseReviewerArgs(process.argv.slice(2));
  if (command === null) {
    console.error(REVIEWER_USAGE);
    return 2;
  }
  if (config.database === null) throw new Error("reviewer-account: softure.config.ts has no database");
  const database = await createDatabase(config.database.url, { max: 1 });
  try {
    const ctx = { db: database.db, clock: systemClock, config };
    if (command.kind === "remove") {
      const removed = await removeReviewerAccount(ctx, command.email);
      if (!removed.ok) {
        console.error(`reviewer-account: removing ${command.email} failed: ${removed.error}`);
        return 1;
      }
      console.log(`Removed the reviewer account ${command.email}.`);
      return 0;
    }
    const vault = readReviewerVault(process.env);
    if (!vault.ok) {
      console.error(`reviewer-account: set ${vault.missing.join(", ")} (the read-only bucket with the fixture vault)`);
      return 2;
    }
    const created = await createReviewerAccount({ ...ctx, s3: readS3SourceSettings(process.env) }, { email: command.email, days: command.days, vault: vault.value });
    if (!created.ok) {
      console.error(`reviewer-account: creating ${command.email} failed: ${created.error}`);
      return 1;
    }
    console.log(
      [
        "Reviewer account ready. Hand these to the directory's reviewer; they are not shown again.",
        `  Email:        ${created.value.email}`,
        `  Password:     ${created.value.password}`,
        `  Access until: ${created.value.accessEndsAt.toISOString()}`,
        `  Shared:       ${created.value.sharedFolders.join(", ")}`,
        "The first sync is queued; the worker copies the notes within a minute or two.",
      ].join("\n"),
    );
    return 0;
  } finally {
    await database.close();
  }
}

process.exitCode = await main();
