---
scope: [routed]
load_when: given a large task expected to run end to end without supervision
related: [design-checkpoint.md, verification.md, skeptic-pass.md, ../agents/orchestration.md]
---

# Autonomous Execution

For missions: one large objective, executed end to end.

## The loop

1. **Intake.** Restate the objective in one or two sentences. List constraints, risks, unknowns, and likely affected systems. Ask only questions that genuinely block progress; otherwise proceed with explicit assumptions.
2. **Evidence scan.** Apply [evidence-first](../core/evidence-first.md) before proposing anything.
3. **Design checkpoint.** Complete [design-checkpoint](design-checkpoint.md) before editing.
4. **Plan.** Break the mission into ordered, verifiable increments. For broad tasks, consider parallel specialists per [orchestration](../agents/orchestration.md).
5. **Implement** per [implementation](implementation.md), one increment at a time.
6. **Verify** per [verification](verification.md): static rail continuous while building, dynamic gates once at each increment's completion.
7. **Skeptic pass** per [skeptic-pass](skeptic-pass.md) before declaring completion.

## Rules for long runs

- Do not stop because the session is long. Stop only when the mission is complete, blocked on input only the user can provide, or about to take a destructive or irreversible action (data deletion, force pushes, external publishing) that was not explicitly authorized.
- When blocked by an error, diagnose and retry with a changed approach. Do not retry the identical failing action more than twice.
- Track decisions as you go (scratch file or ledger) so later steps do not re-litigate or reverse earlier ones. See [review-ledger](review-ledger.md).
- Slice the mission into increments that are each a complete, verifiable behavior. Run dynamic gates at those seams; between them, only the typecheck needs to stay green.
- If scope grows materially beyond the stated objective, pause and surface it rather than silently expanding.
