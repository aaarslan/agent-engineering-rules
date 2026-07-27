---
scope: [profile]
load_when: greenfield experiments, early MVPs, scaffolding, or rapidly changing systems
related: [../workflow/verification.md, ../quality/testing.md]
---

# Prototype Profile

Deliver a correct, coherent slice quickly. Reduce ceremony, never correctness, security, or data integrity.

- Prefer replaceable code and simple boundaries. Remove superseded starter files, demo assets, sample routes, and placeholder behavior.
- Do not add CI, deployment infrastructure, production operations, generalized extension systems, fake latency, or pretend production readiness unless requested.
- Add tests only when requested, needed to reproduce a bug, or protecting stable dense logic.
- Use configured typecheck or compile, fast lint, and build commands. Exercise the changed flow once through its real entrypoint and check relevant scaffold residue.
- Treat heuristic scans as review input, not proof. Do not add tooling solely to satisfy this profile.

Report the exercised flow, command outcomes, known limitations, and deliberately deferred production work. Never call the result production-ready merely because these checks pass.
