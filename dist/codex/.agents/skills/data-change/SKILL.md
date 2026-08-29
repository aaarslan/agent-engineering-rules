---
name: data-change
description: Change persisted data with integrity and recovery evidence.
---

# Data Change

- Establish the old and new data meaning, affected readers and writers, invariants, and compatibility window.
- Address transactions, locking, backfill, mixed versions, repeated execution, reversibility, rollback or roll-forward, and recovery where implicated.
- Keep migrations, schema, ORM models, generated types, fixtures, APIs, and documentation consistent.
- Run the change against a realistic local or disposable database when practical; never mutate shared or production data without explicit authority.

Read `agent-rules/reference/database-migrations.md`, `agent-rules/reference/testing.md`, and `agent-rules/reference/security.md` when applicable.

Finish when data artifacts and consumers agree, applicable integrity and recovery evidence is usable, and irreversible effects and sequencing are explicit.
