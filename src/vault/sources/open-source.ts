// Opens an account's stored source as the vault source interface, whatever its kind: the GitHub App for a repository,
// the sealed key pair for a bucket. Null when this instance cannot read that kind (no GitHub App, no vault keyring), or
// when the stored bucket no longer passes this instance's endpoint rules or its key pair does not open.
import type { FetchFunction } from "@softure-ai/core";
import type { GithubSourceSettings, S3SourceSettings } from "../settings.ts";
import { createAccountGithubSource } from "./github/link.ts";
import { openS3Credentials } from "./s3/s3-credentials.ts";
import { parseS3Location } from "./s3/s3-location.ts";
import { createS3Source } from "./s3/s3-source.ts";
import type { VaultSource } from "./source.ts";
import type { StoredS3Source, StoredSource } from "./store.ts";

export interface SourceOpenerSettings {
  readonly github: GithubSourceSettings;
  readonly s3: S3SourceSettings;
  /** The fake GitHub of the end-to-end tests; GitHub calls only. */
  readonly githubFetch?: FetchFunction;
  /** A fake S3 in tests. */
  readonly s3Fetch?: FetchFunction;
}

export type SourceOpener = (source: StoredSource) => VaultSource | null;

export function createSourceOpener(settings: SourceOpenerSettings): SourceOpener {
  return (source) => {
    if (source.kind === "github") {
      if (settings.github.kind !== "configured") return null;
      return createAccountGithubSource({ settings: settings.github, ...(settings.githubFetch === undefined ? {} : { fetch: settings.githubFetch }) }, source);
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
