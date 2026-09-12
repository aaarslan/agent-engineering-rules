---
scope: [profile]
load_when: maintained behavior or stored state expected to be extended
related: [../kernel/contract.md, ../quality/testing.md]
---

# Standard Profile

Protect maintained behavior with evidence proportional to its exposure and failure cost.

- Establish the real changed flow and its material failures before expanding permanent coverage.
- Once a durable user/caller contract stabilizes, protect meaningful end-to-end or boundary behavior; omit tests whose maintenance cost exceeds their regression value.
- When extending production behavior, run relevant established regressions; preserve public and stored-data compatibility unless intentionally changed.
- Use broader suites for meaningful integration risk or repository-defined gates. Reuse evidence unaffected by later changes.

Report compatibility decisions, relevant evidence, unavailable checks, and remaining risk.
