---
name: security-audit
description: Audit a concrete surface for exploitable trust-boundary failures. Use for evidence-based security review, not generic checklists or safety clearance.
---

# Security Audit

Follow the **Security audit** route in [AGENTS.md](../../../AGENTS.md) and only contexts for inspected boundaries.

Map assets, actors, entrypoints, authorization decisions, sensitive data, and external effects. Trace untrusted input to concrete sinks and verify guards in context. Treat static patterns as signals, not proof; attempt to falsify every candidate. Do not modify code unless remediation is requested.

Finish only when scope and omissions are explicit and each finding gives evidence, a reachable abuse path, severity, impact, remediation, verification, and confidence. Check existing controls and false-positive explanations. Never claim exhaustive coverage, compliance, or safety clearance.
