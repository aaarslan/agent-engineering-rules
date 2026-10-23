# PR Review

Every finding must be evidence-grounded. Producing a plausible-sounding false positive costs the author more time than finding nothing.

## Before reporting a finding

1. Read the relevant implementation, not just the diff hunk. Diffs lie by omission; the bug or its guard often sits just outside the context lines.
2. Attempt to falsify the finding: construct the concrete input or state that triggers it. If you cannot, downgrade confidence or drop it.
3. Check whether the current diff already addresses it elsewhere.
4. Check supplied or otherwise available history and comments for whether this is a deliberate, previously settled decision; state when history is unavailable.

## Reporting findings

Explain the concrete wrong behavior, reachable input or state, inspected evidence, consequence and bounded correction. Include severity, verification and confidence when they help the reader assess it. Use concise prose or the repository's requested format; no seven-section template is required for every observation.

Give authorized specialists a bounded scope and reuse their inspectable evidence.

## What to report

- Correctness, security, and data-integrity issues first.
- Contract breaks: changed APIs, schemas, enums, or payloads with unupdated consumers.
- Missing behavioral evidence or risk-justified regression protection.
- Real design problems: wrong layer, duplicated business rules, speculative abstraction.

## What not to report

- Style-only feedback, unless it affects correctness, consistency, maintainability, or repository conventions.
- Preferences dressed as defects. "I would have written it differently" is not a finding.
- Anything you did not verify. If a finding is later disproven, retract it clearly rather than going quiet.
- Discard unsupported candidates; distinguish material unconfirmed concerns from established defects. Do not pad the review with speculation.
