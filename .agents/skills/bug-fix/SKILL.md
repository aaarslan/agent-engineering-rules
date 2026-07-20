---
name: bug-fix
description: Fix a localized incorrect behavior with regression evidence. Use for existing defects, not new features, broad redesign, or review-only diagnosis.
---

# Bug Fix

Follow the **Bug fix** route in [AGENTS.md](../../../AGENTS.md), the active profile, and only contexts for the failing path.

Reproduce the failure when practical and trace it to a root cause before editing. Make the smallest complete fix to the failure class; inspect callers and parallel entrypoints without rewriting adjacent architecture. Keep the reproduction as regression protection when the profile requires it.

Finish only when evidence connects symptom, cause, and correction; the reproduction passes or its limitation is explicit; applicable checks produce usable results; and the skeptic pass finds no sibling-path regression, contract drift, or self-inflicted change.
