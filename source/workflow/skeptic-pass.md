---
scope: [any-code-change]
load_when: before declaring any non-trivial task complete
related: [verification.md, ../core/evidence-first.md]
---

# Final Skeptic Pass

Before completion, switch roles: try to falsify your own work. Assume there is a defect and hunt for it. Re-read the full diff with fresh eyes.

## Hunt list

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

## Rules

- Every item is a question to answer with evidence, not a box to tick.
- Anything found goes back through [implementation](implementation.md) and [verification](verification.md); do not hand-wave a late fix.
- If nothing is found, say what was checked. "Skeptic pass clean" without specifics is itself a misleading success claim.
