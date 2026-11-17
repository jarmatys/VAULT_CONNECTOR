-- The search index of an account's synced notes: every note cut into passages, each with its folded text for keyword
-- search and, when the instance has an embedding model, its vector for search by meaning. The notes table records
-- which version of a note and which model its passages come from, so a changed note or a new model is indexed again.
-- Rollback: DROP TABLE vault.index_states; DROP TABLE vault.passages;
--   ALTER TABLE vault.notes DROP COLUMN indexed_version, DROP COLUMN indexed_model, DROP COLUMN indexed_at;
--   then DELETE FROM softure.migrations WHERE module = 'vault' AND version = 4;
-- (The extensions stay: other schemas may use them.)

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

-- The note version and model the passages were built from (the model is '' for a keyword-only index), and when.
ALTER TABLE notes
  ADD COLUMN indexed_version text CHECK (char_length(indexed_version) BETWEEN 1 AND 200),
  ADD COLUMN indexed_model text CHECK (char_length(indexed_model) <= 200),
  ADD COLUMN indexed_at timestamptz,
  ADD CONSTRAINT notes_indexed CHECK ((indexed_version IS NULL) = (indexed_at IS NULL) AND (indexed_version IS NULL) = (indexed_model IS NULL));

-- One row per passage. A note's passages are replaced together, and go with the note.
CREATE TABLE passages (
  user_id uuid NOT NULL,
  path text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal BETWEEN 0 AND 999),
  -- The headings above the passage, outermost first ('' above the first heading).
  heading text NOT NULL CHECK (char_length(heading) <= 2000),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  -- Title, headings and body lowered, without accents and punctuation (folded in the app, the same way as queries).
  search_text text NOT NULL CHECK (char_length(search_text) <= 8000),
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, search_text)) STORED,
  -- Null on a keyword-only index. Searched exactly within one account, so no approximate index.
  embedding public.vector(1024),
  PRIMARY KEY (user_id, path, ordinal),
  FOREIGN KEY (user_id, path) REFERENCES notes (user_id, path) ON DELETE CASCADE
);

CREATE INDEX passages_search_vector_idx ON passages USING gin (search_vector);
CREATE INDEX passages_search_text_trgm_idx ON passages USING gin (search_text public.gin_trgm_ops);

-- An account's last index failure, shown in the panel until a later step succeeds.
CREATE TABLE index_states (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  error_code text NOT NULL CHECK (error_code ~ '^[a-z]+\.[a-z_]+$'),
  failed_at timestamptz NOT NULL
);
