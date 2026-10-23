# Database and Migrations

Database migrations can affect real data under load. Follow the engine and framework contracts for versioned and repeatable migrations. For other persistence changes, apply only the relevant integrity and recovery guidance.

## Schema

- Enforce critical invariants at the database level where appropriate: NOT NULL, unique, foreign keys, checks. Application-only invariants drift.
- Verify indexes against real access patterns (the queries this change introduces or modifies), not habit. An unused index costs writes.
- Preserve historical data semantics. Do not silently reinterpret existing rows. Choose coexistence in a new column or an explicit in-place transformation according to mixed-version compatibility and recovery needs.

## Writing a migration

Answer before writing:

- **Locking**: does this operation lock the table? For large tables, use the engine's safe pattern (concurrent index builds, batched updates).
- **Backfill**: does existing data need populating? Backfill in batches, separate from the schema change when large.
- **Deployment order**: can old code run against the new schema and new code against the old? Sequence expand, migrate, contract if not.
- **Defaults and nullability**: before adding or validating NOT NULL, verify that existing rows satisfy it and concurrent/new writes will continue to do so. Backfill NULLs where necessary; a default on an existing column does not repair existing rows. Choose the engine/version-appropriate validation and locking sequence.
- **Recovery**: assess application rollback, schema rollback, and roll-forward recovery. Write a down migration when practical, but do not treat it as proof that old code can safely consume changed data. Mark destructive or irreversible steps explicitly.

## Verification and drift

- For rollout readiness, execute against a realistic local or disposable database, including recovery where practical. Reviewed unexecuted migration artifacts may fulfill an artifact-only request; label execution and rollout readiness unverified. Obtain authority before writing to shared environments such as staging.
- Check the affected drift chain: migration, schema file, ORM models, generated types, API contracts, seeds, fixtures, and docs.
- Preserve shared applied versioned history; normally add a new migration. Framework-supported repeatable migrations and narrowly documented historical-model repairs follow their own contracts. Verify environment compatibility before any exceptional repair; do not casually rewrite shared history.
