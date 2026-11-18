// Opens an account's stored source as the vault source interface, whatever its kind: the GitHub App for a repository,
// the sealed key pair for a bucket, the sealed refresh token for a Dropbox folder, the sealed session and vault key for
// a remote sync vault. Null when this instance cannot read that kind (no GitHub App, no Dropbox app, no vault keyring),
// or when the stored bucket or socket host no longer passes this instance's rules or its sealed secret does not open.
import type { FetchFunction } from "@softure-ai/core";
import type { DropboxSourceSettings, GithubSourceSettings, HeadlessSyncSourceSettings, S3SourceSettings } from "../settings.ts";
import { openDropboxSource } from "./dropbox/link.ts";
import { createAccountGithubSource } from "./github/link.ts";
import { openHeadlessSyncSource } from "./headless-sync/link.ts";
import type { SyncSocketFactory } from "./headless-sync/sync-socket.ts";
import { openS3Credentials } from "./s3/s3-credentials.ts";
import { parseS3Location } from "./s3/s3-location.ts";
import { createS3Source } from "./s3/s3-source.ts";
import type { VaultSource } from "./source.ts";
import type { StoredS3Source, StoredSource } from "./store.ts";

export interface SourceOpenerSettings {
  readonly github: GithubSourceSettings;
  readonly s3: S3SourceSettings;
  readonly dropbox: DropboxSourceSettings;
  readonly headlessSync: HeadlessSyncSourceSettings;
  /** The fake GitHub of the end-to-end tests; GitHub calls only. */
  readonly githubFetch?: FetchFunction;
  /** A fake S3 in tests. */
  readonly s3Fetch?: FetchFunction;
  /** The fake Dropbox in tests; Dropbox calls only. */
  readonly dropboxFetch?: FetchFunction;
  /** A fake sync socket in tests. */
  readonly headlessSyncSocketFactory?: SyncSocketFactory;
}

export type SourceOpener = (source: StoredSource) => VaultSource | null;

export function createSourceOpener(settings: SourceOpenerSettings): SourceOpener {
  return (source) => {
    if (source.kind === "github") {
      if (settings.github.kind !== "configured") return null;
      return createAccountGithubSource({ settings: settings.github, ...(settings.githubFetch === undefined ? {} : { fetch: settings.githubFetch }) }, source);
    }
    if (source.kind === "dropbox") {
      if (settings.dropbox.kind !== "configured") return null;
      return openDropboxSource({ settings: settings.dropbox, ...(settings.dropboxFetch === undefined ? {} : { fetch: settings.dropboxFetch }) }, source);
    }
    if (source.kind === "headless-sync") {
      if (settings.headlessSync.kind !== "configured") return null;
      return openHeadlessSyncSource({ settings: settings.headlessSync, ...(settings.headlessSyncSocketFactory === undefined ? {} : { socketFactory: settings.headlessSyncSocketFactory }) }, source);
    }
    return openStoredS3Source(settings.s3, source, settings.s3Fetch);
  };
}

/** The bucket as a source, or null as described above. */
export function openStoredS3Source(settings: S3SourceSettings, source: StoredS3Source, fetch?: FetchFunction): ReturnType<typeof createS3Source> | null {
  if (settings.kind !== "configured") return null;
  const location = parseS3Location(source, { allowPrivateEndpoints: settings.allowPrivateEndpoints });
  if (!location.ok) return null;
  const credentials = openS3Credentials(settings.keyring, source.userId, source.sealedCredentials);
  if (credentials === null) return null;
  return createS3Source({ location: location.value, credentials, ...(fetch === undefined ? {} : { fetch }) });
}
