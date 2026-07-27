---
name: security-audit
description: Audit a concrete surface for exploitable trust-boundary failures. Use for evidence-based security review, not generic checklists or safety clearance.
---

# Security Audit

Audit a concrete surface. Map assets, actors, entrypoints, authorization decisions, sensitive data, and external effects. Trace untrusted input to concrete sinks and verify guards in context, not from pattern matches. Treat static patterns as signals, not proof; attempt to falsify every candidate finding. Do not modify code unless remediation is explicitly requested.

{{include:quality/security.md}}

{{include:workflow/skeptic-pass.md}}

## Completion

Finish only when scope and omissions are explicit and each finding gives evidence, a reachable abuse path, severity, impact, remediation, verification, and confidence. Check existing controls and false-positive explanations before reporting. Never claim exhaustive coverage, compliance, or safety clearance.
