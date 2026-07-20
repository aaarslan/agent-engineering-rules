---
name: feature-implementation
description: Implement a new behavior end to end. Use for features and vertical slices, not localized defects, refactors, or review-only work.
---

# Feature Implementation

Follow the **Feature** route in [AGENTS.md](../../../AGENTS.md), the active profile, and only evidence-matched contexts. Load security for trust boundaries.

Trace affected callers, contracts, schemas, generated artifacts, tests, and documentation before editing. Implement the smallest complete vertical slice through the real entrypoint; preserve existing boundaries and contracts unless the request changes them.

Finish only when the behavior and relevant failure path run for real, applicable tests and repository gates pass, affected artifacts agree, and the skeptic pass finds no unresolved regression, drift, dead path, or fabricated behavior.
