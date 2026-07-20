---
scope: [context]
load_when: working in TypeScript or React code
related: [../design/types-and-state.md, ../design/boundaries.md, web-ui.md]
---

# TypeScript and React

Extends [types-and-state](../design/types-and-state.md) and [boundaries](../design/boundaries.md) with stack specifics. For anything rendered in a browser, load [web-ui](web-ui.md) alongside this file.

## TypeScript

- Avoid `any`. For external or untrusted data use `unknown` plus runtime validation (the repo's validator, e.g. zod) at the boundary, then typed values inward.
- New or unconfigured projects get `"strict": true` in tsconfig (plus `noUncheckedIndexedAccess` where practical), with tests included in typechecking. A green typecheck under lenient flags is a weak gate.
- Prefer discriminated unions for multi-state behavior: `{ status: 'loading' } | { status: 'error'; error: E } | { status: 'success'; data: T }`.
- Keep API contracts type-safe: share or generate types between client and server where the repo supports it; never hand-maintain two copies of one shape.
- Prefer `readonly` and narrow types at module boundaries; let inference work inside function bodies.

## React

- Keep server state, UI state, form state, URL state, and derived state conceptually separate. Use the repo's existing tool for each; do not mirror server state into local state.
- Derive, don't store: if a value is computable from props or state, compute it during render instead of caching it in state.
- Avoid unnecessary `useEffect`. Effects synchronize with external systems; they are not the place for data transformation, event responses, or state derivation.
- Do not mirror props into state without a concrete reason (such as an explicitly uncontrolled "initial value" input).
- Keep business rules out of JSX. Components render decisions made elsewhere (hooks, domain functions).
- Extract a hook only when it improves cohesion, testability, or real reuse, not to shorten a component.
- Rendering safety, UI states, focus management, and accessibility are in [web-ui](web-ui.md); they apply to React unchanged.
