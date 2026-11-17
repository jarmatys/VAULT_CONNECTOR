-- How many syncs in a row failed for one account, so the operator hears of the third and of the next success. A row
-- exists only while the latest sync failed; a success deletes it.
-- Rollback: DROP TABLE operator.sync_failure_streaks; then DELETE FROM softure.migrations WHERE module = 'operator';

CREATE TABLE sync_failure_streaks (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  failures integer NOT NULL CHECK (failures >= 1),
  last_error_code text NOT NULL CHECK (char_length(last_error_code) BETWEEN 1 AND 100),
  started_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT sync_failure_streaks_order CHECK (updated_at >= started_at)
);
