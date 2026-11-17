// The environment settings of accounts: GitHub sign-in and the rate-limit fallback (mail is `settings.ts`). Like
// `settings.ts`, every value that differs between the hosted instance and a self-hosted one is an environment variable,
// with defaults that only suit a local, throwaway setup.

/** The environment variables that hold the GitHub client used for sign-in (a GitHub App's or an OAuth App's). */
export const GITHUB_CLIENT_ID_ENV = "GH_AUTH_CLIENT_ID";
export const GITHUB_CLIENT_SECRET_ENV = "GH_AUTH_CLIENT_SECRET";

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"]);

export interface AccountSettings {
  /** Whether GitHub sign-in is configured: both client variables are set. */
  readonly isGithubSignInEnabled: boolean;
  /**
   * A local stand-in for GitHub's token and API endpoints (end-to-end tests). Only a loopback http(s) origin is
   * accepted, so a production setting can never send sign-ins anywhere but GitHub.
   */
  readonly githubFakeOrigin: string | undefined;
  /**
   * Requests without a `CF-Connecting-IP` header share one rate-limit key instead of being refused. For `next dev` and
   * test stacks with no Cloudflare in front; never in production.
   */
  readonly hasSharedRateLimitFallback: boolean;
}

type Environment = Readonly<Record<string, string | undefined>>;

/** The account settings from the environment, with GitHub off and no fallback when a variable is unset or empty. */
export function readAccountSettings(env: Environment): AccountSettings {
  return {
    isGithubSignInEnabled: readNonEmpty(env[GITHUB_CLIENT_ID_ENV]) !== undefined && readNonEmpty(env[GITHUB_CLIENT_SECRET_ENV]) !== undefined,
    githubFakeOrigin: toLoopbackOrigin(readNonEmpty(env.GH_AUTH_FAKE_ORIGIN)),
    hasSharedRateLimitFallback: env.RATE_LIMIT_SHARED_FALLBACK?.trim() === "1",
  };
}

/** The origin of a loopback http(s) URL; anything else (another host, a malformed value) is ignored. */
export function toLoopbackOrigin(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  const isWebProtocol = url.protocol === "http:" || url.protocol === "https:";
  return isWebProtocol && LOOPBACK_HOSTS.has(url.hostname) && url.username === "" && url.password === "" ? url.origin : undefined;
}

function readNonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}
