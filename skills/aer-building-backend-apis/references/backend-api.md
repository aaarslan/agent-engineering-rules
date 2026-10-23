<!-- Generated from source/shared/backend-api.md by tools/render-v6.mjs -->
# Backend and API

Server-specific guidance for the affected endpoints, authorization and data contracts.

## Boundaries

- Validate all input at the boundary; pass typed, validated values inward. Enforce authorization server-side per endpoint and per object.
- Follow repository ownership for validation, authorization and response mapping. Extract domain logic when it improves cohesion or verification; a small cohesive handler needs no forwarding layer.
- Use consistent error formats across the API, following the repo's existing shape. Map expected failures to correct status codes; never leak stack traces or internals to clients.

## Data

- Bind SQL data values. Select identifiers and keywords through controlled mappings or engine-supported quoting; they generally cannot be bind parameters.
- Wrap multi-write operations that must stay consistent in a transaction. Ask of every handler: if this dies halfway, is stored state still valid?
- Bound resource use according to data volume and the endpoint contract; address measured N+1 behavior through batching or joins. Add pagination when the contract and scale warrant it, not to bounded finite lists by habit.

## External calls

- Every external call gets a timeout. No unbounded waits inside a request.
- Retry with bounded attempts and evidence that replay is safe: idempotence, deduplication, or proof the original attempt did not apply. Treat ambiguous outcomes as potentially applied. Follow the provider's retry contract, including appropriate backoff and jitter.
- Decide deliberately what happens when a dependency is down: fail, degrade, or queue. Do not let the default be "hang".

## Compatibility

- Preserve backward compatibility of routes, params, response shapes, and event payloads unless the task explicitly changes the contract. Additive changes are often lower-risk, but strict or generated consumers can still break; verify the affected contracts and consumers. Removals and type changes need a migration path.
- Update the API's contract artifacts (OpenAPI, generated clients, docs) in the same change that alters behavior.
