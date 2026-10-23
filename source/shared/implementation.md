# Implementation

## Rules

- Make the complete coherent change at the owning boundary. Use a larger refactor or replacement when evidence shows it removes the defect or structural debt; change size alone is neither a cost proxy nor a quality verdict.
- Follow sound repository conventions; repair a broken abstraction when the requested outcome requires it, without introducing a parallel convention.
- Place responsibilities according to current ownership and useful boundaries; do not force a universal layer structure.
- Preserve public contracts unless the task explicitly changes them. When changing one, update controlled affected consumers together and provide staged compatibility for consumers that cannot move atomically.
- At any trust boundary, validate inputs, authorize protected effects and protect secrets.
- Handle expected failures deliberately (typed errors, results, clear fallbacks). Fail fast and loudly for programmer errors.
- Keep business logic independently testable: pure where practical, side effects at the edges.
- Use a reproducer, acceptance example or focused test before or during implementation when it resolves uncertainty cheaply. Choose durable regression coverage by contract stability, exposure and failure cost; neither test-first nor test-last is universal.
- Update documentation only when behavior, architecture, setup, or contracts actually changed, and update everything the change invalidated.

## Scope discipline

- Stay on task and keep commits coherent; preserve unrelated user changes.
- Distinguish required affected-path engineering from new product scope or external commitments across affected callers and contracts. A complete fix is not a license for adjacent product work.
- If you discover an adjacent problem, note it in the final report instead of fixing it inline, unless it blocks the task.
- If mid-implementation evidence invalidates the chosen direct path or plan, revisit the affected owners, contracts and material tradeoffs rather than patching forward.
