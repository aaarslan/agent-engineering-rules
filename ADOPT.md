# Adopt Agent Engineering Rules

Agent-driven adoption: give your agent this file and let it wire the distribution into the host repository from evidence. Copy semantics: the generated files become the host's own; regenerate from a newer release to update.

## Integrate

1. Resolve the host root from VCS or the nearest directory owning manifests and build configuration; record ambiguity.
2. Identify the host agent. Claude Code uses `dist/claude/`; Codex surfaces use `dist/codex/`. Install both distributions when both agents are in use; they share `agent-rules/` content and do not conflict.
3. Copy the distribution into the host root: the `.claude/` or `.agents/` directory, the `agent-rules/` directory, and the root instruction file (`CLAUDE.md` or `AGENTS.md`). If the host already has a root instruction file, append the distribution root's contents instead of replacing, preserving existing instructions.
4. Inspect manifests, lockfiles, build files, and source directories. For Claude, edit the `paths:` globs in `.claude/rules/context-*.md` to match the host's actual layout, and delete context rules for stacks the host does not use. For Codex, delete unused stack references from `agent-rules/reference/` and their pointer lines in `AGENTS.md`.
5. Select one profile from evidence: an explicit host selection wins; otherwise default to standard. Never infer regulatory obligations from industry labels. For Claude, set `.claude/rules/profile.md`; for Codex, replace the profile section of `AGENTS.md`.
6. For an uncovered major stack, copy `source/contexts/_template.md` to a host-owned path, fill it from verified commands and APIs, and add it as a host-owned rule (Claude) or reference (Codex).
7. Use existing linters, typecheckers, hooks, or CI for hard requirements. Do not add infrastructure merely to complete adoption.

## Verify and report

- Claude Code: run `/status` and `/context`; confirm the core rules and profile loaded. Ask "Which engineering rules apply to a bug fix in this repo?" and confirm the answer reflects the installed skills and rules.
- Codex: run `codex --ask-for-approval never "List the instruction sources you loaded."` and confirm the root `AGENTS.md` appears.
- For supported web/TypeScript hosts, `bash agent-rules/tools/slop-scan.sh <host-root>` supplies warnings, not proof.

Report the host root, host agent(s), files copied, glob and profile decisions with evidence, deleted or added contexts, enforcement gaps, and unresolved uncertainty.
