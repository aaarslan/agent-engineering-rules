---
name: feature-implementation
description: Implement a new behavior end to end. Use for features and vertical slices, not localized defects, refactors, or review-only work.
---

# Feature Implementation

Implement the smallest complete vertical slice through the real entrypoint. Trace affected callers, contracts, schemas, generated artifacts, tests, and documentation before editing. Preserve existing boundaries and contracts unless the request changes them.

When the feature touches a concern below, read the matching reference before designing that part:

- Placement or layer crossings: `agent-rules/reference/boundaries.md`
- Data models or state: `agent-rules/reference/types-and-state.md`
- Failure handling or I/O: `agent-rules/reference/errors-and-side-effects.md`
- Untrusted input, auth, money, secrets, or privilege boundaries: `agent-rules/reference/security.md`
- New or judged tests: `agent-rules/reference/testing.md`
- Design structure decisions: `agent-rules/reference/principles.md`

{{include:workflow/design-checkpoint.md}}

{{include:workflow/implementation.md}}

{{include:workflow/verification.md}}

{{include:workflow/skeptic-pass.md}}

## Completion

Finish only when the behavior and its most relevant failure path run for real, applicable tests and repository gates pass, affected artifacts agree, and the skeptic pass finds no unresolved regression, drift, dead path, or fabricated behavior.
