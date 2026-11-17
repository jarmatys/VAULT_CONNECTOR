-- The folders an account shares with its assistants. No row, nothing shared: there is no default. A picked folder
-- shares every note below it, so the app stores only the minimal set.
-- Rollback: DROP TABLE vault.shared_folders; then DELETE FROM softure.migrations WHERE module = 'vault' AND version = 2;
CREATE TABLE shared_folders (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  -- The source the folder was picked from; disconnecting the source forgets its picks.
  source_id uuid NOT NULL REFERENCES sources (id) ON DELETE CASCADE,
  -- Relative, `/`-separated, as the source names it: no leading or trailing slash, no empty, `.` or `..` segment, no
  -- dot folder (never shown, never shared).
  path text NOT NULL CHECK (
    char_length(path) BETWEEN 1 AND 1024
    AND path !~ '(^|/)\.'
    AND path !~ '(^/|/$|//)'
  ),
  picked_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, path)
);

CREATE INDEX shared_folders_source_id_idx ON shared_folders (source_id);
