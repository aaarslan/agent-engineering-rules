# Agent Engineering Rules

Engineering rules and best practices for AI coding agents: Claude Code, OpenAI Codex CLI, IDE integrations, Codex Cloud, and any agent that reads repository instructions. Drop this directory into any codebase; the agent loads a small, task-matched slice of it and works to a higher standard.

## Install

See [INSTALL.md](INSTALL.md). The short version:

1. Copy this directory into your repository (for example as `agent-rules/`).
2. Paste the six-line block from INSTALL into your repository's `AGENTS.md`.
3. For Claude Code, add two import lines to your `CLAUDE.md` and, for guaranteed delivery, wire the included hook.

Codex-family agents need nothing beyond step 2.

## What's inside

| Area | Covers |
| --- | --- |
| `core/` | Priorities, evidence-first working, repository conventions, generated-code failure modes, honest reporting |
| `workflow/` | Implementation, verification gates, autonomous missions, review convergence, a final skeptic pass |
| `design/` and `architecture/` | Code structure, boundaries, types and state, error handling, system-level decisions |
| `quality/` | Testing, security, observability, performance |
| `contexts/` | Technology-specific guidance (web UI, TypeScript/React, backend APIs, databases), loaded only when relevant |
| `profiles/` | Prototype, standard, and regulated delivery levels |

[AGENTS.md](AGENTS.md) is the single router: agents read it, then load only the files their current task needs. Shared policy lives once in the canonical directories; correctness, security, and data integrity are non-negotiable in every profile. Repository-scoped skills for Codex live under `.agents/skills/`.

## Does it work?

This corpus was tested under a pre-registered, blinded protocol: three arms (no rules, this corpus, a minimal-kernel control), two agent surfaces, two independent grader families, 108 scored runs across six trap scenarios. The corpus passed 35/36 guardrail runs against 27/36 without rules (Fisher exact p = 0.014). The measured mechanism is concrete sentences reaching the model: rules like "reproduce the failure before editing" and "report each command with its exit status" corresponded directly with the conduct they name, and the delivery hook exists because measurement showed agents otherwise skip rule files entirely. Three suspected harms in the rules themselves were tested and rejected. Full methodology, raw findings, and honest limits live in the research repository: https://github.com/aaarslan/claude-rules

## Keeping it honest

`node tools/validate-system.mjs` checks every link, budget, and structure rule in this directory. These rules are advisory and behavior varies by model; anything that must never fail belongs in your linters, typecheckers, and CI, not in prose.

MIT licensed. See [LICENSE](LICENSE).
