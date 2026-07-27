# Errors and Side Effects

## Errors are part of the contract

- Handle expected failures (not found, validation, conflict, timeout) with typed errors or results the caller can act on. Fail fast on programmer errors such as broken invariants; do not hide them with defaults.
- Never swallow exceptions. Every catch handles, rethrows with context, or logs with enough detail to act on. An empty catch block is a bug.
- Never return bare `null`/`undefined` to signal a meaningful domain failure. Name the failure.
- Use one consistent error shape per surface (API responses, CLI exits, thrown types). Follow the repo's existing pattern.
- Attach operation, safe input identity, and cause when propagating. "Error: failed" is not actionable.

## Recovery paths

- Every user-facing error offers a fitting recovery. Retry the exact failed operation; retrying a load after a failed save can discard the user's change. Unparseable data needs an explicit reset. Never retry an impossible operation or let a later write overwrite recoverable data.
- Guard a failure class everywhere the resource is touched: wrapping storage in one layer while boot or theme code calls it bare crashes before any UI exists.

## Isolate side effects

- Keep deterministic business logic pure where practical. Push network, storage, clock, randomness, logging, and external services to explicit edge call sites.
- A function that both computes a decision and performs I/O is two functions. Split it; the pure half becomes trivially testable.
- Make side effects visible in the signature or name. No hidden writes, hidden network calls, or mutation of arguments.

Verify that every failure is handled or deliberately propagated, expected failures are testable, core decisions run without mocks, and no signature hides a write or external call.
