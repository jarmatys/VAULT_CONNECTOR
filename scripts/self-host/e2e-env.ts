// The environment of the e2e run against the self-hosted stack (.github/workflows/self-host.yml): writes the stack's
// .env file from the same test values the other e2e runs use (e2e/services.ts, e2e/support.ts), so the app in the
// containers and the fake services the runner starts agree on the GitHub App's key, the S3 source and the mail outbox.
// Usage: `node scripts/self-host/e2e-env.ts <stack env file> [<runner env file>]`; the runner file (GITHUB_ENV in CI)
// gets the run's GitHub App key and the database URL the tests read, as KEY=value lines.
import { execFileSync } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
import { FAKE_SERVICES_ORIGIN, GITHUB_TEST_ENV, MAIL_OUTBOX_URL, S3_TEST_ENV } from "../../e2e/services.ts";
import { APP_TEST_ENV } from "../../e2e/support.ts";
import { buildE2eStackEnv, formatEnvFile } from "./e2e-stack-env.ts";

const [stackFile, runnerFile] = process.argv.slice(2);
if (stackFile === undefined) {
  console.error("e2e-env: usage: node scripts/self-host/e2e-env.ts <stack env file> [<runner env file>]");
  process.exit(2);
}

const port = Number(process.env.E2E_PORT ?? 3100);
// The checked-out commit; GITHUB_SHA on a pull request names the merge commit Actions checks out, the same as HEAD.
const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const stack = buildE2eStackEnv({
  port,
  fakeServicesOrigin: FAKE_SERVICES_ORIGIN,
  mailOutboxUrl: MAIL_OUTBOX_URL,
  commit,
  testEnv: { ...APP_TEST_ENV, ...GITHUB_TEST_ENV, ...S3_TEST_ENV },
});
writeFileSync(stackFile, formatEnvFile(stack), { mode: 0o600 });

if (runnerFile !== undefined) {
  const key = process.env.E2E_GH_APP_PRIVATE_KEY ?? "";
  const databaseUrl = `postgresql://postgres:${stack.POSTGRES_PASSWORD}@localhost:5432/vaultconnector`;
  appendFileSync(runnerFile, `E2E_GH_APP_PRIVATE_KEY=${key}\nDATABASE_URL=${databaseUrl}\n`);
}
console.log(`e2e-env: wrote ${String(Object.keys(stack).length)} values to ${stackFile}`);
