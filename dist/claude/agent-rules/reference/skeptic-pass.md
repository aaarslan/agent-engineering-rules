# Risk-Triggered Skeptic Review

Use this review when at least one trigger exists:

- material correctness, security, authorization, money, data-integrity, migration, irreversible-effect, or public-contract risk
- a broad or cross-cutting diff with an uncertain blast radius
- unresolved assumptions, conflicting evidence, a lower-confidence conclusion, or a changed design late in implementation
- an explicit request or a profile that requires independent or high-assurance review

Do not invoke it solely because a task is non-trivial or ending. For a localized low-risk change with direct evidence and passing applicable gates, ordinary diff inspection and verification are enough.

## Method

Try to falsify the risky or uncertain claims. Inspect the affected diff and its callers or consumers; re-read the full diff only when the trigger is cross-cutting. If independence is required, follow [orchestration](orchestration.md) instead of spawning a verifier to repeat work already evidenced by tests and tools.

## Hunt list

- False positives: findings or claims that do not survive re-reading the code
- Self-inflicted bugs introduced by the change itself
- Regressions in callers, siblings, or downstream consumers
- Duplicate code paths now implementing the same rule twice
- Inconsistent parsing or validation between entry points
- Drift: enums, schemas, contracts, generated files, localization, and docs that no longer match the code
- Missing tests for the changed behavior and its failure cases
- Dead paths, stubs, flags, or scaffold files introduced, superseded, or made unreachable within the affected surface
- A failure class guarded in one place but hit bare in another (the same resource accessed unguarded elsewhere)
- Failures surfaced only to the console: the user never learns, gets no recovery path, and the next write may destroy recoverable data
- Anything fabricated to satisfy a rule rather than a requirement (artificial delays, unreachable states, decorative structure)
- Logic placed in the wrong layer
- Unnecessary abstraction or overengineering that crept in
- Weak types or newly representable invalid states
- Hidden side effects or changed defaults
- Misleading success claims: anything reported as done that was not actually verified

## Rules

- Apply only the hunt items relevant to the trigger; this is not a checklist ceremony.
- Anything found goes back through [implementation](implementation.md) and [verification](verification.md); do not hand-wave a late fix.
- Record the trigger, inspected surface, evidence, and outcome. Do not claim a skeptic review when none was warranted or performed.
