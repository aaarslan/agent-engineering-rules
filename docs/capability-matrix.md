# Platform capability matrix

Verified 2026-07-31 against official documentation and the Claude Code changelog (v2.1.220). Re-verify and re-date this table before each release; both platforms change quickly. Only capabilities this repository relies on are listed.

| Capability | Claude Code | Codex (CLI / IDE / app) | Used by this repo |
| --- | --- | --- | --- |
| Root instructions | `CLAUDE.md` (managed/user/project scopes); `@path` imports load eagerly, max depth 4; documented guidance: keep each file under ~200 lines | `AGENTS.md` chain: global (`~/.codex`), then project root down to CWD; one file per directory; `AGENTS.override.md` wins; ~32 KiB combined default (`project_doc_max_bytes`) | Short generated roots per host |
| Always-on project rules | `.claude/rules/*.md` without `paths:` load every session; discovered recursively in subdirectories; user-scope rules load before project rules, so project rules win conflicts | Content placed in `AGENTS.md` | Core rules |
| Path-scoped rules | `.claude/rules/*.md` with `paths:` glob frontmatter load when matching files are touched; budget ~1,000 expanded patterns / 4 MiB per rule; invalid patterns match nothing rather than break (v2.1.217); matching resolves through symlinks (v2.1.198) | Not a native mechanism; nearest equivalents are nested `AGENTS.override.md` or pointer lines | Stack contexts (Claude); reference pointers (Codex) |
| Skills | `.claude/skills/<name>/SKILL.md`; frontmatter: `name`, `description`, `when_to_use`, `argument-hint`, `arguments`, `allowed-tools`, `disallowed-tools`, `disable-model-invocation`, `user-invocable`, `model`, `effort`, `context: fork` (+ `agent`, `background`), `hooks`, `paths`, `shell`; `description` + `when_to_use` capped at ~1,536 chars in the listing; listing budget ~1% of context (`skillListingBudgetFraction`); nested `.claude/skills/` in subdirectories (v2.1.203); `disable-model-invocation: true` removes the description from context entirely | `.agents/skills/<name>/SKILL.md` repo-scoped (also `~/.agents/skills`, `/etc/codex/skills`); invoked `$name` or auto-selected; skills list capped at ~2% of context / 8,000 chars | Nine task skills per host from one source frame; `disallowed-tools` enforces the review-only contract on `pr-review` and `security-audit` |
| Subagents | `.claude/agents/*.md` with `name`, `description`, `tools`, `model` | Native subagents with parallel delegation | `code-reviewer` (Claude); prose orchestration reference (both) |
| Hooks | `command`, `http`, `prompt`, `mcp_tool`, `agent` types; PostToolUse JSON output supports `hookSpecificOutput.additionalContext`, `updatedToolOutput`, `decision`/`reason`; PostToolUse cannot block (tool already ran); `if` field narrows execution (e.g. `"if": "Edit(*.ts)"`); `InstructionsLoaded` event fires when CLAUDE.md or rules load | Documented hooks system | Optional `file-size-guard.py` (PostToolUse, advisory, opt-in via INSTALL.md) |
| Memory exclusions | `claudeMdExcludes` glob patterns in user, project, or local settings skip specific memory files; managed policy files cannot be excluded | Not applicable | Installer-driven reconciliation of overlapping user-scope rules (see the `aer` installer skill) |
| Rules distribution | Plugins bundle skills, agents, hooks, MCP/LSP servers, and settings — but NOT rules files; documented ladder for shared standards: copy into repo → symlinked shared rules directory → plugin; `enabledPlugins` in checked-in `.claude/settings.json` enables plugins per project | `AGENTS.md` + `.agents/skills` copied per repo | Copy-into-repo remains the correct mechanism for rules; a plugin cannot carry this corpus |
| Load verification | `/status`, `/context`, `/memory`, `/doctor` (skill-listing budget estimate) | `codex "List the instruction sources you loaded."` probe; `codex-tui.log` | INSTALL/ADOPT verify steps |
| Skill config | `.claude/settings.json`: `skillListingBudgetFraction`, `disableBundledSkills`, permissions | `[[skills.config]]` in `~/.codex/config.toml`; `project_doc_max_bytes`, `project_doc_fallback_filenames` | Documented in INSTALL |

Sources consulted (2026-07-31):

- https://code.claude.com/docs/en/memory
- https://code.claude.com/docs/en/skills
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/settings
- https://code.claude.com/docs/en/plugins
- https://raw.githubusercontent.com/anthropics/claude-code/refs/heads/main/CHANGELOG.md
- https://developers.openai.com/codex/skills
- https://developers.openai.com/codex/guides/agents-md

Known divergence worth tracking: earlier third-party research claimed Codex repo skills belong in `.codex/skills`; the official skills page documents `.agents/skills` for repository scope, with `~/.codex/config.toml` used only for configuration. This repository follows the official documentation.
