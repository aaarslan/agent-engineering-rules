---
name: refactor
description: Improve structure while preserving behavior and contracts.
---

# Refactor

- Establish the behavior and contracts that must remain unchanged before restructuring.
- Improve a named problem in ownership, coupling, state, types, boundaries, or comprehension without inventing product behavior.
- Update affected consumers and remove superseded affected paths so one implementation remains.
- Compare the relevant real behavior before and after, then run applicable repository gates.

Read `agent-rules/reference/principles.md`, `agent-rules/reference/boundaries.md`, `agent-rules/reference/types-and-state.md`, or `agent-rules/reference/testing.md` when applicable.

Finish when preservation evidence is usable, callers and artifacts agree, and the change reduces the stated problem without unrelated redesign.
