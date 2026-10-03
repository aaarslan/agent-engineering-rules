# Contributing to Agent Engineering Rules

This repository authors AER; it does not install its own consumer payload.

- Author contracts/profiles in `kernel/`, task bodies in `skills/*/SKILL.md`, and shared resources in `source/shared/`. Generated reference copies and marked UI/safety fragments are not separate wording authorities.
- Run `npm run build` after content/runtime/schema/integration changes; commit source and generated resources/inventory together. `npm run validate` checks freshness without repairing it.
- Validate release changes before committing: `npm test && npm run validate`. Run `npm run validate:research` when research inputs change; it must remain provider-free.
- Resource copy mapping is `tools/content-manifest.json`; client rendering/discovery data is `integrations/`. Runtime modules ship once under `src/`; diagnostics ship inside their standalone skills and run only by explicit selection.
- Current tunable budgets live in `kernel/thresholds.json` and are read through `requiredThreshold()` without numeric defaults. Protocol IDs/statuses and frozen historical measurements are not configurable thresholds.
- Enforce the complete kernel's physical-line and byte budgets, including metadata. Do not hide unconditional follow-on reading outside runtime-load accounting.
- Keep rules short (validator-enforced budgets), one authority per rule, high-stakes rules first. Add rules only for observed or reproducible failures; remove rules that do not change behavior.
- Canonical skills use standard frontmatter. Preserve manual-only metadata and the Claude restricted reviewer in explicitly selected native representations; descriptive instructions do not enforce permissions.
- `research/`, `evals/`, `test/` and repository tooling never enter the published payload. `research/evals/frozen-history.json` checks original historical bytes. Every live research input needs a validator consumer; traceability is not efficacy.
- Do not add provider dispatch, automatic checks, hooks/mods, telemetry, permission grants, a mandatory verifier or completion-report grammar.
- A behavior-expanding rule change requires a paired live evaluation under `docs/evaluation.md`, or an explicit changelog statement that no efficacy claim is made. CI must never receive provider credentials or execute live evaluation adapters.
- Record material behavior changes in [CHANGELOG.md](CHANGELOG.md), separating source-corpus changes from Claude-distribution and Codex-distribution changes.
- Record deviations and their concrete reasons in [docs/decisions/](docs/decisions/README.md); keep the changelog a concise release note.
- Platform claims in docs must be verified against current official Claude Code and Codex documentation and dated in `docs/capability-matrix.md`.
- Use `feature/` branches. Preserve the immutable v5 fixture and its regression assertions; test it in a disposable copy. No v6 cleanup adopts v5 ownership.
