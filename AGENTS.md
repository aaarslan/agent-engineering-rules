# Contributing to Agent Engineering Rules

This repository is the source of the rules, not a consumer of them. The corpus in `source/` is the single authority; `dist/` is generated output.

- Edit rule prose only in `source/`. Never hand-edit `dist/`; CI rejects distributions that differ from a fresh build.
- After any `source/` or manifest change, run `node tools/build-distributions.mjs` and commit `source/` and `dist/` together.
- Validate release changes before committing: `npm test && npm run validate`. Run `npm run validate:research` when research inputs change; it must remain provider-free.
- The mapping from source files to host layouts is the `MANIFEST` constant in `tools/build-distributions.mjs`. Change it there when adding or moving content.
- Keep rules short (validator-enforced budgets), one authority per rule, high-stakes rules first. Add rules only for observed or reproducible failures; remove rules that do not change behavior.
- Skill frames live in `source/skills/`; shared discipline is pulled in with `{{include:path}}` so no rule text is maintained twice.
- Compatibility, policy, and evaluation files under `source/` are repository-only research inputs. They must not appear in `dist/` or the published package payload unless a future release explicitly changes that contract.
- A behavior-expanding rule change requires a paired live evaluation under `docs/evaluation.md`, or an explicit changelog statement that no efficacy claim is made. CI must never receive provider credentials or execute live evaluation adapters.
- Record material behavior changes in [CHANGELOG.md](CHANGELOG.md), separating source-corpus changes from Claude-distribution and Codex-distribution changes.
- Platform claims in docs must be verified against current official Claude Code and Codex documentation and dated in `docs/capability-matrix.md`.
