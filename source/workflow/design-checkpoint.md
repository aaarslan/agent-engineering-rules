---
scope: [routed]
load_when: before implementing any non-trivial change
related: [../design/principles.md, ../design/boundaries.md, implementation.md]
---

# Design Checkpoint

Before implementation, write a concise design assessment. For small changes this is a few lines; skip it only for trivial mechanical edits.

## Assessment

- Current behavior (evidence-based, with file references)
- Desired behavior
- Smallest safe change that fully achieves it
- Existing project pattern to follow
- Correct architectural layer for the change
- Invariants that must hold
- Type or data-model changes
- Error-handling strategy
- Security considerations
- Test strategy
- Compatibility risks (contracts, callers, stored data)
- What deliberately stays unchanged

## Self-check

Answer honestly before writing code:

- [ ] Is this the simplest viable solution, not just the first one found?
- [ ] Is the responsibility in the correct module or layer?
- [ ] Is every abstraction real (second consumer, genuine boundary, or testability need per [principles](../design/principles.md)), not speculative?
- [ ] Are business rules centralized, not duplicated?
- [ ] Are invalid states prevented where practical?
- [ ] Are errors explicit rather than swallowed or implied by null?
- [ ] Are side effects isolated from deterministic logic?
- [ ] Is it testable without excessive mocking?
- [ ] Does it preserve existing contracts?
- [ ] Does it match repository conventions?

A "no" on any item means redesign or an explicit, stated justification. Do not proceed silently.
