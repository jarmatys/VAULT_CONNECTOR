-- A second kind of vault source: an S3-compatible bucket. Its location is stored as typed (endpoint, region, bucket,
-- prefix); its read-only key pair only sealed (AES-256-GCM under `VAULT_SOURCE_KEYS`, bound to the account), never in
-- the clear. Each kind's columns are set for that kind only.
-- Rollback: DELETE FROM vault.sources WHERE kind = 's3'; ALTER TABLE vault.sources DROP CONSTRAINT sources_s3_fields,
--   DROP CONSTRAINT sources_github_only_fields, DROP COLUMN s3_endpoint, DROP COLUMN s3_region, DROP COLUMN s3_bucket,
--   DROP COLUMN s3_prefix, DROP COLUMN s3_credentials, DROP CONSTRAINT sources_kind_check,
--   ADD CONSTRAINT sources_kind_check CHECK (kind IN ('github')); then
--   DELETE FROM softure.migrations WHERE module = 'vault' AND version = 4;
ALTER TABLE sources DROP CONSTRAINT sources_kind_check;
ALTER TABLE sources ADD CONSTRAINT sources_kind_check CHECK (kind IN ('github', 's3'));

ALTER TABLE sources
  -- Origin and optional base path, ending with `/`.
  ADD COLUMN s3_endpoint text CHECK (char_length(s3_endpoint) BETWEEN 9 AND 500 AND s3_endpoint ~ '^https?://[^@?#]+/$'),
  ADD COLUMN s3_region text CHECK (s3_region ~ '^[a-z0-9][a-z0-9-]{0,31}$'),
  ADD COLUMN s3_bucket text CHECK (char_length(s3_bucket) BETWEEN 3 AND 63),
  -- The vault's folder in the bucket without leading or trailing `/`; empty for the bucket's root.
  ADD COLUMN s3_prefix text CHECK (char_length(s3_prefix) <= 512 AND s3_prefix !~ '(^/|/$|//)'),
  -- `v1.<key id>.<iv>.<ciphertext and tag>` of the key pair; opens only for this account's row.
  ADD COLUMN s3_credentials text CHECK (s3_credentials ~ '^v1\.[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' AND char_length(s3_credentials) <= 2000),
  ADD CONSTRAINT sources_s3_fields CHECK (
    (kind = 's3' AND s3_endpoint IS NOT NULL AND s3_region IS NOT NULL AND s3_bucket IS NOT NULL AND s3_prefix IS NOT NULL
      AND s3_credentials IS NOT NULL)
    OR (kind <> 's3' AND s3_endpoint IS NULL AND s3_region IS NULL AND s3_bucket IS NULL AND s3_prefix IS NULL
      AND s3_credentials IS NULL)
  ),
  ADD CONSTRAINT sources_github_only_fields CHECK (
    kind = 'github' OR (github_installation_id IS NULL AND github_repository_id IS NULL AND repository_full_name IS NULL
      AND default_branch IS NULL)
  );
