---
name: aer-verify
description: Inspect a specific completion claim or diagnostic uncertainty when explicitly requested; not a routine final step.
---

# Focused Verification

- Identify the claim, changed artifact, available evidence, and remaining uncertainty.
- Inspect relevant implementation and existing results before selecting any new check; do not repeat valid evidence simply because another agent produced it.
- Exercise the real boundary when the uncertainty is behavioral; use an isolated check only for what it can establish.
- Optional diagnostics use `aer verify`: `node agent-rules/tools/aer-verify.mjs <check> <args>`. Select a documented check for a concrete concern; do not run the diagnostic inventory by default.
- Separate observed behavior, heuristic findings, and unavailable verification. Falsify candidate findings before reporting them.

Read `agent-rules/reference/verification.md` only when the remaining uncertainty needs its procedure. Finish with the supported conclusion, evidence, and limitations; no repeated verifier or report gate.
