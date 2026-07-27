# Agent Engineering Rules

Evidence-first engineering rules for AI coding agents, shipped as native distributions for Claude Code and OpenAI Codex. One canonical corpus in `source/`; a deterministic build generates a host-native layout for each agent so rules load through each platform's own mechanisms — always-on rules, path-scoped rules, and progressively disclosed skills — instead of a custom router injecting markdown.

## Install

See [INSTALL.md](INSTALL.md). The short version: copy `dist/claude/` or `dist/codex/` into your repository root. No hooks, no shims, no scripts required at runtime.

## What's inside

| Path | Role |
| --- | --- |
| `source/` | The single maintained corpus: core policy, workflow discipline, design and quality rules, stack contexts, delivery profiles, and skill frames |
| `dist/claude/` | Generated Claude Code distribution: `CLAUDE.md`, always-on and path-scoped rules in `.claude/rules/`, nine skills in `.claude/skills/`, a read-only `code-reviewer` subagent, and on-demand references |
| `dist/codex/` | Generated Codex distribution: a short `AGENTS.md`, nine skills in `.agents/skills/` (the officially documented repo-scoped location), and on-demand references |
| `tools/` | Deterministic build and validation scripts, plus standalone utilities (`contrast-check.mjs`, `slop-scan.sh`) |
| `docs/` | Dated capability matrix and migration notes |

Never edit `dist/` by hand. Edit `source/`, run `node tools/build-distributions.mjs`, and commit both. CI rejects distributions that do not match a fresh build.

## Design

Three load tiers, matched to how each host actually loads instructions:

1. **Always on** — priorities, evidence discipline, communication, conventions, anti-slop. Claude: individual files in `.claude/rules/`. Codex: concatenated into `AGENTS.md`, well under the 32 KiB default budget.
2. **When relevant** — stack contexts. Claude: `paths:`-scoped rules that load when matching files are touched. Codex: reference files pointed to from `AGENTS.md`.
3. **On demand** — task workflows as skills following the [Agent Skills](https://agentskills.io) standard, generated for both hosts from one frame; deeper design/quality references read only when a skill or rule points there.

Correctness, security, and data integrity are non-negotiable in every profile. Hard requirements belong in linters, typecheckers, tests, and CI; these rules are the judgment layer above that tooling.

## Does it work?

The 1.x corpus was tested under a pre-registered, blinded protocol: three arms, two agent surfaces, two grader families, 108 scored runs. The corpus passed 35/36 guardrail runs against 27/36 without rules (Fisher exact p = 0.014). The 2.0 rule prose is the same corpus re-delivered through native host mechanisms; the delivery change itself has not yet been separately evaluated. Methodology and limits: https://github.com/aaarslan/claude-rules

## Keeping it honest

`node tools/validate-source.mjs` checks frontmatter, includes, links, budgets, and manifest closure. `node tools/validate-distributions.mjs` rebuilds and requires byte-identical committed distributions, then enforces host contracts (skill frontmatter shape, the Codex root byte budget, no broken links). Both run in CI.

MIT licensed. See [LICENSE](LICENSE).
