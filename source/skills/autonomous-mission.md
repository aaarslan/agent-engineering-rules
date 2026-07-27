---
name: autonomous-mission
description: Execute a genuinely broad objective end to end through verified increments. Use for large multi-step missions, not routine single tasks.
---

# Autonomous Mission

Execute one large objective end to end. Slice it into increments that are each a complete, verifiable behavior, then run each increment through the matching task skill: feature-implementation, bug-fix, refactor, or database-change. Record decisions as you go so later work does not reverse them.

Use parallel specialists only when independent verification or reduced context pressure materially helps; a task one context can hold is faster in one context. When delegating, follow `agent-rules/reference/orchestration.md`: narrow charters, bounded file ownership, evidence-backed findings only.

{{include:workflow/autonomous-execution.md}}

## Completion

Finish only when every requested outcome is complete or precisely blocked, each increment passes profile-appropriate checks and real-flow exercise, cross-increment contracts agree, and a full-diff skeptic pass checks regressions, scope creep, contradictions, and unsupported claims.
