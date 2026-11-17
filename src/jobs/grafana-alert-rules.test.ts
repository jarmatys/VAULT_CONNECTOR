// grafana/alert-rules.json is the observability backend's half of the operator's alerts (VC-13), applied on the
// owner's step with `npm run grafana:alerts`. The file must parse as the package's rules file, watch the jobs service
// under the names the runners export with, count the heartbeat's own line over ten minutes, and keep the package's
// error rule as the builder writes it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildLogProblemsRule, parseGrafanaRulesFile } from "@softure-ai/observability/node";
import { describe, expect, it } from "vitest";
import { HEARTBEAT_LOG_LINE, JOBS_SERVICE_NAME, OPERATOR_HEARTBEAT_SCHEDULES, SERVICE_NAMESPACE } from "./alerts.ts";

const RULES_PATH = join(import.meta.dirname, "..", "..", "grafana", "alert-rules.json");
const SERVICE = { namespace: SERVICE_NAMESPACE, name: JOBS_SERVICE_NAME, environment: "production" };

function readRules() {
  const parsed = parseGrafanaRulesFile(JSON.parse(readFileSync(RULES_PATH, "utf8")) as unknown);
  if (!parsed.isValid) throw new Error(`grafana/alert-rules.json: ${parsed.problems.join("; ")}`);
  return parsed.value;
}

function readExpressions(rule: { readonly data: readonly { readonly model: Record<string, unknown> }[] }): string[] {
  return rule.data.flatMap((query) => (typeof query.model.expr === "string" ? [query.model.expr] : []));
}

describe("grafana/alert-rules.json", () => {
  const file = readRules();

  it("holds the heartbeat's silence rule and the jobs' error rule, each uid once", () => {
    const uids = file.rules.map((rule) => rule.uid);
    expect(uids).toEqual(["vaultconnector-jobs-heartbeat", buildLogProblemsRule({ service: SERVICE, datasourceUid: "grafanacloud-logs" }).uid]);
    expect(new Set(uids).size).toBe(uids.length);
  });

  it("fires when the jobs service logged no heartbeat line for ten minutes, ten heartbeats after the last", () => {
    const rule = file.rules.find((candidate) => candidate.uid === "vaultconnector-jobs-heartbeat");
    expect(OPERATOR_HEARTBEAT_SCHEDULES["operator.heartbeat"].every).toBe("1m");
    expect(readExpressions(rule ?? { data: [] })).toEqual([
      `absent_over_time({service_namespace="${SERVICE_NAMESPACE}",service_name="${JOBS_SERVICE_NAME}",deployment_environment="production"} |= "${HEARTBEAT_LOG_LINE}" [10m])`,
    ]);
    // A Grafana query that fails says nothing about the jobs, so it does not page the operator.
    expect(rule).toMatchObject({ noDataState: "OK", execErrState: "OK", for: "0s" });
  });

  it("keeps the error rule exactly as the package builds it", () => {
    expect(file.rules).toContainEqual(buildLogProblemsRule({ service: SERVICE, datasourceUid: "grafanacloud-logs", severities: ["ERROR"] }));
  });

  it("notifies the operator's contact point, which the owner creates in Grafana", () => {
    expect(file.receiver).toBe("VaultConnector operator");
  });
});
