// The link flow's context for a request: the request's database, the wall clock, the App from the environment, the
// configured public origin (never a request header) and, in end-to-end tests only, the loopback fake of GitHub for
// both the server's calls and the browser's visits.
import { systemClock, type FetchFunction } from "@softure-ai/core";
import { getSoftureConfig } from "@softure-ai/core/next";
import { readAccountSettings } from "../../../account-settings.ts";
import { getRequestDatabase } from "../../../auth/module-context.ts";
import { createGithubFakeFetch } from "../../../auth/github-fetch.ts";
import { readGithubSourceSettings } from "../../settings.ts";
import type { GithubLinkContext } from "./link.ts";

/** The context, or null when this instance has no GitHub App for the git source. */
export async function getGithubLinkContext(): Promise<GithubLinkContext | null> {
  const settings = readGithubSourceSettings(process.env);
  if (settings.kind === "unconfigured") return null;
  const db = await getRequestDatabase();
  const config = getSoftureConfig();
  const fakeOrigin = readAccountSettings(process.env).githubFakeOrigin;
  const fetch: FetchFunction | undefined = fakeOrigin === undefined ? undefined : createGithubFakeFetch(fakeOrigin);
  return {
    db,
    clock: systemClock,
    settings,
    appOrigin: config.appOrigin,
    ...(fetch === undefined ? {} : { fetch }),
    ...(fakeOrigin === undefined ? {} : { webOrigin: `${fakeOrigin}/github.com` }),
  };
}
