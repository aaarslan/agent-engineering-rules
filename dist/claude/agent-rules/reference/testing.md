# Testing

The active profile decides which new tests are required. This file owns timing and quality.

## When

- For features, write profile-required tests after behavior and contracts stabilize. During construction, keep the static rail green instead of testing scaffolding repeatedly.
- For a bug fix, reproduce the failure before editing when practical. Keep the reproduction as regression protection when the active profile requires or permits it.
- Before a refactor, run the baseline and exercise the flow before and after. Add characterization coverage only when needed to prove preservation.
- Under prototype, a disposable mockup need not add durable test files, but it still needs usable evidence for the real requested workflow. Repository gates or material exposure, data, or regression risk can require durable coverage under AE-21. Under high assurance, map required tests and inspections to the profile's traceability record.

## What

- Test contracts and boundaries, not implementation details.
- One real end-to-end exercise of the changed flow outranks a pile of unit tests: it catches miswiring, invented APIs, and wrong-layer integration.
- Reserve unit tests for dense decisions: business rules, parsers, state machines, boundaries, and failure paths. Cover glue through the real-flow exercise.
- Boundary adapters are dense logic, not glue: test storage, serialization, and parsing failure paths (bad JSON, wrong shape, write failure), not just round-trips.
- Cover each material failure path through the strongest practical contract or real-flow exercise required by the profile.
- Prefer real objects. Heavy mocking signals poorly isolated side effects.

## Execution discipline

- Prefer targeted tests after stabilization; failures follow [verification](verification.md).
- Run the full suite when the change is cross-cutting, the active profile requires it, or the repository defines it as a completion gate. Re-run a green test only when a later fix could affect it.
- Use quiet, failures-only output where the runner supports it.
- Match the repo's framework and neighboring test patterns. Keep tests deterministic and independent.
