-- A third kind of vault source: one folder of an account's Dropbox, read with a read-only grant. The folder is stored as
-- typed (`/Obsidian/My vault`, empty for the root of the grant), the Dropbox account id as Dropbox names it, and the
-- refresh token only sealed (AES-256-GCM under `VAULT_SOURCE_KEYS`, bound to the account), never in the clear. Link
-- states gain a kind, so the Dropbox authorization reuses the one-time states of the GitHub link.
-- Rollback: DELETE FROM vault.sources WHERE kind = 'dropbox'; DELETE FROM vault.source_link_states WHERE kind = 'dropbox';
--   ALTER TABLE vault.source_link_states DROP CONSTRAINT source_link_states_kind_fields, DROP COLUMN dropbox_folder,
--   DROP COLUMN kind; ALTER TABLE vault.sources DROP CONSTRAINT sources_dropbox_fields, DROP COLUMN dropbox_account_id,
--   DROP COLUMN dropbox_folder, DROP COLUMN dropbox_credentials, DROP CONSTRAINT sources_kind_check,
--   ADD CONSTRAINT sources_kind_check CHECK (kind IN ('github', 's3')); then
--   DELETE FROM softure.migrations WHERE module = 'vault' AND version = 6;
ALTER TABLE sources DROP CONSTRAINT sources_kind_check;
ALTER TABLE sources ADD CONSTRAINT sources_kind_check CHECK (kind IN ('github', 's3', 'dropbox'));

ALTER TABLE sources
  -- `dbid:…`, the Dropbox account the grant belongs to.
  ADD COLUMN dropbox_account_id text CHECK (dropbox_account_id ~ '^dbid:[A-Za-z0-9_-]{1,100}$'),
  -- `/`-separated with one leading `/`, or empty for the root of the grant (`dropbox-folder.ts`).
  ADD COLUMN dropbox_folder text CHECK (char_length(dropbox_folder) <= 513 AND (dropbox_folder = '' OR dropbox_folder ~ '^/[^/]') AND dropbox_folder !~ '(//|/$)'),
  -- `v1.<key id>.<iv>.<ciphertext and tag>` of the refresh token; opens only for this account's row.
  ADD COLUMN dropbox_credentials text CHECK (dropbox_credentials ~ '^v1\.[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' AND char_length(dropbox_credentials) <= 8000),
  ADD CONSTRAINT sources_dropbox_fields CHECK (
    (kind = 'dropbox' AND dropbox_account_id IS NOT NULL AND dropbox_folder IS NOT NULL AND dropbox_credentials IS NOT NULL)
    OR (kind <> 'dropbox' AND dropbox_account_id IS NULL AND dropbox_folder IS NULL AND dropbox_credentials IS NULL)
  );

ALTER TABLE source_link_states
  ADD COLUMN kind text NOT NULL DEFAULT 'github' CHECK (kind IN ('github', 'dropbox')),
  -- The folder the account named before going to Dropbox.
  ADD COLUMN dropbox_folder text CHECK (char_length(dropbox_folder) <= 513),
  ADD CONSTRAINT source_link_states_kind_fields CHECK (
    (kind = 'github' AND dropbox_folder IS NULL)
    OR (kind = 'dropbox' AND dropbox_folder IS NOT NULL AND github_installation_id IS NULL)
  );
