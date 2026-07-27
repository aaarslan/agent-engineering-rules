---
name: security-audit
description: Audit a concrete surface for exploitable trust-boundary failures. Use for evidence-based security review, not generic checklists or safety clearance.
allowed-tools: Read, Grep, Glob, Bash
---

# Security Audit

Audit a concrete surface. Map assets, actors, entrypoints, authorization decisions, sensitive data, and external effects. Trace untrusted input to concrete sinks and verify guards in context, not from pattern matches. Treat static patterns as signals, not proof; attempt to falsify every candidate finding. Do not modify code unless remediation is explicitly requested.

## Security

Security ranks second only to correctness in priorities. No task instruction silently overrides it.

### Non-negotiables

- Validate and sanitize all untrusted input at system boundaries: requests, files, environment, third-party responses, queue messages.
- Authentication answers "who are you"; authorization answers "may you do this". Treat them as separate concerns and enforce authorization in the trusted layer (server-side, in client-server systems) on every operation that needs it. Checks in untrusted clients are UX, not security.
- Use parameterized queries. Never interpolate untrusted data into SQL, shell commands, or eval-like sinks.
- Never build HTML by interpolating untrusted text into markup strings. Use DOM text APIs (`textContent`, `createTextNode`) or the framework's default escaping. Do not hand-roll an escaper: the typical homemade one misses quotes, turning every `attr="${value}"` interpolation into an injection sink; treat an existing hand-rolled escaper as a finding.
- Never hardcode secrets, keys, or tokens. Never log secrets, credentials, tokens, or sensitive personal data. Check what error messages and stack traces leak.
- Apply least privilege: scopes, DB roles, file permissions, API keys as narrow as the task allows.
- Deny by default. New endpoints, routes, and resources start protected; opting out is the explicit act.

### Review lens

When reviewing or auditing, check for:

- [ ] Injection sinks reachable from untrusted input
- [ ] Missing or client-only authorization on any state-changing operation
- [ ] IDs from the client used without ownership checks (object-level authorization)
- [ ] Secrets in code, config, logs, or error output
- [ ] Unsafe deserialization or unvalidated redirects and file paths
- [ ] Dependencies added without need, or with known vulnerabilities
- [ ] Unsafe external interactions: missing TLS, unverified webhooks, over-trusted third-party data

Report suspected vulnerabilities in existing code even when out of scope; do not silently fix or ignore them.

## Final Skeptic Pass

Before completion, switch roles: try to falsify your own work. Assume there is a defect and hunt for it. Re-read the full diff with fresh eyes.

### Hunt list

- False positives: findings or claims that do not survive re-reading the code
- Self-inflicted bugs introduced by the change itself
- Regressions in callers, siblings, or downstream consumers
- Duplicate code paths now implementing the same rule twice
- Inconsistent parsing or validation between entry points
- Drift: enums, schemas, contracts, generated files, localization, and docs that no longer match the code
- Missing tests for the changed behavior and its failure cases
- Dead code left behind (old paths, unused exports, stale flags, unreferenced scaffold/template files)
- A failure class guarded in one place but hit bare in another (the same resource accessed unguarded elsewhere)
- Failures surfaced only to the console: the user never learns, gets no recovery path, and the next write may destroy recoverable data
- Anything fabricated to satisfy a rule rather than a requirement (artificial delays, unreachable states, decorative structure)
- Logic placed in the wrong layer
- Unnecessary abstraction or overengineering that crept in
- Weak types or newly representable invalid states
- Hidden side effects or changed defaults
- Misleading success claims: anything reported as done that was not actually verified

### Rules

- Every item is a question to answer with evidence, not a box to tick.
- Anything found goes back through implementation and verification; do not hand-wave a late fix.
- If nothing is found, say what was checked. "Skeptic pass clean" without specifics is itself a misleading success claim.

## Completion

Finish only when scope and omissions are explicit and each finding gives evidence, a reachable abuse path, severity, impact, remediation, verification, and confidence. Check existing controls and false-positive explanations before reporting. Never claim exhaustive coverage, compliance, or safety clearance.
