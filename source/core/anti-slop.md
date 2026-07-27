---
scope: [any-code-change]
load_when: writing or modifying any code
related: [../design/types-and-state.md, ../design/errors-and-side-effects.md, ../design/principles.md]
---

# Anti-Slop

Hard bans on the failure modes typical of generated code. These are not preferences.

## Structure

- No god classes, kitchen-sink modules, or vague `Manager` / `Handler` / `Processor` objects without one precise responsibility.
- No generic `utils` / `helpers` dumping grounds. A shared module needs a precise, nameable responsibility.
- No speculative abstractions. Every abstraction needs a current, concrete justification (second consumer, genuine boundary, or testability need); apply the abstraction test in [principles](../design/principles.md).
- No broad rewrites to solve narrow problems. No new architectural layers to fix a local bug.
- No duplicate implementations of the same business rule. One rule, one home.

## Types and data

- No boolean soup for mutually exclusive states. Use a discriminated union, enum, or explicit state model.
- No stringly typed domain logic where stronger types are practical.
- No `any` (or equivalent escape hatch) unless unavoidable, and then justified in place.
- No unexplained `null` / `undefined` standing in for a meaningful domain failure.

## Behavior

- No silent exception swallowing. Every caught error is handled, rethrown, or logged with context.
- No hidden mutation, magic defaults, or surprising side effects.
- No invented files, APIs, libraries, environment variables, schemas, or repository conventions. Verify existence before use.
- No new dependencies unless existing tools are insufficient and the tradeoff is stated.
- No comments compensating for confusing code; make the code clear instead. No dead code, no commented-out blocks, no bare TODOs without a tracking reference.
- No scaffold leftovers. In a generated project, sweep for starter modules, sample assets, demo pages, and unused favicons. Confirm each deletion against repository and framework reachability; unused-variable lint does not catch unused modules. `tools/slop-scan.sh` surfaces candidates but cannot prove they are unreachable.
- No fabricated behavior to satisfy a checklist: no artificial delays to make a spinner visible, no UI states or code paths the flow can never enter.
- No success claims without verification evidence.
