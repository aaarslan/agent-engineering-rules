---
scope: [routed]
load_when: coordinating subagents or independent review passes
related: [../workflow/autonomous-execution.md, ../workflow/review-ledger.md, ../contexts/pr-review.md]
---

# Agent Orchestration

Delegate when independent workstreams reduce wall time or context pressure; do not split work whose coordination costs more than it saves. Inspect returned artifacts and evidence; rerun only to resolve a gap or invalidated result.

Use an independent reviewer only for material correctness, security, integrity, compatibility, or accountable-assurance risk; an explicit high-assurance request; or a consequential conflict the coordinator cannot resolve from existing evidence. Do not spawn one for generic confidence or to repeat the coordinator's diff reading.

## Roles

Give each specialist core plus only its concern files:

- **Repo Scout:** code paths, dependencies, conventions, affected files
- **Design Reviewer:** only the design files for boundaries, state, errors, or abstractions actually reviewed
- **Security Reviewer:** security plus contexts for inspected trust boundaries
- **Contract Reviewer:** backend/API or database contexts as relevant
- **Test Reviewer:** testing
- **Documentation Reviewer:** documentation
- **Risk Reviewer:** one material risk or unresolved claim; attempts to falsify it without repeating deterministic gates
- **Coordinator:** priorities and review ledger; deduplicates and resolves conflicts

## Boundaries

- Follow host, user, and repository authorization for delegation depth and concurrency; never create more agents than independent useful workstreams.
- Give each specialist a bounded deliverable, owned files, allowed tools, and a time, token, or tool-use cap when the host supports one. A specialist stops at its cap and returns partial evidence; it cannot extend its own budget.
- Do not incur external-service spend without authorization. If spend or paid credits are authorized, share the approved budget across specialists. Delegation never grants authority to publish or mutate shared or production systems.
- Use one independent review pass unless new evidence changes the risk. Do not create chains of reviewers reviewing reviewers.

## Contract

Specialists use the [PR-review finding format](../contexts/pr-review.md) and add open questions only when missing evidence changes the conclusion. Findings without evidence are discarded.

Give every specialist a narrow charter and bounded file ownership. The coordinator resolves contradictory findings against evidence and the [ledger](../workflow/review-ledger.md); request a targeted independent review only when the conflict meets the material-risk threshold above. The coordinator's plan and authority boundaries govern integration; specialist suggestions do not bypass them.
