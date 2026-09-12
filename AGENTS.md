# Contributing to Agent Engineering Rules

This repository is the source of the rules, not a consumer of them. The corpus in `source/` is the single authority; `dist/` is generated output.

- Edit rule prose only in `source/`. Never hand-edit `dist/`; CI rejects distributions that differ from a fresh build.
- After any `source/` or manifest change, run `node tools/build-distributions.mjs` and commit `source/` and `dist/` together.
- Validate release changes before committing: `npm test && npm run validate`. Run `npm run validate:research` when research inputs change; it must remain provider-free.
- The mapping from source files to host layouts is the `MANIFEST` constant in `tools/manifest.mjs`. The builder and installer share it; change it there when adding or moving content.
- Runtime modules in `MANIFEST.tools` ship once at package root under `tools/`; the installer copies them through its ownership checks. Never emit duplicate runtime modules into `dist/`.
- Current tunable budgets belong in `source/config/thresholds.json` and are read through `requiredThreshold()` without numeric defaults. IDs, protocol statuses, mathematical constants and frozen historical measurements are not configurable thresholds.
- Enforce the complete kernel's physical-line and byte budgets, including metadata. Do not hide unconditional follow-on reading outside runtime-load accounting.
- Keep rules short (validator-enforced budgets), one authority per rule, high-stakes rules first. Add rules only for observed or reproducible failures; remove rules that do not change behavior.
- Skill frames live in `source/skills/`; shared discipline is pulled in with `{{include:path}}` so no rule text is maintained twice.
- Compatibility, policy, and evaluation files under `source/` are repository-only research inputs. They must not appear in `dist/` or the published package payload unless a future release explicitly changes that contract.
- Every research input needs a live validator consumer. Frozen historical bytes are checked by `source/evals/frozen-history.json`; never alter them to fit the current corpus or desired results. The grievance map establishes design traceability, not efficacy.
- Do not add provider dispatch, automatic project checks, completion-report grammar, hook state, or a mandatory verifier to the v5 runtime. Optional diagnostics require explicit selection and never certify completion.
- A behavior-expanding rule change requires a paired live evaluation under `docs/evaluation.md`, or an explicit changelog statement that no efficacy claim is made. CI must never receive provider credentials or execute live evaluation adapters.
- Record material behavior changes in [CHANGELOG.md](CHANGELOG.md), separating source-corpus changes from Claude-distribution and Codex-distribution changes.
- Record deviations and their concrete reasons in [docs/decisions/](docs/decisions/README.md); keep the changelog a concise release note.
- Platform claims in docs must be verified against current official Claude Code and Codex documentation and dated in `docs/capability-matrix.md`.
