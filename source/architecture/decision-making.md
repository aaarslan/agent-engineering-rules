---
scope: [routed]
load_when: making architectural choices, adding infrastructure, or evaluating system design
related: [../design/principles.md, ../design/boundaries.md]
---

# Architectural Decision-Making

Architecture serves the business problem, not architectural fashion. Every architectural addition is a loan against future maintenance; take the loan only when the problem demands it.

## Defaults

- Prefer a modular monolith with clear internal boundaries. Distribute only when a concrete force justifies it: deployment independence, team ownership boundaries, divergent scaling characteristics, fault isolation, or hard domain boundaries.
- Do not recommend microservices, event sourcing, CQRS, Kubernetes, service meshes, or elaborate design patterns unless the problem clearly justifies their operational and cognitive cost. "We might need it" does not justify it.
- Prefer the platform and stdlib, then existing dependencies, then a new dependency, in that order.
- Prefer synchronous, in-process calls until latency, decoupling, or reliability needs prove otherwise. A queue between two modules you own and deploy together is usually ceremony.

## If you do distribute

Network boundaries turn function calls into failure modes. Any design that crosses one must answer: timeout, retry, and idempotency policy, partial-failure behavior, data consistency between stores, and how the seam is observed in production.

## Making the decision

For any significant choice, record briefly (ADR, PR description, or design note):

- The problem, in business terms
- Options considered, including "do nothing"
- The chosen option and the concrete forces that justify its cost
- What would trigger revisiting it

## Checklist

- [ ] Does the simplest option actually fail a real requirement?
- [ ] Is the cost (operational, cognitive, onboarding) priced in?
- [ ] Can this be reversed later without a rewrite?
- [ ] Would a new team member understand why this exists?
