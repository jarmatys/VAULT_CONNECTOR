-- A fourth kind of vault source: one remote vault of the account's sync subscription (the note app's own sync service),
-- read over its socket. The vault is stored as typed (id, name, socket host, salt, encryption mode and version); the
-- session token and the vault key only sealed together (AES-256-GCM under `VAULT_SOURCE_KEYS`, bound to the account),
-- never in the clear. The vault's encryption password is never stored: an end-to-end vault's key is derived in the
-- browser, a standard vault's from the password the service hands to the signed-in account.
-- Rollback: DELETE FROM vault.sources WHERE kind = 'headless-sync'; ALTER TABLE vault.sources
--   DROP CONSTRAINT sources_headless_sync_fields, DROP COLUMN headless_vault_id, DROP COLUMN headless_vault_name,
--   DROP COLUMN headless_host, DROP COLUMN headless_salt, DROP COLUMN headless_encryption,
--   DROP COLUMN headless_encryption_version, DROP COLUMN headless_credentials, DROP CONSTRAINT sources_kind_check,
--   ADD CONSTRAINT sources_kind_check CHECK (kind IN ('github', 's3', 'dropbox')); then
--   DELETE FROM softure.migrations WHERE module = 'vault' AND version = 8;
ALTER TABLE sources DROP CONSTRAINT sources_kind_check;
ALTER TABLE sources ADD CONSTRAINT sources_kind_check CHECK (kind IN ('github', 's3', 'dropbox', 'headless-sync'));

ALTER TABLE sources
  ADD COLUMN headless_vault_id text CHECK (headless_vault_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  ADD COLUMN headless_vault_name text CHECK (char_length(headless_vault_name) BETWEEN 1 AND 200),
  -- `host[:port]` the service named for the vault's socket.
  ADD COLUMN headless_host text CHECK (headless_host ~ '^[A-Za-z0-9.-]{1,253}(:[0-9]{1,5})?$'),
  ADD COLUMN headless_salt text CHECK (char_length(headless_salt) BETWEEN 1 AND 200),
  ADD COLUMN headless_encryption text CHECK (headless_encryption IN ('standard', 'e2ee')),
  ADD COLUMN headless_encryption_version smallint CHECK (headless_encryption_version IN (0, 2, 3)),
  -- `v1.<key id>.<iv>.<ciphertext and tag>` of `{token, key}`; opens only for this account's row.
  ADD COLUMN headless_credentials text CHECK (headless_credentials ~ '^v1\.[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' AND char_length(headless_credentials) <= 4000),
  ADD CONSTRAINT sources_headless_sync_fields CHECK (
    (kind = 'headless-sync' AND headless_vault_id IS NOT NULL AND headless_vault_name IS NOT NULL AND headless_host IS NOT NULL
      AND headless_salt IS NOT NULL AND headless_encryption IS NOT NULL AND headless_encryption_version IS NOT NULL
      AND headless_credentials IS NOT NULL)
    OR (kind <> 'headless-sync' AND headless_vault_id IS NULL AND headless_vault_name IS NULL AND headless_host IS NULL
      AND headless_salt IS NULL AND headless_encryption IS NULL AND headless_encryption_version IS NULL
      AND headless_credentials IS NULL)
  );
