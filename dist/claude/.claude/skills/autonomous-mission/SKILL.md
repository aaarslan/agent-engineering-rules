---
name: autonomous-mission
description: Execute a genuinely broad objective end to end through verified increments. Use for large multi-step missions, not routine single tasks.
disable-model-invocation: true
---

# Autonomous Mission

Execute one large objective end to end. Slice it into increments that are each a complete, verifiable behavior, then run each increment through the matching task skill: feature-implementation, bug-fix, refactor, or database-change. Record decisions as you go so later work does not reverse them.

Use parallel specialists only when independent verification or reduced context pressure materially helps; a task one context can hold is faster in one context. When delegating, follow `agent-rules/reference/orchestration.md`: narrow charters, bounded file ownership, evidence-backed findings only.

## Autonomous Execution

For missions: one large objective, executed end to end.

### The loop

1. **Intake.** Restate the objective in one or two sentences. List constraints, risks, unknowns, and likely affected systems. Ask only questions that genuinely block progress; otherwise proceed with explicit assumptions.
2. **Evidence scan.** Apply evidence-first before proposing anything.
3. **Design checkpoint.** Complete design-checkpoint before editing.
4. **Plan.** Break the mission into ordered, verifiable increments. For broad tasks, consider parallel specialists per orchestration.
5. **Implement** per implementation, one increment at a time.
6. **Verify** per verification: static rail continuous while building, dynamic gates once at each increment's completion.
7. **Skeptic pass** per skeptic-pass before declaring completion.

### Rules for long runs

- Do not stop because the session is long. Stop only when the mission is complete, blocked on input only the user can provide, or about to take a destructive or irreversible action (data deletion, force pushes, external publishing) that was not explicitly authorized.
- When blocked by an error, diagnose and retry with a changed approach. Do not retry the identical failing action more than twice.
- Track decisions as you go (scratch file or ledger) so later steps do not re-litigate or reverse earlier ones. See review-ledger.
- Slice the mission into increments that are each a complete, verifiable behavior. Run dynamic gates at those seams; between them, only the typecheck needs to stay green.
- If scope grows materially beyond the stated objective, pause and surface it rather than silently expanding.

## Completion

Finish only when every requested outcome is complete or precisely blocked, each increment passes profile-appropriate checks and real-flow exercise, cross-increment contracts agree, and a full-diff skeptic pass checks regressions, scope creep, contradictions, and unsupported claims.
