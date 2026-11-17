-- The extensions the vault's index needs (src/vault/migrations/0005_create_passages.sql): vectors for meaning and
-- trigrams for words. `vector` is not a trusted extension, so the least-privilege migrator of 01-roles.sql could not
-- create it; the image's superuser creates both here, once, when it initialises an empty data folder, and the
-- migration's `CREATE EXTENSION IF NOT EXISTS` then finds them.
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
