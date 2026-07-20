---
name: database-change
description: Change a schema, migration, backfill, or persistence contract safely. Use when stored data or deployment compatibility changes.
---

# Database Change

Follow the **Database change** route in [AGENTS.md](../../../AGENTS.md), the active profile, and database/backend contexts supported by evidence.

Identify schema truth, affected queries and models, invariants, locking and backfill needs, deployment order, mixed-version compatibility, and generated contracts. Use expand-migrate-contract where needed. Assess rollback and roll-forward recovery; never edit an applied migration or write to shared systems without authorization.

Finish only when migrations, schema, models, fixtures, callers, and contracts agree; relevant integrity, authorization, compatibility, and recovery checks pass on a disposable database when practical; and irreversible effects and sequencing are explicit.
