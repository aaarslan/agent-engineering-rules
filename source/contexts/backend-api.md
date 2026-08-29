---
scope: [context]
load_when: working on API endpoints, services, or server-side code
related: [../quality/security.md, ../design/boundaries.md, ../design/errors-and-side-effects.md]
---

# Backend and API

Extends [security](../quality/security.md) and [boundaries](../design/boundaries.md) with server specifics.

## Boundaries

- Validate all input at the boundary; pass typed, validated values inward. Enforce authorization server-side per endpoint and per object.
- Keep route handlers to the thin role defined in [boundaries](../design/boundaries.md): validate, authorize, call domain logic, map the result to a response.
- Use consistent error formats across the API, following the repo's existing shape. Map expected failures to correct status codes; never leak stack traces or internals to clients.

## Data

- Use parameterized queries, always.
- Wrap multi-write operations that must stay consistent in a transaction. Ask of every handler: if this dies halfway, is stored state still valid?
- Avoid N+1 queries and unbounded responses: batch or join, paginate every list endpoint. See [performance](../quality/performance.md).

## External calls

- Every external call gets a timeout. No unbounded waits inside a request.
- Retry only when safe, bounded, and with backoff plus jitter. Anything retried must be idempotent; give state-changing operations idempotency keys where the pattern exists.
- Decide deliberately what happens when a dependency is down: fail, degrade, or queue. Do not let the default be "hang".

## Compatibility

- Preserve backward compatibility of routes, params, response shapes, and event payloads unless the task explicitly changes the contract. Additive changes are often lower-risk, but strict or generated consumers can still break; verify the affected contracts and consumers. Removals and type changes need a migration path.
- Update the API's contract artifacts (OpenAPI, generated clients, docs) in the same change that alters behavior.
