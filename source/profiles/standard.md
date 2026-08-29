---
scope: [profile]
load_when: ordinary maintained software without an explicit prototype or high-assurance profile
related: [../kernel/contract.md, ../workflow/verification.md, ../quality/testing.md]
---

# Standard Profile

Use this default for maintained software.

- Preserve public behavior and stored-data compatibility unless the task changes them.
- Keep changes localized but complete across affected callers, contracts, generated artifacts, and documentation.
- Exercise the real changed flow and relevant failure path. Add targeted tests after behavior stabilizes and run applicable repository gates.
- Run broad suites only for cross-cutting changes or repository-defined completion gates.

Report verified behavior, checks, compatibility decisions, and remaining risk. A failed, timed-out, skipped, empty, or unavailable relevant check is not a pass.
