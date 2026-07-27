---
name: database-change
description: Change a schema, migration, backfill, or persistence contract safely. Use when stored data or deployment compatibility changes.
---

# Database Change

Change stored data safely. Identify schema truth, affected queries and models, invariants, locking and backfill needs, deployment order, mixed-version compatibility, and generated contracts before editing. Use expand-migrate-contract where mixed-version compatibility matters. Assess rollback and roll-forward recovery. Never edit an already-applied migration and never write to shared systems without explicit authorization.

When the change crosses a trust boundary, read `agent-rules/reference/security.md`.

{{include:contexts/database-migrations.md}}

{{include:workflow/verification.md}}

{{include:workflow/skeptic-pass.md}}

## Completion

Finish only when migrations, schema, models, fixtures, callers, and contracts agree; relevant integrity, authorization, compatibility, and recovery checks pass on a disposable database when practical; and irreversible effects and sequencing are explicit.
