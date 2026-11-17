// The source opener for a request: the GitHub App and the vault keyring from the environment, and, in end-to-end tests
// only, the loopback fake of GitHub.
import { readAccountSettings } from "../../account-settings.ts";
import { createGithubFakeFetch } from "../../auth/github-fetch.ts";
import { readGithubSourceSettings, readS3SourceSettings } from "../settings.ts";
import { createSourceOpener, type SourceOpener } from "./open-source.ts";

export function getRequestSourceOpener(env: Readonly<Record<string, string | undefined>> = process.env): SourceOpener {
  const fakeOrigin = readAccountSettings(env).githubFakeOrigin;
  return createSourceOpener({
    github: readGithubSourceSettings(env),
    s3: readS3SourceSettings(env),
    ...(fakeOrigin === undefined ? {} : { githubFetch: createGithubFakeFetch(fakeOrigin) }),
  });
}
