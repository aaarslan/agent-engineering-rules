---
scope: [routed]
load_when: writing or modifying application code
related: [design-checkpoint.md, verification.md, ../core/anti-slop.md, ../quality/testing.md]
---

# Implementation

## Rules

- Make the smallest safe change that fully solves the problem. Small means localized, not partial.
- Follow the existing naming, structure, and patterns of the surrounding code. See [conventions](../core/conventions.md).
- Place each responsibility in its correct architectural layer. See [boundaries](../design/boundaries.md).
- Preserve public contracts unless the task explicitly changes them. When changing one, update every caller and consumer in the same change.
- At any trust boundary, apply the [security](../quality/security.md) non-negotiables.
- Handle expected failures deliberately (typed errors, results, clear fallbacks). Fail fast and loudly for programmer errors.
- Keep business logic independently testable: pure where practical, side effects at the edges.
- For bug fixes, reproduce the failure before editing; the reproduction becomes the regression test. All other test authoring comes after the build is complete; ordering and calibration in [testing](../quality/testing.md).
- Update documentation only when behavior, architecture, setup, or contracts actually changed, and update everything the change invalidated.

## Scope discipline

- Stay on task; the no-unrelated-cleanup and commit hygiene rules are in [conventions](../core/conventions.md).
- If you discover an adjacent problem, note it in the final report instead of fixing it inline, unless it blocks the task.
- If mid-implementation evidence invalidates the design, return to the [design checkpoint](design-checkpoint.md) rather than patching forward.
