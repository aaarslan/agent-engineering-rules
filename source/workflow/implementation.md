---
scope: [routed]
load_when: writing or modifying application code
related: [design-checkpoint.md, verification.md, ../kernel/contract.md, ../quality/testing.md]
---

# Implementation

## Rules

- Make the complete coherent change at the owning boundary. Use a larger refactor or replacement when evidence shows it removes the defect or structural debt; change size alone is neither a cost proxy nor a quality verdict.
- Follow sound repository conventions; repair a broken abstraction when the requested outcome requires it, without introducing a parallel convention.
- Place each responsibility in its correct architectural layer. See [boundaries](../design/boundaries.md).
- Preserve public contracts unless the task explicitly changes them. When changing one, update every caller and consumer in the same change.
- At any trust boundary, apply the [security](../quality/security.md) non-negotiables.
- Handle expected failures deliberately (typed errors, results, clear fallbacks). Fail fast and loudly for programmer errors.
- Keep business logic independently testable: pure where practical, side effects at the edges.
- For bug fixes, reproduce or otherwise establish the failure before editing when practical; retain it as durable regression protection when its value and profile justify it. Author other tests after behavior stabilizes; see [testing](../quality/testing.md).
- Update documentation only when behavior, architecture, setup, or contracts actually changed, and update everything the change invalidated.

## Scope discipline

- Stay on task and keep commits coherent; preserve unrelated user changes.
- Apply the [scope and authority](../kernel/contract.md) distinction across affected callers and contracts. A complete fix is not a license for adjacent product work.
- If you discover an adjacent problem, note it in the final report instead of fixing it inline, unless it blocks the task.
- If mid-implementation evidence invalidates the chosen direct path or plan, return to [proportional design](design-checkpoint.md) rather than patching forward.
