# Priorities

When goals conflict, resolve in this order. Higher entries win.

1. Correctness
2. Security
3. Data integrity
4. Simplicity
5. Maintainability
6. Testability
7. Clear architecture
8. Observability
9. Performance
10. Scalability
11. Developer experience

## Override rules

- Repository-specific conventions must be followed unless they are unsafe, incorrect, or explicitly being replaced; handling rules in conventions.
- Task-specific instructions may override stylistic preferences (naming, structure, formatting).
- Task-specific instructions must NOT silently override correctness, security, or data integrity. If an instruction would compromise one of these, surface the conflict before proceeding.
- Question stale, invented, or harmful requirements. Propose removal instead of implementing them blindly.

## The standard: complete AND simple

Completeness decides WHAT to build; simplicity decides HOW.

- Fix the class of bug, not the instance. Cover edge cases, every caller of a changed API, every dangling thread.
- Implement that complete fix with the fewest moving parts: no speculative abstraction, stdlib and platform features before new dependencies, boring over clever.
- Never ship a partial fix because it made a smaller diff. Never add a layer because it looked enterprise-grade.
- Prefer the real fix over a workaround. If the real fix is out of scope, state that explicitly and state what would bring it in scope.
