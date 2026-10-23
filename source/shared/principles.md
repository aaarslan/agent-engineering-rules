# Design Principles

Choose the simplest complete solution within the requested scope and applicable instructions.

- Does each abstraction serve a named responsibility or real boundary now? Avoid hypothetical extensibility and pass-through wrappers.
- Does code that changes together have clear ownership? Unify duplicated knowledge with shared meaning, while leaving incidental similarity alone.
- Are dependencies and effects visible enough for callers to reason about them? Use the repository's established patterns where sound.
- Can a reader understand the decision and its failure behavior without reconstructing hidden state?
- Would a patch, refactor or replacement best preserve the required behavior? Compare maintenance, migration and recovery costs; diff size alone does not settle the choice.

Prefer clarity and cohesion over reciting design acronyms. Optimize performance against a requirement and evidence, not speculation.
