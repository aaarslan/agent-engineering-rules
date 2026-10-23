# Errors and Side Effects

## Errors are part of the contract

- Handle expected failures (not found, validation, conflict, timeout) with typed errors or results the caller can act on. Fail fast on programmer errors such as broken invariants; do not hide them with defaults.
- Do not suppress material failures without explanation. Handle, propagate or expose them with actionable context. Deliberately ignored nonmaterial cleanup or optional failures may be justified by the contract.
- Use an explicit optional-result contract for ordinary absence when appropriate; distinguish material failure from absence when callers must react differently.
- Use one consistent error shape per surface (API responses, CLI exits, thrown types). Follow the repo's existing pattern.
- Attach operation, safe input identity, and cause when propagating. "Error: failed" is not actionable.

## Recovery paths

- Follow the product's recovery contract. Retry the failed operation when safe; retrying a load after a failed save can discard the user's change. Preserve unparseable data until deliberate recovery; do not invent a reset or overwrite recoverable data. Destructive recovery needs authorization.
- Guard a failure class everywhere the resource is touched: wrapping storage in one layer while boot or theme code calls it bare crashes before any UI exists.

## Isolate side effects

- Keep deterministic business logic pure where practical. Push network, storage, clock, randomness, logging, and external services to explicit edge call sites.
- Separate decisions from I/O when it clarifies responsibility or permits decisive verification; do not split a cohesive operation solely to add a layer or mock seam.
- Make side effects visible in the signature or name. No hidden writes or network calls. In-place argument mutation is valid when documented by the API contract and expected by callers.

Verify that every failure is handled or deliberately propagated, expected failures are testable, core decisions have useful verification, and no signature hides a write or external call.
