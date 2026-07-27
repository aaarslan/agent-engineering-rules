---
name: refactor
description: Improve existing structure while preserving behavior. Use for behavior-preserving design work, not a new feature or defect correction.
---

# Refactor

Improve structure without changing behavior. Baseline existing tests, real-flow behavior, contracts, callers, and stored-data effects before editing. State the structural problem and the smallest improvement that resolves it. Preserve public behavior; add no generalized layer or interface without a current consumer or genuine boundary.

Read `agent-rules/reference/principles.md` before restructuring, and `agent-rules/reference/boundaries.md` when moving responsibilities between layers. For system-level restructuring, read `agent-rules/reference/decision-making.md`.

{{include:workflow/design-checkpoint.md}}

{{include:workflow/verification.md}}

{{include:workflow/skeptic-pass.md}}

## Completion

Finish only when before/after evidence proves preservation, applicable checks pass, callers and artifacts agree, the diff reduces the stated problem without unrelated redesign, and the skeptic pass finds no semantic drift, removed behavior, dead path, or hidden side-effect change.
