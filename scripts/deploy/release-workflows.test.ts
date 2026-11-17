// Guards on the release path (VC-4): the workflows that hold production secrets, their pins to SOFTURE/AI, and the
// agreement between the secrets the Worker requires and the secrets the release passes. Text checks, since GitHub reads
// these files as they are.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseJsonc, readRequiredSecrets } from "./wrangler.ts";

const ROOT = join(import.meta.dirname, "../..");
const WORKFLOWS = join(ROOT, ".github/workflows");
const readWorkflow = (name: string): string => readFileSync(join(WORKFLOWS, name), "utf8");
const workflowNames = readdirSync(WORKFLOWS).filter((name) => name.endsWith(".yml"));

/** The commit of SOFTURE/AI's release tag deploy@0.7.1 (git ls-remote https://github.com/SOFTURE/AI 'refs/tags/deploy@0.7.1^{}'). */
const SOFTURE_PIN = "20f608b3fbcaf9ec0baf1006cad6b3efcf068e2d";
const DEPLOY_CLI_VERSION = "0.7.1";

/** The workflows that hold production secrets or write releases. */
const PRODUCTION_WORKFLOWS = ["release.yml", "auto-release.yml", "backup.yml", "backup-verify.yml"];

describe("the release workflows", () => {
  it("exist, deploy from release.yml and cut releases from auto-release.yml", () => {
    expect(workflowNames).toEqual(expect.arrayContaining([...PRODUCTION_WORKFLOWS, "deploy-dry-run.yml"]));
    expect(readWorkflow("auto-release.yml")).toContain("deploy-workflow: release.yml");
    expect(readWorkflow("release.yml")).toMatch(/release:\n\s+types: \[published\]/);
  });

  it("call SOFTURE/AI only at the commit of deploy@0.7.1, never at a moving ref", () => {
    for (const name of workflowNames) {
      for (const match of readWorkflow(name).matchAll(/uses: SOFTURE\/AI\/[^@\s]+@(\S+)/g)) {
        expect(`${name}: ${match[1] ?? ""}`).toBe(`${name}: ${SOFTURE_PIN}`);
      }
    }
  });

  it("verify with the same @softure-ai/deploy version as the pin", () => {
    for (const name of ["release.yml", "deploy-dry-run.yml"]) {
      expect(readWorkflow(name)).toContain(`deploy-cli-version: ${DEPLOY_CLI_VERSION}`);
    }
  });

  it("run every job that holds production secrets on GitHub's runner", () => {
    for (const name of PRODUCTION_WORKFLOWS) {
      const runners = [...readWorkflow(name).matchAll(/runs-on: (.+)/g)].map((match) => match[1]);
      for (const runner of runners) expect(`${name}: ${runner ?? ""}`).toBe(`${name}: ubuntu-latest`);
    }
  });

  it("never hand the whole secrets context over or run a fork's code with secrets", () => {
    for (const name of workflowNames) {
      const text = readWorkflow(name);
      expect(text, name).not.toContain("secrets: inherit");
      expect(text, name).not.toContain("toJSON(secrets)");
      expect(text, name).not.toContain("pull_request_target");
    }
  });

  it("keep the dry run free of secrets and in dry-run mode", () => {
    const dryRun = readWorkflow("deploy-dry-run.yml");
    expect(dryRun).not.toMatch(/\$\{\{\s*secrets\./);
    expect(dryRun).not.toContain("environment: production");
    expect(dryRun).toContain('WRANGLER_DRY_RUN: "1"');
    expect(dryRun).toContain("wrangler: node scripts/deploy/wrangler.ts");
  });

  it("deploy the production configuration of wrangler.jsonc through the wrapper, in the production environment", () => {
    const release = readWorkflow("release.yml");
    expect(release).toContain("environment: production");
    expect(release).toContain("wrangler: node scripts/deploy/wrangler.ts");
    expect(release).toContain("wrangler-env: production");
    expect(release).toContain("build-command: npm run build:cloudflare");
    expect(release).toContain("APP_DOMAIN: ${{ vars.APP_DOMAIN }}");
    expect(release).toContain("HYPERDRIVE_ID: ${{ vars.HYPERDRIVE_ID }}");
  });

  it("pass every secret the Worker requires by name, in env and in secret-names, and no other", () => {
    const required = readRequiredSecrets(parseJsonc(readFileSync(join(ROOT, "wrangler.jsonc"), "utf8")), "production");
    const release = readWorkflow("release.yml");
    const listed = (/secret-names: "?([^"\n]*)"?/.exec(release)?.[1] ?? "").split(/\s+/).filter((name) => name !== "");
    expect([...listed].sort()).toEqual([...required].sort());
    for (const name of required) expect(release).toContain(`${name}: \${{ secrets.${name} }}`);
  });

  it("skip the scheduled backups until the owner marks production live", () => {
    for (const name of ["backup.yml", "backup-verify.yml"]) {
      expect(readWorkflow(name)).toContain("if: ${{ github.event_name == 'workflow_dispatch' || vars.PRODUCTION_LIVE == 'true' }}");
    }
  });
});

describe("wrangler.jsonc", () => {
  const text = readFileSync(join(ROOT, "wrangler.jsonc"), "utf8");

  it("names no domain and no Hyperdrive id of the hosted instance, only placeholders", () => {
    const production = (parseJsonc(text) as { env: { production: Record<string, unknown> } }).env.production;
    expect(production.routes).toEqual([{ pattern: "__APP_DOMAIN__", custom_domain: true }]);
    expect(production.hyperdrive).toEqual([{ binding: "HYPERDRIVE", id: "__HYPERDRIVE_ID__" }]);
    expect(production.workers_dev).toBe(false);
    expect(production.name).toBe("vaultconnector");
  });
});
