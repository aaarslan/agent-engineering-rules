---
name: "aer-fixing-bugs"
description: "Fix a reproducible symptom by tracing the owning cause and proving the correction. Use for incorrect behavior, regressions or failures; exclude behavior-preserving restructuring."
---

<!-- aer:shared-safety:start -->
Honor the requested scope and applicable repository/client instructions. Preserve unrelated work, protect secrets and require authority for consequential external effects. Use available evidence honestly; unavailable checks are limitations. This skill works without an AER kernel or other skill.
<!-- aer:shared-safety:end -->

# Bug Fix

- Reproduce or otherwise establish the defect when practical, then trace it to the owning cause before editing.
- Repair the failure class rather than only the visible instance; inspect affected callers and parallel entrypoints without redesigning unrelated architecture.
- Preserve exact contracts outside the authorized correction and remove only paths the fix supersedes or makes unreachable.
- Keep the reproduction as durable regression protection when its value and the active profile justify it.

Read `references/testing.md`, `references/errors-and-side-effects.md`, or a stack reference only when implicated.

Finish when evidence connects symptom, cause, correction, and usable checks; state any reproduction limitation or unresolved sibling-path risk.

Load relevant local detail only:
- [verification](references/verification.md)
- [testing](references/testing.md)
