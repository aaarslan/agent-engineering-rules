# Changelog

## 1.0.0 - 2026-07-19

First standalone release of the rules corpus as a drop-in directory.

- Canonical rules: priorities, evidence-first working, conventions, anti-slop, implementation, verification, skeptic pass, design and architecture guidance, testing, security, observability, performance, technology contexts, and three delivery profiles.
- Single task router (`AGENTS.md`), agent-driven adoption (`ADOPT.md`), thin Claude Code import (`CLAUDE.md`), and repository-scoped Codex skills.
- Mechanical delivery hook for Claude Code (`tools/route-hook.mjs`), added after measurement showed prose pointers under-deliver on that surface.
- Structural validator (`tools/validate-system.mjs`) enforcing links, budgets, and one-authority-per-rule.
- Rule prose is identical to the corpus frozen and evaluated in the research repository (https://github.com/aaarslan/claude-rules): 108 blinded runs, two agent surfaces, two grader families, corpus 35/36 vs no-rules 27/36.
