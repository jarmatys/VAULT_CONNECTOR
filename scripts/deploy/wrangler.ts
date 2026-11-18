// The `wrangler` a release runs (SOFTURE/AI's deploy-cloudflare action takes it as its `wrangler` input:
// `node scripts/deploy/wrangler.ts`). The repository is public, so wrangler.jsonc names neither the domain nor the
// Hyperdrive configuration: this wrapper fills APP_DOMAIN and HYPERDRIVE_ID from the environment into a copy of
// wrangler.jsonc (`.wrangler.deploy.jsonc`, ignored by git) and runs wrangler with that copy.
//
// With WRANGLER_DRY_RUN=1 nothing reaches Cloudflare (the Workers job of .github/workflows/e2e.yml): `deploy` checks that the
// secrets file holds every name `secrets.required` asks for (a dry run of wrangler does not) and bundles the Worker
// with `--dry-run`; `rollback` only says what it would do.
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The placeholders wrangler.jsonc holds for the values the public repository does not. */
export const PLACEHOLDERS = { domain: "__APP_DOMAIN__", hyperdriveId: "__HYPERDRIVE_ID__" } as const;

/** The copy of wrangler.jsonc with the values filled in, next to it so its relative paths still resolve. */
export const RENDERED_CONFIG = ".wrangler.deploy.jsonc";

/** The Worker version id a dry run reports, since nothing is uploaded. */
export const DRY_RUN_VERSION_ID = "dry-run";

const HOST_PATTERN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;
const HYPERDRIVE_ID_PATTERN = /^[0-9a-f]{32}$/;

export interface DeployValues {
  readonly domain: string;
  readonly hyperdriveId: string;
}

export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

type Environment = Readonly<Record<string, string | undefined>>;

/** APP_DOMAIN (a bare host such as app.example.com) and HYPERDRIVE_ID (32 hex characters) from the environment. */
export function readDeployValues(env: Environment): Result<DeployValues> {
  const domain = env.APP_DOMAIN?.trim() ?? "";
  const hyperdriveId = env.HYPERDRIVE_ID?.trim() ?? "";
  const problems: string[] = [];
  if (!HOST_PATTERN.test(domain)) {
    problems.push(`APP_DOMAIN "${domain}" is not a bare host name such as app.example.com: set the variable in the production environment`);
  }
  if (!HYPERDRIVE_ID_PATTERN.test(hyperdriveId)) {
    problems.push("HYPERDRIVE_ID is not a Hyperdrive configuration id (32 hex characters): set the variable in the production environment");
  }
  if (problems.length > 0) return { ok: false, error: problems.join("; ") };
  return { ok: true, value: { domain, hyperdriveId } };
}

/** wrangler.jsonc with every placeholder replaced; refuses a text that still holds a `__NAME__` placeholder after. */
export function renderDeployConfig(text: string, values: DeployValues): Result<string> {
  const rendered = text.replaceAll(PLACEHOLDERS.domain, values.domain).replaceAll(PLACEHOLDERS.hyperdriveId, values.hyperdriveId);
  const left = rendered.match(/__[A-Z][A-Z0-9_]*__/);
  if (left) return { ok: false, error: `wrangler.jsonc holds the placeholder ${left[0]}, which nothing fills` };
  return { ok: true, value: rendered };
}

/** JSON with comments, as wrangler reads it: `//` and block comments outside strings are dropped. */
export function parseJsonc(text: string): unknown {
  let json = "";
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"') {
      const end = findStringEnd(text, index);
      json += text.slice(index, end);
      index = end;
    } else if (char === "/" && next === "/") {
      const end = text.indexOf("\n", index);
      index = end === -1 ? text.length : end;
    } else if (char === "/" && next === "*") {
      const end = text.indexOf("*/", index + 2);
      if (end === -1) throw new Error("parseJsonc: an unterminated block comment");
      index = end + 2;
    } else {
      json += char;
      index += 1;
    }
  }
  return JSON.parse(json) as unknown;
}

/** The index just past the closing quote of the string that opens at `start`. */
function findStringEnd(text: string, start: number): number {
  let index = start + 1;
  while (index < text.length) {
    if (text[index] === "\\") index += 2;
    else if (text[index] === '"') return index + 1;
    else index += 1;
  }
  throw new Error("parseJsonc: an unterminated string");
}

/** The secret names `secrets.required` lists, for one wrangler environment (`--env`) or the top level. */
export function readRequiredSecrets(config: unknown, environment: string | undefined): readonly string[] {
  const root = asRecord(config);
  const scope = environment === undefined ? root : asRecord(asRecord(root.env)[environment]);
  const required = asRecord(scope.secrets).required;
  if (!Array.isArray(required)) return [];
  return required.filter((name): name is string => typeof name === "string");
}

/** The required names the secrets file (wrangler's JSON form) has no non-empty value for. */
export function findMissingSecrets(required: readonly string[], secretsFileText: string): readonly string[] {
  const secrets = asRecord(JSON.parse(secretsFileText) as unknown);
  return required.filter((name) => {
    const value = secrets[name];
    return typeof value !== "string" || value === "";
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** The value after `flag` in wrangler's arguments (`--env production` or `--env=production`). */
export function readFlag(args: readonly string[], flag: string): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === flag) return args[index + 1];
    if (arg?.startsWith(`${flag}=`)) return arg.slice(flag.length + 1);
  }
  return undefined;
}

/** The arguments without `flag` and its value. */
export function dropFlag(args: readonly string[], flag: string): string[] {
  const kept: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (arg === flag) index += 1;
    else if (!arg.startsWith(`${flag}=`)) kept.push(arg);
  }
  return kept;
}

/** What one call of the wrapper does: run wrangler with these arguments, or only print a line. */
export type WranglerPlan =
  | { readonly kind: "run"; readonly args: readonly string[]; readonly dryRunDeploy: boolean }
  | { readonly kind: "print"; readonly line: string }
  | { readonly kind: "refuse"; readonly error: string };

export interface PlanOptions {
  readonly args: readonly string[];
  readonly configPath: string;
  readonly dryRun: boolean;
  /** The bundle's directory of a dry run. */
  readonly outdir: string;
  /** The rendered config, parsed: what `secrets.required` asks for. */
  readonly config: unknown;
  /** Reads the secrets file `deploy --secrets-file` names. */
  readonly readSecretsFile: (path: string) => string;
}

/** Turns the action's call (`deploy …` or `rollback …`) into the wrangler call on the rendered config. */
export function planWranglerCall(options: PlanOptions): WranglerPlan {
  const { args, configPath, dryRun } = options;
  const command = args[0];
  if (readFlag(args, "--config") !== undefined || readFlag(args, "-c") !== undefined) {
    return { kind: "refuse", error: "pass no --config: the wrapper runs wrangler on the rendered wrangler.jsonc" };
  }
  const withConfig = [...args, "--config", configPath];
  if (!dryRun) return { kind: "run", args: withConfig, dryRunDeploy: false };
  if (command === "rollback") {
    return { kind: "print", line: `dry run: would run wrangler ${args.join(" ")} on ${configPath}` };
  }
  if (command !== "deploy") return { kind: "refuse", error: `dry run: only deploy and rollback are known, not ${command ?? "nothing"}` };
  const secretsFile = readFlag(args, "--secrets-file");
  const required = readRequiredSecrets(options.config, readFlag(args, "--env"));
  if (secretsFile === undefined && required.length > 0) {
    return { kind: "refuse", error: `dry run: no --secrets-file, but secrets.required lists ${required.join(", ")}` };
  }
  if (secretsFile !== undefined) {
    const missing = findMissingSecrets(required, options.readSecretsFile(secretsFile));
    if (missing.length > 0) return { kind: "refuse", error: `dry run: the secrets file misses ${missing.join(", ")}, which secrets.required lists` };
  }
  // A dry run uploads nothing, so neither the secrets nor the version message go to wrangler.
  const bundleArgs = dropFlag(dropFlag(withConfig, "--secrets-file"), "--message");
  return { kind: "run", args: [...bundleArgs, "--dry-run", "--outdir", options.outdir], dryRunDeploy: true };
}

function main(argv: readonly string[], env: Environment): number {
  const values = readDeployValues(env);
  if (!values.ok) return fail(values.error);
  const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const configPath = join(root, RENDERED_CONFIG);
  const rendered = renderDeployConfig(readFileSync(join(root, "wrangler.jsonc"), "utf8"), values.value);
  if (!rendered.ok) return fail(rendered.error);
  const outdir = mkdtempSync(join(tmpdir(), "worker-dry-run-"));
  writeFileSync(configPath, rendered.value, { mode: 0o600 });
  try {
    const plan = planWranglerCall({
      args: argv,
      configPath,
      dryRun: env.WRANGLER_DRY_RUN === "1",
      outdir,
      config: parseJsonc(rendered.value),
      readSecretsFile: (path) => readFileSync(path, "utf8"),
    });
    if (plan.kind === "refuse") return fail(plan.error);
    if (plan.kind === "print") {
      console.log(plan.line);
      return 0;
    }
    const result = spawnSync("npx", ["wrangler", ...plan.args], { cwd: root, stdio: "inherit", env: process.env });
    const status = result.status ?? 1;
    // The action reads the deployed version from wrangler's output file; a dry run deploys none, so it names its own.
    const outputFile = env.WRANGLER_OUTPUT_FILE_PATH;
    if (status === 0 && plan.dryRunDeploy && outputFile !== undefined && outputFile !== "") {
      appendFileSync(outputFile, `${JSON.stringify({ type: "deploy", version: 1, version_id: DRY_RUN_VERSION_ID })}\n`);
    }
    return status;
  } finally {
    rmSync(configPath, { force: true });
    rmSync(outdir, { recursive: true, force: true });
  }
}

function fail(message: string): number {
  console.error(`scripts/deploy/wrangler.ts: ${message}`);
  return 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2), process.env);
}
