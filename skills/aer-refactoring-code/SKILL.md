---
name: "aer-refactoring-code"
description: "Improve a named structural problem while preserving behavior and public contracts. Use for ownership, coupling or state refactors; exclude new product behavior."
---

<!-- aer:shared-safety:start -->
Honor the requested scope and applicable repository/client instructions. Preserve unrelated work, protect secrets and require authority for consequential external effects. Use available evidence honestly; unavailable checks are limitations. This skill works without an AER kernel or other skill.
<!-- aer:shared-safety:end -->

# Refactor

- Establish behavior and contracts to preserve; use a runnable baseline when available, otherwise state the gap and choose decisive characterization or contract evidence.
- Improve a named problem in ownership, coupling, state, types, boundaries, or comprehension without inventing product behavior.
- Update affected in-scope consumers and remove truly superseded paths. Retain compatibility or staged-migration paths when the preserved contract requires them; remove accidental duplicate ownership.
- Compare relevant behavior before and after with the strongest available evidence, state preservation gaps, and run applicable repository gates.

Read `references/principles.md`, `references/boundaries.md`, `references/types-and-state.md`, or `references/testing.md` when applicable.

Finish when preservation evidence is usable, callers and artifacts agree, and the change reduces the stated problem without unrelated redesign.

Load relevant local detail only:
- [principles](references/principles.md)
- [boundaries](references/boundaries.md)
- [types-and-state](references/types-and-state.md)
- [testing](references/testing.md)
