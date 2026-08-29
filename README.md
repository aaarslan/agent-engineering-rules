# Agent Engineering Rules

[![Validate](https://github.com/aaarslan/agent-engineering-rules/actions/workflows/validate.yml/badge.svg)](https://github.com/aaarslan/agent-engineering-rules/actions/workflows/validate.yml)
[![Latest release](https://img.shields.io/github/v/release/aaarslan/agent-engineering-rules)](https://github.com/aaarslan/agent-engineering-rules/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Compact, tested engineering rules for more reliable AI-assisted software development.**

Agent Engineering Rules (AER) installs a project-local, model-neutral engineering contract for Claude Code and OpenAI Codex. It adds bounded instructions, task-specific skills, and mechanical ownership checks without installing a daemon, global plugin, account-wide configuration, or runtime dependency.

## Quick start

Requirements: Node.js 24 or newer and a Git repository.

Preview a Claude Code installation:

```bash
npm exec --yes --package=github:aaarslan/agent-engineering-rules#v3.0.0 -- \
  aer init --host claude --target . --dry-run
```

Install after reviewing the preview:

```bash
npm exec --yes --package=github:aaarslan/agent-engineering-rules#v3.0.0 -- \
  aer init --host claude --target .
```

Use `--host codex` or `--host both` when those hosts are actually used by the project. The default profile is `standard`; fresh installations enable no stack contexts unless explicitly selected.

See [INSTALL.md](INSTALL.md) for initialization, updates, `doctor`, uninstall, profiles, contexts, ownership, and recovery.

## What AER changes

| Concern | AER behavior |
| --- | --- |
| Instruction loading | Installs one compact contract and an explicit active profile |
| Task guidance | Keeps task-specific detail behind ten on-demand skills |
| Host delivery | Generates native Claude Code and Codex project layouts from one canonical source |
| Existing files | Refuses unowned collisions and preserves content outside managed root markers |
| Updates | Changes only content proven by the project ledger to be AER-owned |
| Verification | Provides deterministic build, source, distribution, lifecycle, and research-preflight checks |
| Security boundary | Leaves permissions, sandboxes, hooks, tests, and CI under project-owner control |

AER does not silently create consumer CI, hooks, branch rules, services, accounts, or global configuration. Prose instructions are not represented as a substitute for deterministic enforcement.

## Runtime model

1. **Always loaded:** one compact universal contract and one selected profile.
2. **Conditionally routed:** thin host-native pointers for explicitly selected stack contexts.
3. **On demand:** task skills and full references for design, verification, security, databases, documentation, and autonomous work.

The product target bounds generated automatic instructions plus one selected skill to an estimated 3,500 tokens. Full references are loaded only when relevant.

## Supported hosts

| Host | Native project surface |
| --- | --- |
| Claude Code | `CLAUDE.md`, `.claude/rules/`, `.claude/skills/`, and a read-only review agent |
| OpenAI Codex | `AGENTS.md`, `.agents/skills/`, and on-demand references |

Unsupported hosts are not given compatibility aliases or implied support.

## Trust and safety

The zero-dependency installer validates repository boundaries, path safety, symbolic links, collisions, ownership hashes, concurrent changes, and interrupted updates before modifying managed content. `aer doctor` performs a read-only integrity inspection.

Report suspected vulnerabilities privately through GitHub's [security advisory form](https://github.com/aaarslan/agent-engineering-rules/security/advisories/new). Do not include credentials or sensitive project content in public issues. See [SECURITY.md](SECURITY.md).

## Evidence and limits

The predecessor corpus passed 35 of 36 guardrail runs versus 27 of 36 without rules in a preregistered 108-run study (Fisher exact `p = 0.014`). AER v3 materially changes the corpus, delivery layout, and installer and therefore does **not** inherit that efficacy result.

This repository contains provider-free fixtures and a dormant paired live A/B path. CI never calls a model provider. Comparative v3 claims require representative paid-model and held-out evaluation. See [docs/evaluation.md](docs/evaluation.md).

## Validate this repository

```bash
npm test
npm run validate
npm run validate:research
npm pack --dry-run
```

The release path covers Linux and Windows. Research preflight is provider-free and does not dispatch model calls.

## Repository structure

| Path | Authority |
| --- | --- |
| `source/kernel/` | Universal 25-directive engineering contract |
| `source/profiles/` | Prototype, standard, and high-assurance deltas |
| `source/skills/` | Ten canonical task skills |
| `source/contexts/` | Thin stack-context routes |
| `dist/claude/`, `dist/codex/` | Generated host-native payloads; never edit manually |
| `tools/` | CLI, deterministic generation, validation, and gated research utilities |
| `docs/` | Capability evidence and evaluation protocol |

After changing `source/` or its manifest, run `node tools/build-distributions.mjs` and commit the matching `dist/` output.

## Contributing

Small, evidence-backed improvements are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Use GitHub Discussions only for open design exploration once enabled; use issues for bounded defects and proposals.

MIT licensed. See [LICENSE](LICENSE).
