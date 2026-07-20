---
name: pr-review
description: Review a diff for evidence-backed correctness, security, integrity, and test risks. Use for review-only work; do not edit unless asked.
---

# PR Review

Follow the **PR review** route in [AGENTS.md](../../../AGENTS.md) and only contexts represented in the diff.

Read relevant implementation beyond each hunk and inspect affected callers, contracts, tests, and prior decisions. Try to falsify every candidate with a reachable input or state. Use the finding contract in [contexts/pr-review.md](../../../contexts/pr-review.md); discard unsupported or preference-only comments. Do not modify code unless asked.

Finish with actionable findings ordered by severity, or state that none remain and name the inspected scope. Each finding must include evidence, impact, action, verification, and confidence; challenge the final set with the skeptic pass.
