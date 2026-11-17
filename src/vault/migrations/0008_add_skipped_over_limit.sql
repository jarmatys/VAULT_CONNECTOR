-- Notes the plan's caps left out of a run (VC-14): shared notes over the note or storage limit are neither copied nor
-- indexed, and the run counts them so the panel and the status tool can say so.
-- Rollback: ALTER TABLE vault.sync_runs DROP COLUMN skipped_over_limit;
--   then DELETE FROM softure.migrations WHERE module = 'vault' AND version = 7;
ALTER TABLE sync_runs ADD COLUMN skipped_over_limit integer NOT NULL DEFAULT 0 CHECK (skipped_over_limit >= 0);
