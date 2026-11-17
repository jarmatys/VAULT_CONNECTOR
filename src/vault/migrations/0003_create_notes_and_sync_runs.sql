-- The synced copy of an account's picked notes: the table of contents (one row per note copied to object storage), the
-- sync runs with the work each still has to do, and the account's sync state on its source row.
-- Rollback: DROP TABLE vault.sync_items; DROP TABLE vault.sync_runs; DROP TABLE vault.notes;
--   ALTER TABLE vault.sources DROP COLUMN synced_cursor, DROP COLUMN sync_requested_at, DROP COLUMN sync_lease_until;
--   then DELETE FROM softure.migrations WHERE module = 'vault' AND version = 3;
-- (The objects in storage stay; delete the bucket's `v1/` prefix by hand.)

-- The source's position the copy matches (null: never synced, or the picks changed and the next run diffs everything),
-- when a sync was last asked for and not yet started, and until when one step holds the account's sync.
ALTER TABLE sources
  ADD COLUMN synced_cursor text CHECK (char_length(synced_cursor) BETWEEN 1 AND 200),
  ADD COLUMN sync_requested_at timestamptz,
  ADD COLUMN sync_lease_until timestamptz;

-- One row per copied note. Rows hang off the account, not the source: when the source goes, the next sync still finds
-- them and removes the copies.
CREATE TABLE notes (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  -- As the source names it; always a note inside a picked folder when written.
  path text NOT NULL CHECK (char_length(path) BETWEEN 1 AND 1024 AND path !~ '(^|/)\.' AND path !~ '(^/|/$|//)'),
  -- The source's name for the content (a blob sha): equal versions, equal bytes.
  version text NOT NULL CHECK (char_length(version) BETWEEN 1 AND 200),
  size integer NOT NULL CHECK (size >= 0),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 500),
  tags text[] NOT NULL DEFAULT '{}',
  aliases text[] NOT NULL DEFAULT '{}',
  description text CHECK (char_length(description) <= 2000),
  -- When the sync stored this version: the copy's last change.
  changed_at timestamptz NOT NULL,
  synced_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, path)
);

-- A run brings the copy from the synced cursor to `target_cursor`. Planning writes its work as items; steps take items
-- until none is left. At most one open run per account.
CREATE TABLE sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  -- What asked for it: a push, the scheduled check, a change of picks.
  trigger text NOT NULL CHECK (trigger IN ('webhook', 'schedule', 'picks')),
  -- Null when the run only removes copies (no source, no picks).
  target_cursor text CHECK (char_length(target_cursor) BETWEEN 1 AND 200),
  planned_copies integer NOT NULL DEFAULT 0 CHECK (planned_copies >= 0),
  planned_removals integer NOT NULL DEFAULT 0 CHECK (planned_removals >= 0),
  copied integer NOT NULL DEFAULT 0 CHECK (copied >= 0),
  removed integer NOT NULL DEFAULT 0 CHECK (removed >= 0),
  -- Notes over the size limit, and files in picked folders that are not notes: skipped, never an error.
  skipped_too_large integer NOT NULL DEFAULT 0 CHECK (skipped_too_large >= 0),
  skipped_not_note integer NOT NULL DEFAULT 0 CHECK (skipped_not_note >= 0),
  steps integer NOT NULL DEFAULT 0 CHECK (steps >= 0),
  error_code text CHECK (error_code ~ '^[a-z]+\.[a-z_]+$'),
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  CONSTRAINT sync_runs_finished CHECK ((status = 'running') = (finished_at IS NULL)),
  CONSTRAINT sync_runs_error CHECK ((status = 'failed') = (error_code IS NOT NULL))
);

CREATE UNIQUE INDEX sync_runs_one_open_idx ON sync_runs (user_id) WHERE status = 'running';
CREATE INDEX sync_runs_user_started_idx ON sync_runs (user_id, started_at DESC);

-- The work an open run still has to do; a step deletes an item once its copy or removal is done.
CREATE TABLE sync_items (
  run_id uuid NOT NULL REFERENCES sync_runs (id) ON DELETE CASCADE,
  path text NOT NULL CHECK (char_length(path) BETWEEN 1 AND 1024),
  action text NOT NULL CHECK (action IN ('copy', 'remove')),
  version text CHECK (char_length(version) BETWEEN 1 AND 200),
  size integer CHECK (size >= 0),
  PRIMARY KEY (run_id, path),
  CONSTRAINT sync_items_copy CHECK ((action = 'copy') = (version IS NOT NULL AND size IS NOT NULL))
);
