// The source opener for a request: the GitHub App, the Dropbox app and the vault keyring from the environment, and, in
// end-to-end tests only, the loopback fakes of GitHub, Dropbox and the sync service (`HEADLESS_SYNC_FAKE_ORIGIN`, read
// by the sync source's settings).
import { readAccountSettings } from "../../account-settings.ts";
import { createGithubFakeFetch } from "../../auth/github-fetch.ts";
import { readDropboxFakeOrigin, readDropboxSourceSettings, readGithubSourceSettings, readHeadlessSyncSourceSettings, readS3SourceSettings } from "../settings.ts";
import { createDropboxFakeFetch } from "./dropbox/dropbox-fetch.ts";
import { createSourceOpener, type SourceOpener } from "./open-source.ts";

export function getRequestSourceOpener(env: Readonly<Record<string, string | undefined>> = process.env): SourceOpener {
  const fakeOrigin = readAccountSettings(env).githubFakeOrigin;
  const dropboxFakeOrigin = readDropboxFakeOrigin(env);
  return createSourceOpener({
    github: readGithubSourceSettings(env),
    s3: readS3SourceSettings(env),
    dropbox: readDropboxSourceSettings(env),
    headlessSync: readHeadlessSyncSourceSettings(env),
    ...(fakeOrigin === undefined ? {} : { githubFetch: createGithubFakeFetch(fakeOrigin) }),
    ...(dropboxFakeOrigin === undefined ? {} : { dropboxFetch: createDropboxFakeFetch(dropboxFakeOrigin) }),
  });
}
