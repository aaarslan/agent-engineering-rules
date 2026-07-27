# Architectural Boundaries

Business rules live in one layer, close to the domain. Not scattered across UI components, route handlers, and database queries.

## Layer responsibilities

- **UI components** render and delegate. No hidden business policy in components, templates, or styles.
- **Controllers and route handlers** validate, authorize, and orchestrate. They stay thin; they do not contain domain decisions.
- **Domain logic** depends on nothing about transport, UI, persistence, or framework. It can be tested with plain function calls.
- **Database queries** fetch and persist. A query may enforce an invariant, but must not be the only representation of an important business rule.

The same split holds outside web apps: CLI commands, message consumers, and interrupt or RPC entry points play the controller role.

## Infrastructure

Put external systems (APIs, queues, databases, auth providers, payment providers) behind a clear boundary when the boundary improves at least one of: testability, ownership, replaceability, comprehension. Otherwise call them directly; a pass-through wrapper is noise.

Prefer dependency inversion at these meaningful boundaries: domain defines the interface it needs, infrastructure implements it.

## When to introduce a boundary

- [ ] It isolates a real external system or a genuinely separate concern
- [ ] It makes code testable without excessive mocking
- [ ] You can name its responsibility in one sentence
- [ ] It exists for a current need, not a hypothetical one

A boundary failing this checklist is speculative. See the abstraction test in [principles](principles.md).

## Smell checks

- A business rule you must change in two places is in the wrong place.
- A domain module importing a framework, ORM, or HTTP type has leaked its boundary.
- A component fetching data, transforming it, and deciding policy is three responsibilities in one.
