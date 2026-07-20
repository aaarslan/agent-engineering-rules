---
scope: [any-code-change]
load_when: during and after any code change, before claiming completion
related: [skeptic-pass.md, ../quality/testing.md, ../core/evidence-first.md, ../profiles/prototype.md, ../profiles/standard.md, ../profiles/regulated.md]
---

# Verification

The active profile defines minimum assurance. Add gates for security, integrity, compatibility, accessibility, migrations, or performance as touched. Profiles never reduce correctness.

## Static rail during construction

Keep configured typecheck, incremental compile, and fast lint green while building. Do not run broad suites against incomplete scaffolding. A bug fix begins with one reproduction when practical, per [testing](../quality/testing.md).

## Dynamic rail at a complete seam

A seam is a finished feature slice, fix, or autonomous increment. Run applicable gates in order:

1. Exercise the changed behavior through its real entrypoint, including the most relevant failure case and keyboard behavior for UI. If unavailable, use the closest executable proxy and state the limitation.
2. Run or add targeted tests when required by the active profile and [testing](../quality/testing.md).
3. Run configured format, lint, typecheck, and aggregate checks. Do not invent tooling solely to fill a missing gate.
4. Build the runnable artifact. Run the broader suite for cross-cutting changes or when the profile or repository requires it.
5. Run migration, schema, generated-file, and contract checks when those artifacts changed; regenerate and inspect their diffs.
6. Run provided security and secret scans where relevant. Use this system's tools only on documented project types; inspect heuristic warnings.
7. Use shared or production systems only with explicit authorization. Local disposable environments need none.

Use repository-native commands, not remembered generic substitutes.

## Failed or unavailable gates

Collect useful output before editing. Diagnose, fix, then rerun the failed gate and earlier affected gates. A crash, timeout, missing prerequisite, empty or undispositioned flaky result, or skipped relevant gate is not a pass.

## Completion evidence

- Name each relevant command or manual exercise, exit status, and material outcome.
- State why an applicable gate could not run and what remains unverified.
- Meet the active profile's completion record.
- Finish with [skeptic-pass](skeptic-pass.md); route anything it finds back through implementation and verification.
