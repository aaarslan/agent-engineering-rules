<!-- Generated from source/shared/autonomous-execution.md by tools/render-v6.mjs -->
# Autonomous Execution

For missions: one large objective, executed end to end.

## The loop

1. **Intake.** Establish the objective and consequential constraints; reuse accepted context. Ask only questions whose answers block progress; otherwise proceed with explicit assumptions.
2. **Evidence scan.** Establish the requested scope, authority, affected owners and available evidence before proposing anything.
3. **Design.** Choose direct work when the change is understood; plan consequential ambiguity and risk. Continue from an accepted current plan instead of rewriting it.
4. **Plan.** Break the mission into ordered, verifiable increments. For broad tasks, delegate independent work only within host capabilities and authorized budgets.
5. **Implement** one complete increment at a time; update affected consumers and preserve unrelated work.
6. **Verify** changed behavior: targeted checks during implementation, relevant integration evidence when an increment completes; reuse unaffected results.
7. **Risk review.** Falsify material uncertain claims at integration seams; do not repeat already decisive checks.

## Rules for long runs

- Continue while meaningful progress is possible within the objective, authority, and explicit time, token, or spend budgets; session length alone is not a stopping reason.
- Stop and report precisely when the mission is complete; a required user decision, input, permission, or dependency is unavailable; the next step would exceed scope, authority, or budget; or repeated evidence-backed attempts no longer produce new evidence or progress. Never imply completion because a limit was reached.
- Diagnose failures and retry only with changed evidence, implementation, input or environment; stop when attempts no longer produce new evidence.
- Track decisions as you go (scratch file or ledger) so later steps do not re-litigate or reverse earlier ones.
- Before compaction, handoff, or a session or budget limit, checkpoint the objective, completed work, decisions, affected files, evidence, failures, unverified items, and exact next step. Resume from that checkpoint; do not restart or reverse decisions without new evidence.
- Slice the mission into complete, verifiable behaviors. Check the uncertainty introduced at each integration boundary; no unchanged broad-suite or typecheck loop.
- Distinguish required engineering work from new product scope or external commitments without reclassifying required affected-path work or product expansion.
