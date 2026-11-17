-- The account's settings for its assistants: the sentence it writes about what its vault holds, sent to an assistant in
-- the server's instructions (FR-17). Account-written text, stored as data and always shown to the assistant between the
-- untrusted-data markers.
-- Rollback: DROP TABLE connector.profiles; then DELETE FROM softure.migrations WHERE module = 'connector' AND version = 1;
CREATE TABLE profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  vault_description text NOT NULL CHECK (char_length(vault_description) <= 300),
  updated_at timestamptz NOT NULL
);
