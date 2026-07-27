---
name: bug-fix
description: Fix a localized incorrect behavior with regression evidence. Use for existing defects, not new features, broad redesign, or review-only diagnosis.
---

# Bug Fix

Fix existing incorrect behavior. Reproduce the failure when practical and trace it to a root cause before editing; if your fix does not explain the observed behavior, it is not the fix. Make the smallest complete fix to the failure class, inspect callers and parallel entrypoints, and keep the reproduction as regression protection when the active profile requires it. Do not rewrite adjacent architecture.

When the fix touches a concern below, read the matching reference before editing:

- Failure handling or I/O: `agent-rules/reference/errors-and-side-effects.md`
- Untrusted input, auth, secrets, or trust boundaries: `agent-rules/reference/security.md`
- Data models or state shape: `agent-rules/reference/types-and-state.md`
- Test strategy for the reproduction: `agent-rules/reference/testing.md`

{{include:workflow/implementation.md}}

{{include:workflow/verification.md}}

{{include:workflow/skeptic-pass.md}}

## Completion

Finish only when evidence connects symptom, cause, and correction; the reproduction passes or its limitation is explicit; applicable checks produce usable results; and the skeptic pass finds no sibling-path regression, contract drift, or self-inflicted change.
