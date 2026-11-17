-- An account's vault source (one per account) and the one-time states of the GitHub link flow.
-- Rollback: DROP TABLE vault.source_link_states; DROP TABLE vault.sources; then
--   DELETE FROM softure.migrations WHERE module = 'vault' AND version = 1;
CREATE TABLE sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- One source per account; deleting the account deletes its source.
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('github')),
  -- `disconnected`: the installation was removed or suspended, or no longer reaches the repository.
  status text NOT NULL CHECK (status IN ('connected', 'disconnected')),
  github_installation_id bigint CHECK (github_installation_id > 0),
  github_repository_id bigint CHECK (github_repository_id > 0),
  -- `owner/name` and the branch the vault is read from, as GitHub named them when last checked.
  repository_full_name text CHECK (char_length(repository_full_name) BETWEEN 3 AND 200),
  default_branch text CHECK (char_length(default_branch) BETWEEN 1 AND 255),
  connected_at timestamptz NOT NULL,
  checked_at timestamptz NOT NULL,
  disconnected_at timestamptz,
  CONSTRAINT sources_user_id_key UNIQUE (user_id),
  CONSTRAINT sources_github_fields CHECK (
    kind <> 'github'
    OR (github_installation_id IS NOT NULL AND github_repository_id IS NOT NULL
        AND repository_full_name IS NOT NULL AND default_branch IS NOT NULL)
  ),
  CONSTRAINT sources_disconnected_at CHECK ((status = 'disconnected') = (disconnected_at IS NOT NULL))
);

-- A link in progress: only the sha256 of the state that travels through GitHub is stored, bound to the account that
-- started it. The setup redirect adds the installation id; the callback consumes the row.
CREATE TABLE source_link_states (
  state_hash text PRIMARY KEY CHECK (state_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  -- The PKCE verifier of the user authorization; it never reaches the browser.
  code_verifier text NOT NULL CHECK (char_length(code_verifier) BETWEEN 43 AND 128),
  github_installation_id bigint CHECK (github_installation_id > 0),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > created_at)
);

CREATE INDEX source_link_states_user_id_idx ON source_link_states (user_id);
CREATE INDEX source_link_states_expires_at_idx ON source_link_states (expires_at);
