# Agent Engineering Rules

One agent-neutral policy lives in `core/`, `workflow/`, `design/`, `architecture/`, `quality/`, `contexts/`, and `profiles/`. Load only what the current task needs.

## Route the task

1. Always read [priorities](core/priorities.md), [evidence first](core/evidence-first.md), and [communication](core/communication.md).
2. For code changes, also read [conventions](core/conventions.md) and [anti-slop](core/anti-slop.md). PR reviews add conventions, not anti-slop unless generated-code risks matter.
3. Select one profile: explicit project selection, then host instructions, then task instruction, otherwise [standard](profiles/standard.md).
4. Load the matching task row below and only [contexts](#contexts) supported by repository evidence.

Frontmatter `related` links are navigation only. They never load a file automatically or recursively. A directory reference never means “load the directory.” This table is the routing authority.

- **Change** = [implementation](workflow/implementation.md), [verification](workflow/verification.md), and [skeptic pass](workflow/skeptic-pass.md).
- **Design** = [design checkpoint](workflow/design-checkpoint.md) and [principles](design/principles.md).

| Task | Add to the routed baseline |
| --- | --- |
| Feature | Change + Design; add boundaries, types/state, errors, testing, or security only when that concern is touched |
| Bug fix | Change; add design checkpoint for non-trivial fixes, errors for failure/I/O, and testing for reproduction or regression protection |
| Autonomous mission | [autonomous execution](workflow/autonomous-execution.md); route each increment separately; add [orchestration](agents/orchestration.md) only when it materially helps |
| Specialist subagent | Orchestration plus only its role-specific files |
| PR review | [PR review](contexts/pr-review.md), [review ledger](workflow/review-ledger.md), skeptic pass; add security or testing only when the diff touches them |
| Review-comment resolution | Review ledger; add Change only when editing |
| Security audit | [security](quality/security.md), skeptic pass, and contexts for inspected boundaries |
| Database change | [database migrations](contexts/database-migrations.md), verification, skeptic pass; add security for trust boundaries |
| Refactor | Change + Design; add boundaries, types/state, errors, testing, or [architecture](architecture/decision-making.md) only when touched |
| Architecture decision | Architecture, principles, and [boundaries](design/boundaries.md) |
| Documentation | [documentation](contexts/documentation.md); add skeptic pass for material factual or compatibility claims |
| Adopt these rules | [ADOPT.md](ADOPT.md) and only host contexts selected from evidence |
| Logging/instrumentation | [observability](quality/observability.md), implementation, verification; add skeptic pass when non-trivial |
| Performance | [performance](quality/performance.md), verification; add skeptic pass when non-trivial |

Concern files: [boundaries](design/boundaries.md) for placement or layer crossings; [types/state](design/types-and-state.md) for models or state; [errors/side effects](design/errors-and-side-effects.md) for failure or I/O; [testing](quality/testing.md) when adding or judging tests; [security](quality/security.md) for untrusted input, authentication, authorization, money, secrets, external data, or privilege boundaries.

## Contexts

Load only those in play: [Web UI](contexts/web-ui.md), [UI styling](contexts/ui-styling.md) when no design system applies, [TypeScript/React](contexts/typescript-react.md), [backend/API](contexts/backend-api.md), [database/migrations](contexts/database-migrations.md), [PR review](contexts/pr-review.md), or [documentation](contexts/documentation.md).

Codex skills under `.agents/skills/` are thin task adapters to this router. They add no second policy set. When imported into a host repository, keep this directory read-only and follow [ADOPT.md](ADOPT.md).

## Maintain this system

- Keep each rule and supporting script at 100 lines or fewer and usually much shorter; put high-stakes rules first.
- Keep one authority per rule. Add rules only for observed or reproducible failures; remove rules that do not change behavior.
- Keep frontmatter keys consistent and links valid. Update this router when paths or load conditions change.
- Point hard requirements to deterministic enforcement; classify heuristic scans as warnings.
- Preserve agent neutrality, selective loading, and thin adapters. Record material behavior changes in [CHANGELOG.md](CHANGELOG.md).
