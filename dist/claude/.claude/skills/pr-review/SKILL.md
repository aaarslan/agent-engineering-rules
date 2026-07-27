---
name: pr-review
description: Review a diff for evidence-backed correctness, security, integrity, and test risks. Use for review-only work; do not edit unless asked.
allowed-tools: Read, Grep, Glob, Bash
---

# PR Review

Review a diff without editing. Read relevant implementation beyond each hunk and inspect affected callers, contracts, tests, and prior decisions. Try to falsify every candidate finding with a reachable input or state; discard unsupported or preference-only comments. Do not modify code unless asked.

For multi-pass review loops or resolving reviewer comments, keep a decision ledger per `agent-rules/reference/review-ledger.md` and never reverse a prior decision without new evidence. For parallel specialist reviews, see `agent-rules/reference/orchestration.md`.

## PR Review

Every finding must be evidence-grounded. Producing a plausible-sounding false positive costs the author more time than finding nothing.

### Before reporting a finding

1. Read the relevant implementation, not just the diff hunk. Diffs lie by omission; the bug or its guard often sits just outside the context lines.
2. Attempt to falsify the finding: construct the concrete input or state that triggers it. If you cannot, downgrade confidence or drop it.
3. Check whether the current diff already addresses it elsewhere.
4. Check git history or comments for whether this is a deliberate, previously settled decision (see review-ledger).

### Finding format

- **Finding**: one sentence naming the concrete wrong behavior or failure scenario
- **Evidence**: file:line actually read, plus the reachable input or state
- **Severity**: impact-based, not attention-based
- **Why it matters**: the concrete user, system, security, or data consequence
- **Suggested action**: the smallest complete correction
- **Verification method**: how to prove the correction and prevent regression
- **Confidence**: high, medium, or low with uncertainty stated

Specialist subagents extend this format per orchestration.

### What to report

- Correctness, security, and data-integrity issues first, per priorities.
- Contract breaks: changed APIs, schemas, enums, or payloads with unupdated consumers.
- Missing regression tests for changed behavior.
- Real design problems: wrong layer, duplicated business rules, speculative abstraction.

### What not to report

- Style-only feedback, unless it affects correctness, consistency, maintainability, or repository conventions.
- Preferences dressed as defects. "I would have written it differently" is not a finding.
- Anything you did not verify. If a finding is later disproven, retract it clearly rather than going quiet.
- Discard any candidate that cannot support every field above; do not pad the review with speculation.

## Final Skeptic Pass

Before completion, switch roles: try to falsify your own work. Assume there is a defect and hunt for it. Re-read the full diff with fresh eyes.

### Hunt list

- False positives: findings or claims that do not survive re-reading the code
- Self-inflicted bugs introduced by the change itself
- Regressions in callers, siblings, or downstream consumers
- Duplicate code paths now implementing the same rule twice
- Inconsistent parsing or validation between entry points
- Drift: enums, schemas, contracts, generated files, localization, and docs that no longer match the code
- Missing tests for the changed behavior and its failure cases
- Dead code left behind (old paths, unused exports, stale flags, unreferenced scaffold/template files)
- A failure class guarded in one place but hit bare in another (the same resource accessed unguarded elsewhere)
- Failures surfaced only to the console: the user never learns, gets no recovery path, and the next write may destroy recoverable data
- Anything fabricated to satisfy a rule rather than a requirement (artificial delays, unreachable states, decorative structure)
- Logic placed in the wrong layer
- Unnecessary abstraction or overengineering that crept in
- Weak types or newly representable invalid states
- Hidden side effects or changed defaults
- Misleading success claims: anything reported as done that was not actually verified

### Rules

- Every item is a question to answer with evidence, not a box to tick.
- Anything found goes back through implementation and verification; do not hand-wave a late fix.
- If nothing is found, say what was checked. "Skeptic pass clean" without specifics is itself a misleading success claim.

## Completion

Finish with actionable findings ordered by severity, or state that none remain and name the inspected scope. Each finding must include evidence, impact, action, verification, and confidence; challenge the final set with the skeptic pass before reporting.
