---
scope: [context]
load_when: creating or modifying database schemas and migrations
related: [backend-api.md, ../workflow/verification.md]
---

# Database and Migrations

Migrations are production code with the least room for error: they run once, against real data, often under load.

## Schema

- Enforce critical invariants at the database level where appropriate: NOT NULL, unique, foreign keys, checks. Application-only invariants drift.
- Verify indexes against real access patterns (the queries this change introduces or modifies), not habit. An unused index costs writes.
- Preserve historical data semantics. Changing a column's meaning silently corrupts every existing row's interpretation; add a new column instead.

## Writing a migration

Answer before writing:

- **Locking**: does this operation lock the table? For large tables, use the engine's safe pattern (concurrent index builds, batched updates).
- **Backfill**: does existing data need populating? Backfill in batches, separate from the schema change when large.
- **Deployment order**: can old code run against the new schema and new code against the old? Sequence expand, migrate, contract if not.
- **Defaults and nullability**: adding NOT NULL to an existing table needs a default or backfill first.
- **Recovery**: assess application rollback, schema rollback, and roll-forward recovery. Write a down migration when practical, but do not treat it as proof that old code can safely consume changed data. Mark destructive or irreversible steps explicitly.

## Verification and drift

- Run the migration against a realistic local or disposable database, up and (where a down migration exists) down, before calling it done. Shared environments such as staging fall under the authorization rule in [verification](../workflow/verification.md).
- Check the full drift chain in the same change: migration, schema file, ORM models, generated types, API contracts, seeds, fixtures, and docs.
- Never edit an already-applied migration; add a new one.
