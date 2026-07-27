---
name: refactor
description: Improve existing structure while preserving behavior. Use for behavior-preserving design work, not a new feature or defect correction.
---

# Refactor

Improve structure without changing behavior. Baseline existing tests, real-flow behavior, contracts, callers, and stored-data effects before editing. State the structural problem and the smallest improvement that resolves it. Preserve public behavior; add no generalized layer or interface without a current consumer or genuine boundary.

Read `agent-rules/reference/principles.md` before restructuring, and `agent-rules/reference/boundaries.md` when moving responsibilities between layers. For system-level restructuring, read `agent-rules/reference/decision-making.md`.

## Design Checkpoint

Before implementation, write a concise design assessment. For small changes this is a few lines; skip it only for trivial mechanical edits.

### Assessment

- Current behavior (evidence-based, with file references)
- Desired behavior
- Smallest safe change that fully achieves it
- Existing project pattern to follow
- Correct architectural layer for the change
- Invariants that must hold
- Type or data-model changes
- Error-handling strategy
- Security considerations
- Test strategy
- Compatibility risks (contracts, callers, stored data)
- What deliberately stays unchanged

### Self-check

Answer honestly before writing code:

- [ ] Is this the simplest viable solution, not just the first one found?
- [ ] Is the responsibility in the correct module or layer?
- [ ] Is every abstraction real (second consumer, genuine boundary, or testability need per principles), not speculative?
- [ ] Are business rules centralized, not duplicated?
- [ ] Are invalid states prevented where practical?
- [ ] Are errors explicit rather than swallowed or implied by null?
- [ ] Are side effects isolated from deterministic logic?
- [ ] Is it testable without excessive mocking?
- [ ] Does it preserve existing contracts?
- [ ] Does it match repository conventions?

A "no" on any item means redesign or an explicit, stated justification. Do not proceed silently.

## Verification

The active profile defines minimum assurance. Add gates for security, integrity, compatibility, accessibility, migrations, or performance as touched. Profiles never reduce correctness.

### Static rail during construction

Keep configured typecheck, incremental compile, and fast lint green while building. Do not run broad suites against incomplete scaffolding. A bug fix begins with one reproduction when practical, per testing.

### Dynamic rail at a complete seam

A seam is a finished feature slice, fix, or autonomous increment. Run applicable gates in order:

1. Exercise the changed behavior through its real entrypoint, including the most relevant failure case and keyboard behavior for UI. If unavailable, use the closest executable proxy and state the limitation.
2. Run or add targeted tests when required by the active profile and testing.
3. Run configured format, lint, typecheck, and aggregate checks. Do not invent tooling solely to fill a missing gate.
4. Build the runnable artifact. Run the broader suite for cross-cutting changes or when the profile or repository requires it.
5. Run migration, schema, generated-file, and contract checks when those artifacts changed; regenerate and inspect their diffs.
6. Run provided security and secret scans where relevant. Use this system's tools only on documented project types; inspect heuristic warnings.
7. Use shared or production systems only with explicit authorization. Local disposable environments need none.

Use repository-native commands, not remembered generic substitutes.

### Failed or unavailable gates

Collect useful output before editing. Diagnose, fix, then rerun the failed gate and earlier affected gates. A crash, timeout, missing prerequisite, empty or undispositioned flaky result, or skipped relevant gate is not a pass.

### Completion evidence

- Name each relevant command or manual exercise, exit status, and material outcome.
- State why an applicable gate could not run and what remains unverified.
- Meet the active profile's completion record.
- Finish with skeptic-pass; route anything it finds back through implementation and verification.

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

Finish only when before/after evidence proves preservation, applicable checks pass, callers and artifacts agree, the diff reduces the stated problem without unrelated redesign, and the skeptic pass finds no semantic drift, removed behavior, dead path, or hidden side-effect change.
