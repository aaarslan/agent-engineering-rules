# Changelog

## 2.0.0 - 2026-07-27

Delivery rewrite: one canonical corpus, two generated native distributions. Rule prose is carried over from 1.0.0 with minimal edits; what changed is how it reaches each agent.

Source corpus:

- Canonical corpus moved under `source/` (core, workflow, design, architecture, quality, contexts, profiles, agents).
- Nine self-contained skill frames in `source/skills/`: the seven 1.x task routes plus `doc-update` and `ui-styling`, composed from shared workflow files via `{{include:}}` so no rule text is maintained twice.
- Root router removed. The 1.x `AGENTS.md` task table is superseded by native skill selection; per-task file bundles are superseded by the three-tier load model (always-on, path-scoped, on-demand).

Claude Code distribution (`dist/claude/`):

- Native layout: short `CLAUDE.md`; core rules always-on in `.claude/rules/`; stack contexts as `paths:`-scoped rules; skills in `.claude/skills/` with `allowed-tools`, `paths`, and `disable-model-invocation` where appropriate; read-only `code-reviewer` subagent in `.claude/agents/`.
- The `@AGENTS.md` import shim and the `UserPromptSubmit` route hook are no longer part of any install path. `tools/route-hook.mjs` moved to `tools/legacy/` and is deprecated.

Codex distribution (`dist/codex/`):

- Native layout: short generated `AGENTS.md` (~10 KB against the 32 KiB `project_doc_max_bytes` default) with core rules, skill index, stack reference pointers, and the active profile; skills in `.agents/skills/`, the officially documented repo-scoped location.
- The 1.x thin skill adapters pointing back at the router are replaced by self-contained skills.

Tooling:

- `tools/build-distributions.mjs`: deterministic, dependency-free generator; the `MANIFEST` constant is the single source-to-host mapping.
- `tools/validate-source.mjs` replaces `validate-system.mjs`: frontmatter, include targets, links, budgets, manifest closure.
- `tools/validate-distributions.mjs`: rebuilds and requires byte-identical committed distributions; enforces skill frontmatter shape, the Codex root byte budget, and link integrity.
- CI workflow running both validators.

Docs:

- README, INSTALL, and ADOPT rewritten around the two native install paths; `docs/capability-matrix.md` records the dated platform capabilities this release was verified against; `docs/migration-notes.md` maps 1.x concepts to 2.0 locations.
- The 1.x measured-efficacy results describe the same rule prose under 1.x delivery; the 2.0 delivery change has not yet been separately evaluated and the README says so.

## 1.0.0 - 2026-07-19

First standalone release of the rules corpus as a drop-in directory.

- Canonical rules: priorities, evidence-first working, conventions, anti-slop, implementation, verification, skeptic pass, design and architecture guidance, testing, security, observability, performance, technology contexts, and three delivery profiles.
- Single task router (`AGENTS.md`), agent-driven adoption (`ADOPT.md`), thin Claude Code import (`CLAUDE.md`), and repository-scoped Codex skills.
- Mechanical delivery hook for Claude Code (`tools/route-hook.mjs`), added after measurement showed prose pointers under-deliver on that surface.
- Structural validator (`tools/validate-system.mjs`) enforcing links, budgets, and one-authority-per-rule.
- Rule prose is identical to the corpus frozen and evaluated in the research repository (https://github.com/aaarslan/claude-rules): 108 blinded runs, two agent surfaces, two grader families, corpus 35/36 vs no-rules 27/36.
