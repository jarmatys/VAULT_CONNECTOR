// Where the operator's alerts go and who may open the admin pages, from the environment. Every value is the
// operator's own and never in the repository: an instance that sets none still loads, and its alerts wait in the
// admin list (each delivery fails with `alerts.channel_unconfigured`).

export const ALERTS_MAIL_TO_ENV = "ALERTS_MAIL_TO";
export const ALERTS_WEBHOOK_URL_ENV = "ALERTS_WEBHOOK_URL";
export const ADMIN_EMAILS_ENV = "ADMIN_EMAILS";

export interface OperatorAlertSettings {
  /** The operator's address for alert mail; undefined when unset. */
  readonly mailTo: string | undefined;
  /** A JSON webhook (a chat bridge, a pager) that gets every alert too; undefined when unset. */
  readonly webhookUrl: string | undefined;
  /** auth's `adminEmails`: the raw list, split and checked by auth. */
  readonly adminEmails: string;
}

type Environment = Readonly<Record<string, string | undefined>>;

export function readOperatorAlertSettings(env: Environment): OperatorAlertSettings {
  return {
    mailTo: readNonEmpty(env[ALERTS_MAIL_TO_ENV]),
    webhookUrl: readHttpsUrl(env[ALERTS_WEBHOOK_URL_ENV]),
    adminEmails: env[ADMIN_EMAILS_ENV]?.trim() ?? "",
  };
}

function readNonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}

/** Only an https address: a webhook URL carries its own secret and must not travel in clear. */
function readHttpsUrl(value: string | undefined): string | undefined {
  const trimmed = readNonEmpty(value);
  if (trimmed === undefined || !URL.canParse(trimmed)) return undefined;
  return new URL(trimmed).protocol === "https:" ? trimmed : undefined;
}
