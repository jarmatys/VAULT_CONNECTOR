// The environment settings of the git source: the GitHub App the product installs on an account's repository. The
// App's client id and secret are the sign-in's (`GH_AUTH_CLIENT_ID`, `GH_AUTH_CLIENT_SECRET`: one App for both,
// decision of account-signs-up-to-panel); the source adds its id, its URL name and its private key. An instance
// without them (self-hosted without GitHub) shows no connect button, only that the git source is not configured.
import { GITHUB_CLIENT_ID_ENV, GITHUB_CLIENT_SECRET_ENV } from "../account-settings.ts";

export const GITHUB_APP_ID_ENV = "GH_APP_ID";
export const GITHUB_APP_SLUG_ENV = "GH_APP_SLUG";
export const GITHUB_APP_PRIVATE_KEY_ENV = "GH_APP_PRIVATE_KEY";

/** GitHub's rule for an App's URL name: letters, digits and single hyphens. */
const APP_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

export type GithubSourceSettings =
  | {
      readonly kind: "configured";
      readonly appId: string;
      /** `https://github.com/apps/<slug>`. */
      readonly slug: string;
      /** PEM, as GitHub hands it out (PKCS#1); never logged. */
      readonly privateKey: string;
      readonly clientId: string;
      readonly clientSecret: string;
    }
  | { readonly kind: "unconfigured" };

type Environment = Readonly<Record<string, string | undefined>>;

/** The GitHub App of the git source when all five values are set and well formed; otherwise unconfigured. */
export function readGithubSourceSettings(env: Environment): GithubSourceSettings {
  const appId = readNonEmpty(env[GITHUB_APP_ID_ENV]);
  const slug = readNonEmpty(env[GITHUB_APP_SLUG_ENV]);
  const privateKey = readNonEmpty(env[GITHUB_APP_PRIVATE_KEY_ENV]);
  const clientId = readNonEmpty(env[GITHUB_CLIENT_ID_ENV]);
  const clientSecret = readNonEmpty(env[GITHUB_CLIENT_SECRET_ENV]);
  if (appId === undefined || slug === undefined || privateKey === undefined || clientId === undefined || clientSecret === undefined) {
    return { kind: "unconfigured" };
  }
  if (!/^\d+$/.test(appId) || !APP_SLUG.test(slug)) return { kind: "unconfigured" };
  return { kind: "configured", appId, slug, privateKey, clientId, clientSecret };
}

function readNonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}
