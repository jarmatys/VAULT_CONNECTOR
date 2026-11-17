-- The copies in object storage of deleted accounts, waiting for the `vault.erase-copies` job. Deleting an account
-- queues the object key of every copy it had in the same transaction as its rows; the job deletes the objects after
-- the commit. A key is the HMAC prefix and the hash of a path (src/vault/storage/note-storage.ts): it names neither
-- the account nor the note, so the queue holds nothing of the deleted account.
-- Rollback: DROP TABLE vault.object_erasures; then DELETE FROM softure.migrations WHERE module = 'vault' AND version = 6;
-- (Keys still queued then stay in storage; delete them by hand.)
CREATE TABLE object_erasures (
  object_key text PRIMARY KEY CHECK (object_key ~ '^v1/[0-9a-f]{32}/[0-9a-f]{64}$'),
  queued_at timestamptz NOT NULL
);

CREATE INDEX object_erasures_queued_at_idx ON object_erasures (queued_at);
