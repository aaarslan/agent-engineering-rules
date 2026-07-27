---
scope: [routed]
load_when: designing or reviewing code structure
related: [boundaries.md, ../architecture/decision-making.md, ../core/anti-slop.md]
---

# Design Principles

Applied judgment, not ceremony. Every principle below yields to [priorities](../core/priorities.md).

- **KISS.** Prefer the simplest solution that satisfies the real requirement. Boring beats clever.
- **YAGNI.** Do not build extensibility, abstraction, configuration, or infrastructure for hypothetical future needs. Build for the requirement in front of you.
- **SOLID, selectively.** Apply single responsibility and dependency inversion where they earn their keep at real boundaries. Do not scaffold interfaces, factories, or hierarchies ceremonially.
- **High cohesion, low coupling.** Code that changes together lives together; code that changes independently stays independent.
- **Composition over inheritance.** Reach for inheritance only for genuine is-a relationships with stable base behavior.
- **Explicit dependencies.** Pass dependencies in; avoid hidden globals, singletons, and ambient state.
- **DRY, carefully.** Deduplicate knowledge (business rules, constants, schemas), not incidental similarity. Prefer small duplication over the wrong abstraction; extract on the second or third real repetition, when the shared shape is proven.
- **Optimize for the reader.** Readability and maintenance over cleverness. If a comment is needed to explain what code does, first try making the code clearer.
- **No premature optimization.** Correct and clear first; optimize with measurements. See [performance](../quality/performance.md).

## Abstraction test

Before introducing an interface, base class, wrapper, or layer, it must pass all three:

1. It has a concrete responsibility you can name in one sentence.
2. It has a real reason to exist now (second consumer, genuine boundary, testability need), not a projected one.
3. Removing it would make the code worse today.
