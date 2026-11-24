// Guards of the self-hosted stack (docker-compose.yml, docs/self-hosting.md): what a self-hoster must set is documented,
// images are pinned, only the app is published, one image serves the app, the migration and the worker, the roles
// recipe is the ops package's, and the e2e stack sets every value compose requires.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { buildE2eStackEnv, formatEnvFile } from "./e2e-stack-env.ts";

const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");

const COMPOSE_TEXT = read("docker-compose.yml");
const E2E_TEXT = read("docker/compose.e2e.yml");

interface Service {
  readonly image?: string;
  readonly build?: unknown;
  readonly ports?: readonly string[];
}
const compose = parse(COMPOSE_TEXT, { merge: true }) as { services: Record<string, Service> };

/** Every `${NAME…}` the file reads, and the ones in the required form `${NAME:?…}`. */
function readVariables(text: string): { all: Set<string>; required: Set<string> } {
  const all = new Set<string>();
  const required = new Set<string>();
  for (const match of text.matchAll(/(?<!\$)\$\{([A-Z][A-Z0-9_]*)(:?[?-])?/g)) {
    const name = match[1] ?? "";
    all.add(name);
    if (match[2] === ":?") required.add(name);
  }
  return { all, required };
}

const base = readVariables(COMPOSE_TEXT);
const e2e = readVariables(E2E_TEXT);

describe("docker-compose.yml", () => {
  it("runs the database, the note store and its bucket step, the migration, the app and the worker", () => {
    expect(Object.keys(compose.services).sort()).toEqual(["app", "migrate", "postgres", "storage", "storage-init", "worker"]);
  });

  it("pins every image it pulls to a version", () => {
    for (const name of ["postgres", "storage", "storage-init"]) {
      expect(compose.services[name]?.image, name).toMatch(/^[a-z0-9./-]+:\d[\w.-]*$/);
    }
  });

  it("builds one image for the app, the migration and the worker", () => {
    const { app, migrate, worker } = compose.services;
    expect(app?.image).toBe("${VAULTCONNECTOR_IMAGE:-vaultconnector:local}");
    expect(migrate?.image).toBe(app?.image);
    expect(worker?.image).toBe(app?.image);
    expect(migrate?.build).toEqual(app?.build);
    expect(worker?.build).toEqual(app?.build);
  });

  it("publishes the app on loopback by default and nothing else", () => {
    expect(compose.services.app?.ports).toEqual(["${APP_BIND:-127.0.0.1}:${APP_PORT:-3000}:3000"]);
    for (const [name, service] of Object.entries(compose.services)) {
      if (name !== "app") expect(service.ports, name).toBeUndefined();
    }
  });

  it("lifts the plans' limits by default, for the app and the worker alike", () => {
    expect(COMPOSE_TEXT).toContain("PLAN_LIMITS: ${PLAN_LIMITS:-unlimited}");
  });

  it("documents every value it reads in .env.example", () => {
    const example = read(".env.example");
    const missing = [...base.all].filter((name) => !new RegExp(`^${name}=`, "m").test(example));
    expect(missing).toEqual([]);
  });

  it("names every required value in the guide", () => {
    expect([...base.required].sort()).toEqual([
      "APP_ORIGIN",
      "MAILING_UNSUBSCRIBE_SECRET",
      "POSTGRES_PASSWORD",
      "SOFTURE_APP_PASSWORD",
      "SOFTURE_EMAIL_KEY_SECRET",
      "SOFTURE_MIGRATOR_PASSWORD",
      "VAULT_S3_ACCESS_KEY_ID",
      "VAULT_S3_SECRET_ACCESS_KEY",
      "VAULT_STORAGE_KEY_SECRET",
    ]);
    const guide = read("docs/self-hosting.md");
    for (const name of base.required) expect(guide, name).toContain(`\`${name}\``);
  });

  it("creates the extensions before the roles recipe, which is the ops package's file byte for byte", () => {
    expect(read("docker/postgres/initdb/00-extensions.sql")).toMatch(/CREATE EXTENSION IF NOT EXISTS vector[\s\S]*pg_trgm/);
    expect(read("docker/postgres/initdb/01-roles.sql")).toBe(read("node_modules/@softure-ai/ops/recipes/initdb/01-roles.sql"));
  });
});

describe("buildE2eStackEnv", () => {
  const env = buildE2eStackEnv({
    port: 3100,
    fakeServicesOrigin: "http://127.0.0.1:3199",
    mailOutboxUrl: "http://127.0.0.1:3199/outbox",
    commit: "0".repeat(40),
    testEnv: { MAILING_UNSUBSCRIBE_SECRET: "test-secret", SOFTURE_EMAIL_KEY_SECRET: "test-email-key-secret-at-least-32-chars", STRIPE_SECRET_KEY: "sk_test_fake", STRIPE_WEBHOOK_SECRET: "whsec_fake" },
  });

  it("sets every value both compose files require", () => {
    const missing = [...base.required, ...e2e.required].filter((name) => (env[name] ?? "") === "");
    expect(missing).toEqual([]);
  });

  it("serves the app on the e2e port with Cloudflare's header, which the tests send", () => {
    expect(env.APP_ORIGIN).toBe("http://localhost:3100");
    expect(env.E2E_PORT).toBe("3100");
    expect(env.CLIENT_IP_SOURCE).toBe("cloudflare");
    expect(env.MAILING_UNSUBSCRIBE_SECRET).toBe("test-secret");
  });

  it("enforces the plans' limits, which the suite checks", () => {
    expect(env.PLAN_LIMITS).toBe("enforced");
  });

  it("pays through the fake Stripe, since the suite pays for a plan on the enforced stack", () => {
    expect(env.STRIPE_API_BASE).toBe("http://127.0.0.1:3199");
    expect([...e2e.required]).toEqual(expect.arrayContaining(["STRIPE_API_BASE", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]));
  });

  it("points the sync source at the fake sync service, since the suite links a synced vault on the stack", () => {
    expect(env.HEADLESS_SYNC_FAKE_ORIGIN).toBe("http://127.0.0.1:3199");
    expect([...e2e.required]).toContain("HEADLESS_SYNC_FAKE_ORIGIN");
  });
});

describe("formatEnvFile", () => {
  it("writes one single-quoted line per value", () => {
    expect(formatEnvFile({ A: "1", KEY: "-----BEGIN KEY-----\\nabc" })).toBe("A='1'\nKEY='-----BEGIN KEY-----\\nabc'\n");
  });

  it("refuses a value compose could not read back as it is", () => {
    expect(() => formatEnvFile({ A: "it's" })).toThrow("formatEnvFile: A holds a quote or a newline");
    expect(() => formatEnvFile({ B: "two\nlines" })).toThrow("formatEnvFile: B holds a quote or a newline");
  });
});

describe(".github/workflows/self-host.yml", () => {
  it("brings the stack up and runs the e2e suite against it on every pull request", () => {
    const workflow = parse(read(".github/workflows/self-host.yml")) as { on: Record<string, unknown>; jobs: Record<string, { steps: { run?: string }[] }> };
    expect(Object.keys(workflow.on)).toContain("pull_request");
    const runs = Object.values(workflow.jobs).flatMap((job) => job.steps.map((step) => step.run ?? ""));
    expect(runs).toContain("$COMPOSE up -d --build --wait --wait-timeout 300");
    expect(runs).toContain("npm run e2e:compose");
  });
});
