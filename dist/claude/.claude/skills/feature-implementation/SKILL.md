---
name: feature-implementation
description: Implement a new behavior end to end. Use for features and vertical slices, not localized defects, refactors, or review-only work.
---

# Feature Implementation

Implement the smallest complete vertical slice through the real entrypoint. Trace affected callers, contracts, schemas, generated artifacts, tests, and documentation before editing. Preserve existing boundaries and contracts unless the request changes them.

When the feature touches a concern below, read the matching reference before designing that part:

- Placement or layer crossings: `agent-rules/reference/boundaries.md`
- Data models or state: `agent-rules/reference/types-and-state.md`
- Failure handling or I/O: `agent-rules/reference/errors-and-side-effects.md`
- Untrusted input, auth, money, secrets, or privilege boundaries: `agent-rules/reference/security.md`
- New or judged tests: `agent-rules/reference/testing.md`
- Design structure decisions: `agent-rules/reference/principles.md`

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

## Implementation

### Rules

- Make the smallest safe change that fully solves the problem. Small means localized, not partial.
- Follow the existing naming, structure, and patterns of the surrounding code. See conventions.
- Place each responsibility in its correct architectural layer. See boundaries.
- Preserve public contracts unless the task explicitly changes them. When changing one, update every caller and consumer in the same change.
- At any trust boundary, apply the security non-negotiables.
- Handle expected failures deliberately (typed errors, results, clear fallbacks). Fail fast and loudly for programmer errors.
- Keep business logic independently testable: pure where practical, side effects at the edges.
- For bug fixes, reproduce the failure before editing; the reproduction becomes the regression test. All other test authoring comes after the build is complete; ordering and calibration in testing.
- Update documentation only when behavior, architecture, setup, or contracts actually changed, and update everything the change invalidated.

### Scope discipline

- Stay on task; the no-unrelated-cleanup and commit hygiene rules are in conventions.
- If you discover an adjacent problem, note it in the final report instead of fixing it inline, unless it blocks the task.
- If mid-implementation evidence invalidates the design, return to the design checkpoint rather than patching forward.

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

Finish only when the behavior and its most relevant failure path run for real, applicable tests and repository gates pass, affected artifacts agree, and the skeptic pass finds no unresolved regression, drift, dead path, or fabricated behavior.
