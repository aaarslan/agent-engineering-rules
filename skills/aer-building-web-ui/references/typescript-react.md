<!-- Generated from source/shared/typescript-react.md by tools/render-v6.mjs -->
# TypeScript and React

Stack-specific guidance for types, state and ownership in an existing TypeScript or React project.

## TypeScript

- Avoid `any`. For external or untrusted data use `unknown` plus runtime validation (the repo's validator, e.g. zod) at the boundary, then typed values inward.
- Follow repository compiler policy; select strictness deliberately for a new TypeScript project. State relevant blind spots in the configured typecheck rather than treating a permissive pass as strong evidence.
- Prefer discriminated unions for multi-state behavior: `{ status: 'loading' } | { status: 'error'; error: E } | { status: 'success'; data: T }`.
- Keep API contracts type-safe: share or generate types between client and server where the repo supports it; otherwise verify compatibility of independently maintained contracts rather than forcing a new shared toolchain.
- Prefer `readonly` and narrow types at module boundaries; let inference work inside function bodies.

## React

- Keep server state, UI state, form state, URL state, and derived state conceptually separate. Use the repo's existing tool for each; avoid redundant mirrors. Drafts and optimistic projections can intentionally diverge; define reconciliation and failure behavior.
- Derive, don't store: if a value is computable from props or state, compute it during render instead of caching it in state.
- Avoid unnecessary `useEffect`. Effects synchronize with external systems; they are not the place for data transformation, event responses, or state derivation.
- Do not mirror props into state without a concrete reason (such as an explicitly uncontrolled "initial value" input).
- Keep substantial or shared policy under clear ownership. Simple presentation decisions can remain in JSX; extract logic for a concrete cohesion, reuse or verification benefit.
- Extract a hook only when it improves cohesion, testability, or real reuse, not to shorten a component.
- Use framework escaping for untrusted text; preserve drafts, focus, caret and selection across updates, and keyboard-exercise changed actions through their resulting state.
