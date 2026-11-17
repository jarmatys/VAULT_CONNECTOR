# Plan review: picked-notes-are-indexed

Verdict: approved after two fixes applied to the plan.

- Fixed (warning): `unaccent()` is not immutable, so a generated column or index on it fails; the plan folds accents in
  code before writing `search_text` and before building the query, the same on every host.
- Fixed (warning): an HNSW index filtered by account post-filters and can return fewer than k rows for one account; the
  plan uses an exact per-account scan and defers an ANN index to VC-14's plan sizes.
- Checked: `CREATE EXTENSION` inside a module migration runs with the module schema first on the search path, so the
  migration names `WITH SCHEMA public` and qualifies `public.vector` and `public.gin_trgm_ops`.
- Checked: the Workers AI binding is an object, not a string, so it never reaches `process.env`; the plan captures it
  in the `scheduled` handler, the only place index jobs run on Workers, and the binding is declared only under
  `env.production` (a top-level `ai` binding would make `wrangler dev` in e2e need an account).
- Checked: removal needs no index work (foreign key cascade from `vault.notes`), and the note row lock plus the version
  check makes a repeated or concurrent step write the same passages.
- Suggestion (accepted): the hit-rate fixture lives under a `pl/` folder for its Polish part (language gate exemption).
- Lessons: none recorded in `context/foundation/lessons.md` apply beyond the above.
