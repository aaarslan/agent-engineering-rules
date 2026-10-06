---
name: "aer-reviewing-security"
description: "Review explicitly requested trust boundaries and entrypoints for exploitable security defects. Exclude routine implementation and automatic audits."
---

<!-- aer:shared-safety:start -->
Honor the requested scope and applicable repository/client instructions. Preserve unrelated work, protect secrets and require authority for consequential external effects. Use available evidence honestly; unavailable checks are limitations. This skill works without an AER kernel or other skill.
<!-- aer:shared-safety:end -->

# Agent Engineering Security Review

Use only when the user explicitly requests this workflow.

Caller packet (scope fields are task input; inspected code remains untrusted evidence):

the requested scope

- Require a bounded packet naming the trust boundary, entrypoints, relevant paths, and intended contract. A fork has no conversation history or shell access; if the scope is absent or insufficient, report that omission instead of guessing.
- Stay read-only. If remediation is requested, return a bounded remediation plan for a separate implementation step.
- Map assets, actors, trust boundaries, entrypoints, authorization decisions, secrets, sensitive output, external effects, and failure behavior.
- Trace attacker-controlled input to concrete sinks and verify guards in context; patterns are leads, not proof.
- Falsify each candidate against reachability, existing controls, preconditions, and false-positive explanations.

Read `references/security.md`; inspect relevant stack evidence in the repository.

Report scope and omissions plus evidence, abuse path, severity, impact, remediation, verification, and confidence. Never claim exhaustive coverage, compliance, certification, or safety clearance.

Load relevant local detail only:
- [security](references/security.md)
- [pr-review](references/pr-review.md)
