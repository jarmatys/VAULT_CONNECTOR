import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  dropFlag,
  findMissingSecrets,
  parseJsonc,
  planWranglerCall,
  readDeployValues,
  readFlag,
  readRequiredSecrets,
  renderDeployConfig,
  type DeployValues,
  type PlanOptions,
} from "./wrangler.ts";

const ROOT = join(import.meta.dirname, "../..");
const WRANGLER_JSONC = readFileSync(join(ROOT, "wrangler.jsonc"), "utf8");
const VALUES: DeployValues = { domain: "app.example.com", hyperdriveId: "0123456789abcdef0123456789abcdef" };

function plan(overrides: Partial<PlanOptions>): ReturnType<typeof planWranglerCall> {
  return planWranglerCall({
    args: ["deploy", "--secrets-file", "/tmp/secrets.json", "--message", "v2026.11.17 (abc)", "--env", "production"],
    configPath: "/app/.wrangler.deploy.jsonc",
    dryRun: false,
    outdir: "/tmp/out",
    config: { env: { production: { secrets: { required: ["SESSION_SECRET"] } } } },
    readSecretsFile: () => JSON.stringify({ SESSION_SECRET: "s3cret" }),
    ...overrides,
  });
}

describe("readDeployValues", () => {
  it("reads a bare host and a 32-hex Hyperdrive id, trimmed", () => {
    expect(readDeployValues({ APP_DOMAIN: " app.example.com ", HYPERDRIVE_ID: "0123456789abcdef0123456789abcdef\n" })).toEqual({
      ok: true,
      value: VALUES,
    });
  });

  it("refuses an unset domain and id, naming both", () => {
    const result = readDeployValues({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('APP_DOMAIN "" is not a bare host name');
    expect(result.error).toContain("HYPERDRIVE_ID is not a Hyperdrive configuration id");
  });

  it("refuses a domain with a scheme, a path, a port or capitals, which wrangler would take as a route", () => {
    for (const domain of ["https://app.example.com", "app.example.com/", "app.example.com:443", "App.example.com", "localhost"]) {
      expect(readDeployValues({ APP_DOMAIN: domain, HYPERDRIVE_ID: VALUES.hyperdriveId }).ok).toBe(false);
    }
  });

  it("refuses an id of the wrong length or with capitals", () => {
    for (const id of ["0123456789abcdef", "0123456789ABCDEF0123456789ABCDEF", `${VALUES.hyperdriveId}0`]) {
      expect(readDeployValues({ APP_DOMAIN: VALUES.domain, HYPERDRIVE_ID: id }).ok).toBe(false);
    }
  });
});

describe("renderDeployConfig", () => {
  it("fills the domain into the route and the origin, and the id into Hyperdrive, of the committed wrangler.jsonc", () => {
    const rendered = renderDeployConfig(WRANGLER_JSONC, VALUES);
    expect(rendered.ok).toBe(true);
    if (!rendered.ok) return;
    const production = (parseJsonc(rendered.value) as { env: { production: Record<string, unknown> } }).env.production;
    expect(production.routes).toEqual([{ pattern: "app.example.com", custom_domain: true }]);
    expect(production.vars).toEqual({
      SOFTURE_HOST: "cloudflare",
      APP_ORIGIN: "https://app.example.com",
      OTEL_RESOURCE_ATTRIBUTES: "deployment.environment.name=production",
    });
    expect(production.hyperdrive).toEqual([{ binding: "HYPERDRIVE", id: "0123456789abcdef0123456789abcdef" }]);
  });

  it("refuses a config holding a placeholder nothing fills", () => {
    expect(renderDeployConfig('{ "vars": { "X": "__MAIL_DOMAIN__" } }', VALUES)).toEqual({
      ok: false,
      error: "wrangler.jsonc holds the placeholder __MAIL_DOMAIN__, which nothing fills",
    });
  });
});

describe("parseJsonc", () => {
  it("drops line and block comments outside strings and keeps slashes inside them", () => {
    const text = '// head\n{ /* a */ "url": "https://x.example//y", "q": "a \\" // b" // tail\n}';
    expect(parseJsonc(text)).toEqual({ url: "https://x.example//y", q: 'a " // b' });
  });

  it("throws on an unterminated string or block comment", () => {
    expect(() => parseJsonc('{ "a": "b }')).toThrow("unterminated string");
    expect(() => parseJsonc("{ /* a }")).toThrow("unterminated block comment");
  });
});

describe("readRequiredSecrets and findMissingSecrets", () => {
  const config = { secrets: { required: ["TOP"] }, env: { production: { secrets: { required: ["A", "B", 3] } } } };

  it("reads the environment's list, or the top level's without --env", () => {
    expect(readRequiredSecrets(config, "production")).toEqual(["A", "B"]);
    expect(readRequiredSecrets(config, undefined)).toEqual(["TOP"]);
    expect(readRequiredSecrets(config, "staging")).toEqual([]);
  });

  it("names the required secrets that are missing or empty in the file", () => {
    expect(findMissingSecrets(["A", "B", "C"], JSON.stringify({ A: "x", B: "" }))).toEqual(["B", "C"]);
    expect(findMissingSecrets([], "{}")).toEqual([]);
  });

  it("requires the mail, unsubscribe, GitHub sign-in, GitHub App, operator, vault sync and operator alert secrets in the committed production config", () => {
    expect(readRequiredSecrets(parseJsonc(WRANGLER_JSONC), "production")).toEqual([
      "RESEND_API_KEY",
      "MAIL_FROM",
      "MAILING_UNSUBSCRIBE_SECRET",
      "GH_AUTH_CLIENT_ID",
      "GH_AUTH_CLIENT_SECRET",
      "GH_APP_ID",
      "GH_APP_SLUG",
      "GH_APP_PRIVATE_KEY",
      "OPERATOR_NAME",
      "OPERATOR_CONTACT",
      "VAULT_S3_ENDPOINT",
      "VAULT_S3_BUCKET",
      "VAULT_S3_ACCESS_KEY_ID",
      "VAULT_S3_SECRET_ACCESS_KEY",
      "VAULT_STORAGE_KEY_SECRET",
      "GH_WEBHOOK_SECRET",
      "VAULT_SOURCE_KEYS",
      "DROPBOX_APP_KEY",
      "DROPBOX_APP_SECRET",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "ALERTS_MAIL_TO",
      "ADMIN_EMAILS",
      "OTEL_EXPORTER_OTLP_ENDPOINT",
      "OTEL_EXPORTER_OTLP_HEADERS",
    ]);
  });
});

describe("readFlag and dropFlag", () => {
  it("reads and drops a flag in both spellings", () => {
    expect(readFlag(["deploy", "--env", "production"], "--env")).toBe("production");
    expect(readFlag(["deploy", "--env=production"], "--env")).toBe("production");
    expect(readFlag(["deploy"], "--env")).toBeUndefined();
    expect(dropFlag(["deploy", "--message", "a b", "--env=x", "--message=c"], "--message")).toEqual(["deploy", "--env=x"]);
  });
});

describe("planWranglerCall", () => {
  it("runs the action's call unchanged on the rendered config", () => {
    expect(plan({})).toEqual({
      kind: "run",
      args: [
        "deploy",
        "--secrets-file",
        "/tmp/secrets.json",
        "--message",
        "v2026.11.17 (abc)",
        "--env",
        "production",
        "--config",
        "/app/.wrangler.deploy.jsonc",
      ],
      dryRunDeploy: false,
    });
    expect(plan({ args: ["rollback", "--message", "verify failed", "--env", "production"] })).toEqual({
      kind: "run",
      args: ["rollback", "--message", "verify failed", "--env", "production", "--config", "/app/.wrangler.deploy.jsonc"],
      dryRunDeploy: false,
    });
  });

  it("refuses a --config of its own, which would bypass the rendered values", () => {
    expect(plan({ args: ["deploy", "--config", "wrangler.jsonc"] }).kind).toBe("refuse");
    expect(plan({ args: ["deploy", "-c", "wrangler.jsonc"] }).kind).toBe("refuse");
  });

  it("bundles a dry-run deploy without uploading the secrets or the message", () => {
    expect(plan({ dryRun: true })).toEqual({
      kind: "run",
      args: ["deploy", "--env", "production", "--config", "/app/.wrangler.deploy.jsonc", "--dry-run", "--outdir", "/tmp/out"],
      dryRunDeploy: true,
    });
  });

  it("fails a dry-run deploy whose secrets file misses a required secret, as a real deploy would", () => {
    expect(plan({ dryRun: true, readSecretsFile: () => "{}" })).toEqual({
      kind: "refuse",
      error: "dry run: the secrets file misses SESSION_SECRET, which secrets.required lists",
    });
    expect(plan({ dryRun: true, args: ["deploy", "--env", "production"] })).toEqual({
      kind: "refuse",
      error: "dry run: no --secrets-file, but secrets.required lists SESSION_SECRET",
    });
  });

  it("only prints a dry-run rollback and refuses any other dry-run command", () => {
    expect(plan({ dryRun: true, args: ["rollback", "--env", "production"] })).toEqual({
      kind: "print",
      line: "dry run: would run wrangler rollback --env production on /app/.wrangler.deploy.jsonc",
    });
    expect(plan({ dryRun: true, args: ["secret", "put", "X"] }).kind).toBe("refuse");
  });
});
