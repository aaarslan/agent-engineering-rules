---
name: pr-review
description: Review a diff for evidence-backed correctness, security, integrity, and test risks. Use for review-only work; do not edit unless asked.
---

# PR Review

Review a diff without editing. Read relevant implementation beyond each hunk and inspect affected callers, contracts, tests, and prior decisions. Try to falsify every candidate finding with a reachable input or state; discard unsupported or preference-only comments. Do not modify code unless asked.

For multi-pass review loops or resolving reviewer comments, keep a decision ledger per `agent-rules/reference/review-ledger.md` and never reverse a prior decision without new evidence. For parallel specialist reviews, see `agent-rules/reference/orchestration.md`.

{{include:contexts/pr-review.md}}

{{include:workflow/skeptic-pass.md}}

## Completion

Finish with actionable findings ordered by severity, or state that none remain and name the inspected scope. Each finding must include evidence, impact, action, verification, and confidence; challenge the final set with the skeptic pass before reporting.
