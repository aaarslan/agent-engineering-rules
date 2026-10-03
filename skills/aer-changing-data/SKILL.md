---
name: "aer-changing-data"
description: "Change persisted data meaning, schemas or migrations with mixed-version compatibility and recovery. Use for data lifecycle changes; never authorizes shared or production mutation."
---

<!-- aer:shared-safety:start -->
Honor the requested scope and applicable repository/client instructions. Preserve unrelated work, protect secrets and require authority for consequential external effects. Use available evidence honestly; unavailable checks are limitations. This skill works without an AER kernel or other skill.
<!-- aer:shared-safety:end -->

# Data Change

- Establish the old and new data meaning, affected readers and writers, invariants, and compatibility window.
- Address transactions, locking, backfill, mixed versions, repeated execution, reversibility, rollback or roll-forward, and recovery where implicated.
- Keep migrations, schema, ORM models, generated types, fixtures, APIs, and documentation consistent.
- Run the change against a realistic local or disposable database when practical; never mutate shared or production data without explicit authority.

Read `references/database-migrations.md`, `references/testing.md`, and `references/security.md` when applicable.

Finish when data artifacts and consumers agree, applicable integrity and recovery evidence is usable, and irreversible effects and sequencing are explicit.

Load relevant local detail only:
- [database-migrations](references/database-migrations.md)
- [testing](references/testing.md)
- [security](references/security.md)
