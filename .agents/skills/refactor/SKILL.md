---
name: refactor
description: Improve existing structure while preserving behavior. Use for behavior-preserving design work, not a new feature or defect correction.
---

# Refactor

Follow the **Refactor** route in [AGENTS.md](../../../AGENTS.md), the active profile, and only contexts for touched technologies.

Baseline existing tests, real-flow behavior, contracts, callers, and stored-data effects. State the structural problem and smallest improvement. Preserve public behavior; add no generalized layer or interface without a current consumer or genuine boundary.

Finish only when before/after evidence proves preservation, applicable checks pass, callers and artifacts agree, the diff reduces the stated problem without unrelated redesign, and the skeptic pass finds no semantic drift, removed behavior, dead path, or hidden side-effect change.
