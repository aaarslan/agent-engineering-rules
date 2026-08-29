# Autonomous Execution

For missions: one large objective, executed end to end.

## The loop

1. **Intake.** Restate the objective in one or two sentences. List constraints, risks, unknowns, and likely affected systems. Ask only questions that genuinely block progress; otherwise proceed with explicit assumptions.
2. **Evidence scan.** Apply the universal contract before proposing anything.
3. **Design.** Choose the direct or plan path in [design-checkpoint](design-checkpoint.md). Continue from an accepted current plan instead of rewriting it.
4. **Plan.** Break the mission into ordered, verifiable increments. For broad tasks, consider parallel specialists per [orchestration](orchestration.md).
5. **Implement** per [implementation](implementation.md), one increment at a time.
6. **Verify** per [verification](verification.md): static rail continuous while building, dynamic gates once at each increment's completion.
7. **Risk review.** Use [skeptic-pass](skeptic-pass.md) only at seams with material risk, uncertainty, or cross-increment effects.

## Rules for long runs

- Continue while meaningful progress is possible within the objective, authority, and explicit time, token, or spend budgets; session length alone is not a stopping reason.
- Stop and report precisely when the mission is complete; a required user decision, input, permission, or dependency is unavailable; the next step would exceed scope, authority, or budget; or repeated evidence-backed attempts no longer produce new evidence or progress. Never imply completion because a limit was reached.
- Follow [verification](verification.md) for bounded retries; reaching its no-new-evidence condition is a stopping condition.
- Track decisions as you go (scratch file or ledger) so later steps do not re-litigate or reverse earlier ones. See [review-ledger](review-ledger.md).
- Before compaction, handoff, or a session or budget limit, checkpoint the objective, completed work, decisions, affected files, evidence, failures, unverified items, and exact next step. Resume from that checkpoint; do not restart or reverse decisions without new evidence.
- Slice the mission into increments that are each a complete, verifiable behavior. Run dynamic gates at those seams; between them, only the typecheck needs to stay green.
- Apply the scope and authority distinction without reclassifying required affected-path work or product expansion.
