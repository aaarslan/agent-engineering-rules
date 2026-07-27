---
name: database-change
description: Change a schema, migration, backfill, or persistence contract safely. Use when stored data or deployment compatibility changes.
paths:
  - "**/migrations/**"
  - "db/**"
  - "prisma/**"
  - "**/*.sql"
---

# Database Change

Change stored data safely. Identify schema truth, affected queries and models, invariants, locking and backfill needs, deployment order, mixed-version compatibility, and generated contracts before editing. Use expand-migrate-contract where mixed-version compatibility matters. Assess rollback and roll-forward recovery. Never edit an already-applied migration and never write to shared systems without explicit authorization.

When the change crosses a trust boundary, read `agent-rules/reference/security.md`.

## Database and Migrations

Migrations are production code with the least room for error: they run once, against real data, often under load.

### Schema

- Enforce critical invariants at the database level where appropriate: NOT NULL, unique, foreign keys, checks. Application-only invariants drift.
- Verify indexes against real access patterns (the queries this change introduces or modifies), not habit. An unused index costs writes.
- Preserve historical data semantics. Changing a column's meaning silently corrupts every existing row's interpretation; add a new column instead.

### Writing a migration

Answer before writing:

- **Locking**: does this operation lock the table? For large tables, use the engine's safe pattern (concurrent index builds, batched updates).
- **Backfill**: does existing data need populating? Backfill in batches, separate from the schema change when large.
- **Deployment order**: can old code run against the new schema and new code against the old? Sequence expand, migrate, contract if not.
- **Defaults and nullability**: adding NOT NULL to an existing table needs a default or backfill first.
- **Recovery**: assess application rollback, schema rollback, and roll-forward recovery. Write a down migration when practical, but do not treat it as proof that old code can safely consume changed data. Mark destructive or irreversible steps explicitly.

### Verification and drift

- Run the migration against a realistic local or disposable database, up and (where a down migration exists) down, before calling it done. Shared environments such as staging fall under the authorization rule in verification.
- Check the full drift chain in the same change: migration, schema file, ORM models, generated types, API contracts, seeds, fixtures, docs. See skeptic-pass.
- Never edit an already-applied migration; add a new one.

## Verification

The active profile defines minimum assurance. Add gates for security, integrity, compatibility, accessibility, migrations, or performance as touched. Profiles never reduce correctness.

### Static rail during construction

Keep configured typecheck, incremental compile, and fast lint green while building. Do not run broad suites against incomplete scaffolding. A bug fix begins with one reproduction when practical, per testing.

### Dynamic rail at a complete seam

A seam is a finished feature slice, fix, or autonomous increment. Run applicable gates in order:

1. Exercise the changed behavior through its real entrypoint, including the most relevant failure case and keyboard behavior for UI. If unavailable, use the closest executable proxy and state the limitation.
2. Run or add targeted tests when required by the active profile and testing.
3. Run configured format, lint, typecheck, and aggregate checks. Do not invent tooling solely to fill a missing gate.
4. Build the runnable artifact. Run the broader suite for cross-cutting changes or when the profile or repository requires it.
5. Run migration, schema, generated-file, and contract checks when those artifacts changed; regenerate and inspect their diffs.
6. Run provided security and secret scans where relevant. Use this system's tools only on documented project types; inspect heuristic warnings.
7. Use shared or production systems only with explicit authorization. Local disposable environments need none.

Use repository-native commands, not remembered generic substitutes.

### Failed or unavailable gates

Collect useful output before editing. Diagnose, fix, then rerun the failed gate and earlier affected gates. A crash, timeout, missing prerequisite, empty or undispositioned flaky result, or skipped relevant gate is not a pass.

### Completion evidence

- Name each relevant command or manual exercise, exit status, and material outcome.
- State why an applicable gate could not run and what remains unverified.
- Meet the active profile's completion record.
- Finish with skeptic-pass; route anything it finds back through implementation and verification.

## Final Skeptic Pass

Before completion, switch roles: try to falsify your own work. Assume there is a defect and hunt for it. Re-read the full diff with fresh eyes.

### Hunt list

- False positives: findings or claims that do not survive re-reading the code
- Self-inflicted bugs introduced by the change itself
- Regressions in callers, siblings, or downstream consumers
- Duplicate code paths now implementing the same rule twice
- Inconsistent parsing or validation between entry points
- Drift: enums, schemas, contracts, generated files, localization, and docs that no longer match the code
- Missing tests for the changed behavior and its failure cases
- Dead code left behind (old paths, unused exports, stale flags, unreferenced scaffold/template files)
- A failure class guarded in one place but hit bare in another (the same resource accessed unguarded elsewhere)
- Failures surfaced only to the console: the user never learns, gets no recovery path, and the next write may destroy recoverable data
- Anything fabricated to satisfy a rule rather than a requirement (artificial delays, unreachable states, decorative structure)
- Logic placed in the wrong layer
- Unnecessary abstraction or overengineering that crept in
- Weak types or newly representable invalid states
- Hidden side effects or changed defaults
- Misleading success claims: anything reported as done that was not actually verified

### Rules

- Every item is a question to answer with evidence, not a box to tick.
- Anything found goes back through implementation and verification; do not hand-wave a late fix.
- If nothing is found, say what was checked. "Skeptic pass clean" without specifics is itself a misleading success claim.

## Completion

Finish only when migrations, schema, models, fixtures, callers, and contracts agree; relevant integrity, authorization, compatibility, and recovery checks pass on a disposable database when practical; and irreversible effects and sequencing are explicit.
