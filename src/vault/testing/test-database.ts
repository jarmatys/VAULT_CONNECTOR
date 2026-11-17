// The test database of the vault tests: the given modules migrated on PGlite with the extensions the search index
// needs (pgvector for embeddings, pg_trgm for the typo-tolerant keyword fallback), loaded into the template and every copy.
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { vector } from "@electric-sql/pglite-pgvector";
import type { AnySoftureModule } from "@softure-ai/core";
import { createTestDatabase, type TestDatabase } from "@softure-ai/db/testing";

export const VAULT_TEST_EXTENSIONS = { vector, pg_trgm };

/** A migrated test database with the vault's extensions. */
export function createVaultTestDatabase(modules: readonly AnySoftureModule[]): Promise<TestDatabase> {
  return createTestDatabase(modules, { extensions: VAULT_TEST_EXTENSIONS });
}
