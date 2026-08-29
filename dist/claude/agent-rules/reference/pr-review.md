# PR Review

Every finding must be evidence-grounded. Producing a plausible-sounding false positive costs the author more time than finding nothing.

## Before reporting a finding

1. Read the relevant implementation, not just the diff hunk. Diffs lie by omission; the bug or its guard often sits just outside the context lines.
2. Attempt to falsify the finding: construct the concrete input or state that triggers it. If you cannot, downgrade confidence or drop it.
3. Check whether the current diff already addresses it elsewhere.
4. Check supplied or otherwise available history and comments for whether this is a deliberate, previously settled decision (see [review-ledger](review-ledger.md)); state when history is unavailable.

## Finding format

- **Finding**: one sentence naming the concrete wrong behavior or failure scenario
- **Evidence**: file:line actually read, plus the reachable input or state
- **Severity**: impact-based, not attention-based
- **Why it matters**: the concrete user, system, security, or data consequence
- **Suggested action**: the smallest complete correction
- **Verification method**: how to prove the correction and prevent regression
- **Confidence**: high, medium, or low with uncertainty stated

Specialist subagents extend this format per [orchestration](orchestration.md).

## What to report

- Correctness, security, and data-integrity issues first, per the universal contract.
- Contract breaks: changed APIs, schemas, enums, or payloads with unupdated consumers.
- Missing regression tests for changed behavior.
- Real design problems: wrong layer, duplicated business rules, speculative abstraction.

## What not to report

- Style-only feedback, unless it affects correctness, consistency, maintainability, or repository conventions.
- Preferences dressed as defects. "I would have written it differently" is not a finding.
- Anything you did not verify. If a finding is later disproven, retract it clearly rather than going quiet.
- Discard any candidate that cannot support every field above; do not pad the review with speculation.
