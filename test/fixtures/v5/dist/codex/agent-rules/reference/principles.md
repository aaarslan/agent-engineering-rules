# Design Principles

Applied judgment, not ceremony. Every principle below yields to the universal contract.

- **KISS.** Prefer the simplest solution that satisfies the real requirement. Boring beats clever.
- **YAGNI.** Do not build extensibility, abstraction, configuration, or infrastructure for hypothetical future needs. Build for the requirement in front of you.
- **SOLID, selectively.** Apply single responsibility and dependency inversion where they earn their keep at real boundaries. Do not scaffold interfaces, factories, or hierarchies ceremonially.
- **High cohesion, low coupling.** Code that changes together lives together; code that changes independently stays independent.
- **Composition over inheritance.** Reach for inheritance only for genuine is-a relationships with stable base behavior.
- **Explicit dependencies.** Pass dependencies in; avoid hidden globals, singletons, and ambient state.
- **DRY, carefully.** One business rule has one owning home. Unify duplicated knowledge across consumers; incidental code similarity needs proven shared meaning before abstraction.
- **Optimize for the reader.** Readability and maintenance over cleverness. If a comment is needed to explain what code does, first try making the code clearer.
- **No premature optimization.** Correct and clear first; optimize with measurements. See [performance](performance.md).
- **Replacement is an option.** Compare patch, refactor, and replacement against real behavior, maintenance, migration, and recovery needs. Choose the coherent result; neither preserving a broken abstraction nor speculative rebuilding earns credit for its diff size.

## Abstraction test

Before introducing an interface, base class, wrapper, or layer, it must pass all three:

1. It has a concrete responsibility you can name in one sentence.
2. It has a real reason to exist now (second consumer, genuine boundary, testability need), not a projected one.
3. Removing it would make the code worse today.
