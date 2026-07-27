# Platform capability matrix

Verified 2026-07-27 against official documentation. Re-verify and re-date this table before each release; both platforms change quickly. Only capabilities this repository relies on are listed.

| Capability | Claude Code | Codex (CLI / IDE / app) | Used by this repo |
| --- | --- | --- | --- |
| Root instructions | `CLAUDE.md` (managed/user/project scopes); `@path` imports load eagerly | `AGENTS.md` chain: global (`~/.codex`), then project root down to CWD; one file per directory; `AGENTS.override.md` wins; ~32 KiB combined default (`project_doc_max_bytes`) | Short generated roots per host |
| Always-on project rules | `.claude/rules/*.md` without frontmatter load every session | Content placed in `AGENTS.md` | Core rules |
| Path-scoped rules | `.claude/rules/*.md` with `paths:` glob frontmatter load when matching files are touched | Not a native mechanism; nearest equivalents are nested `AGENTS.override.md` or pointer lines | Stack contexts (Claude); reference pointers (Codex) |
| Skills | `.claude/skills/<name>/SKILL.md`; `name`, `description`, `allowed-tools`, `disable-model-invocation`, `paths`; invoked `/name` or auto-selected; custom commands merged into skills | `.agents/skills/<name>/SKILL.md` repo-scoped (also `~/.agents/skills`, `/etc/codex/skills`); invoked `$name` or auto-selected; skills list capped at ~2% of context / 8,000 chars | Nine task skills per host from one source frame |
| Subagents | `.claude/agents/*.md` with `name`, `description`, `tools`, `model` | Native subagents with parallel delegation | `code-reviewer` (Claude); prose orchestration reference (both) |
| Hooks | `command`, `http`, `prompt`, `mcp_tool`, `agent` types; `UserPromptSubmit` still supported | Documented hooks system | None at runtime (route hook deprecated) |
| Load verification | `/status`, `/context`, `/memory` | `codex "List the instruction sources you loaded."` probe; `codex-tui.log` | INSTALL/ADOPT verify steps |
| Skill config | `.claude/settings.json` (`skills` key, permissions) | `[[skills.config]]` in `~/.codex/config.toml`; `project_doc_max_bytes`, `project_doc_fallback_filenames` | Documented in INSTALL |

Sources consulted (2026-07-27):

- https://code.claude.com/docs/en/memory
- https://code.claude.com/docs/en/skills
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/settings
- https://developers.openai.com/codex/skills
- https://developers.openai.com/codex/guides/agents-md

Known divergence worth tracking: earlier third-party research claimed Codex repo skills belong in `.codex/skills`; the official skills page documents `.agents/skills` for repository scope, with `~/.codex/config.toml` used only for configuration. This repository follows the official documentation.
