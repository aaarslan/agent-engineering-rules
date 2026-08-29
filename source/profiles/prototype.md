---
scope: [profile]
load_when: greenfield experiments, early MVPs, scaffolding, or rapidly changing systems
related: [../kernel/contract.md, ../workflow/verification.md, ../quality/testing.md]
---

# Prototype Profile

Deliver a coherent runnable slice quickly; reduce ceremony, not correctness, security, or integrity.

- Prefer replaceable code and simple boundaries. Remove starter, demo, or placeholder behavior only when the slice supersedes it; report unrelated residue.
- Add no CI, deployment or production operations, or generalized extension systems unless requested or materially required.
- Add tests when requested, reproducing a defect, protecting stable dense logic, or material exposure, data, or regression risk warrants durable coverage.
- Run configured fast compile, lint, or build checks and exercise the changed real entrypoint.

Report the flow, checks, limitations, and deferred production work. Never claim production readiness without sufficient evidence.
