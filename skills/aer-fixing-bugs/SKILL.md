---
name: "aer-fixing-bugs"
description: "Fix an observed or well-evidenced intermittent defect by tracing the owning cause and proving the correction. Use for incorrect behavior, regressions or failures; exclude behavior-preserving restructuring."
---

<!-- aer:shared-safety:start -->
Honor the requested scope and applicable repository/client instructions. Preserve unrelated work, protect secrets and require authority for consequential external effects. Use available evidence honestly; unavailable checks are limitations. This skill works without an AER kernel or other skill.
<!-- aer:shared-safety:end -->

# Bug Fix

- Establish expected versus observed behavior and the strongest practical reproducer or causal evidence. When unclear, use a focused discriminating check or reversible diagnostic change rather than speculative fixes.
- Repair the failure class across affected in-scope paths rather than only the visible instance; inspect affected callers and parallel entrypoints without redesigning unrelated architecture.
- Preserve exact contracts outside the authorized correction and remove only paths the fix supersedes or makes unreachable.
- Keep the reproduction as durable regression protection when task lifespan, exposure, failure cost and repository requirements justify its future value.

Load the local references below only when implicated; use other stack guidance when identified by the actual project.

Finish when evidence connects symptom, cause, correction, and usable checks; state any reproduction limitation or unresolved sibling-path risk.

Load relevant local detail only:
- [errors-and-side-effects](references/errors-and-side-effects.md)
- [verification](references/verification.md)
- [testing](references/testing.md)
