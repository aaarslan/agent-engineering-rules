---
name: "aer-reviewing-security"
description: "Review explicitly requested trust boundaries and entrypoints for exploitable security defects. Exclude routine implementation and automatic audits."
---

<!-- aer:shared-safety:start -->
Honor the requested scope and applicable repository/client instructions. Preserve unrelated work, protect secrets and require authority for consequential external effects. Use available evidence honestly; unavailable checks are limitations. This skill works without an AER kernel or other skill.
<!-- aer:shared-safety:end -->

# Agent Engineering Security Review

Use only when the user explicitly requests this workflow.

- Establish the requested trust boundary, entrypoints and intended contract using context and authorized tools actually available. Discover routine code context within that boundary; report material missing scope or evidence. Restricted adapters require caller-supplied context or execution output they cannot obtain.
- Stay read-only. If remediation is requested, return a bounded remediation plan for a separate implementation step.
- Map assets, actors, trust boundaries, entrypoints, authorization decisions, secrets, sensitive output, external effects, and failure behavior.
- Trace attacker-controlled input to concrete sinks and verify guards in context; patterns are leads, not proof.
- Falsify each candidate against reachability, existing controls, preconditions, and false-positive explanations.

Read `references/security.md`; inspect relevant stack evidence in the repository.

Distinguish statically grounded findings, executed evidence and unconfirmed high-impact concerns. Report scope, concrete abuse paths, consequences, bounded remediation and material uncertainty. For standards-based assurance, name the standard/version and assessed requirements; this skill alone is not an ASVS assessment. Never claim exhaustive coverage, compliance, certification, or safety clearance.

Load relevant local detail only:
- [security](references/security.md)
- [pr-review](references/pr-review.md)
