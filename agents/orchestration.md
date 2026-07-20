---
scope: [routed]
load_when: coordinating subagents or independent review passes
related: [../workflow/autonomous-execution.md, ../workflow/review-ledger.md, ../contexts/pr-review.md]
---

# Agent Orchestration

Delegate only when parallel work reduces context pressure or independent verification materially helps. A task one context can hold is faster in one context.

## Roles

Give each specialist core plus only its concern files:

- **Repo Scout:** code paths, dependencies, conventions, affected files
- **Design Reviewer:** only the design files for boundaries, state, errors, or abstractions actually reviewed
- **Security Reviewer:** security plus contexts for inspected trust boundaries
- **Contract Reviewer:** backend/API or database contexts as relevant
- **Test Reviewer:** testing
- **Documentation Reviewer:** documentation
- **Drift Reviewer:** skeptic-pass hunt list
- **Skeptic:** skeptic pass and PR-review context; tries to disprove findings
- **Coordinator:** priorities and review ledger; deduplicates and resolves conflicts

## Contract

Specialists use the [PR-review finding format](../contexts/pr-review.md) and add open questions only when missing evidence changes the conclusion. Findings without evidence are discarded.

Give every specialist a narrow charter and bounded file ownership. Send contradictory findings to the Skeptic, then let the Coordinator decide once and record the decision in the [ledger](../workflow/review-ledger.md). The coordinator's plan is authoritative; specialist suggestions do not bypass it.
