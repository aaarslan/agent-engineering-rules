---
scope: [routed]
load_when: when a change requires a design decision or implementation plan
related: [../design/principles.md, ../design/boundaries.md, implementation.md]
---

# Proportional Design

Choose the direct path or plan path before editing. Do not produce a design artifact merely to satisfy a ritual.

## Direct path

Proceed directly when desired behavior and the owning boundary are clear and reversible, a sound pattern applies, and no unresolved contract, security, or external-effect decision requires design work. A clear large change does not need extra ceremony solely for its size; trivial edits need no written checkpoint.

## Plan path

Write a concise plan when the change crosses components or contracts, changes state or persistence, introduces a dependency or boundary, has irreversible or security-sensitive effects, carries meaningful ambiguity, or needs multiple independently verifiable increments.

Include only applicable decisions:

- evidence for current and desired behavior
- coherent complete implementation, with evidence for retaining or replacing the existing design
- affected boundaries, contracts, invariants, callers, and stored data
- error, security, compatibility, migration, and recovery behavior
- verification for each meaningful increment
- scope limits only where they prevent a likely misunderstanding

If the user or host already supplied a current accepted plan, validate it against repository evidence and continue from it. Do not write a second plan unless new evidence invalidates a decision. During implementation, return here only when evidence changes the chosen path or plan.
