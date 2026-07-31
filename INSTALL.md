# Install

Copy one generated distribution into your repository root. Both are self-contained; nothing else is required at runtime.

## Claude Code

From this repository:

    cp -R dist/claude/agent-rules dist/claude/.claude <your-repo>/

Then either use `dist/claude/CLAUDE.md` as your repository's `CLAUDE.md` or append its contents to an existing one.

What you get, all through native mechanisms:

- `.claude/rules/core-*.md` — always loaded in every session
- `.claude/rules/context-*.md` — loaded only when files matching their `paths:` globs are touched; **adjust the globs to your repository's layout**
- `.claude/rules/profile.md` — the active delivery profile (standard by default; swap the body for `agent-rules/profiles/prototype.md` or `regulated.md`)
- `.claude/skills/*` — nine task skills, invoked as `/bug-fix` etc. or selected automatically by description
- `.claude/agents/code-reviewer.md` — read-only review subagent
- `agent-rules/` — on-demand references, profiles, and utility scripts

Verify: run `/status` and `/context` in a session to confirm the rules loaded, then ask "Which engineering rules apply to a bug fix in this repo?" — the answer should reflect these files, not generic advice.

### Optional: file-size decomposition guard

`agent-rules/tools/file-size-guard.py` turns the decomposition standard into a mechanical, advisory signal: a PostToolUse hook that nudges the agent when it grows a source file past 500 lines. It compares against the git HEAD baseline (editing an already-large file stays silent), fires at most once per file per session, and always exits 0 — it informs, never blocks. Requires `python3` on PATH.

To enable it for everyone who clones the repo, add to `.claude/settings.json`:

    {
      "hooks": {
        "PostToolUse": [
          {
            "matcher": "Edit|Write",
            "hooks": [
              {
                "type": "command",
                "command": "python3 \"$CLAUDE_PROJECT_DIR/agent-rules/tools/file-size-guard.py\"",
                "timeout": 15
              }
            ]
          }
        ]
      }
    }

Override the threshold per repository with an `env` entry in the same file, e.g. `"env": { "FILE_SIZE_GUARD_THRESHOLD": "800" }`. Skip this section if the same hook is already wired in your user-scope `~/.claude/settings.json`; running both is harmless but redundant.

## Codex (CLI, IDE extension, app)

From this repository:

    cp -R dist/codex/agent-rules dist/codex/.agents <your-repo>/

Then either use `dist/codex/AGENTS.md` as your repository's `AGENTS.md` or append its contents to an existing one.

What you get:

- `AGENTS.md` — always-loaded root rules, skill index, stack reference pointers, and the active profile (about 10 KB, well under the 32 KiB `project_doc_max_bytes` default)
- `.agents/skills/*` — nine task skills in the officially documented repo-scoped location, invoked as `$bug-fix` etc. or selected automatically by description
- `agent-rules/` — on-demand references, profiles, and utility scripts

Verify: run `codex --ask-for-approval never "List the instruction sources you loaded."` from your repository root. To disable a skill without deleting it, add a `[[skills.config]]` entry with `enabled = false` in `~/.codex/config.toml`.

## Agent-driven setup

Alternatively, tell your agent: "Adopt the rules in this repository per its ADOPT.md." See [ADOPT.md](ADOPT.md).

## Notes

- Nested instructions: for subdirectories that genuinely need different rules, use nested `CLAUDE.md` (Claude) or `AGENTS.override.md` (Codex). Do not duplicate the root rules there.
- The 1.x `UserPromptSubmit` route hook is deprecated and no longer part of any install path. It remains at `tools/legacy/route-hook.mjs` for older setups only; native rules and skills replace it.
- Updating: re-copy only the distribution-owned paths from a newer release, leaving everything else in your repository untouched. Distribution-owned: `agent-rules/`, `.claude/rules/core-*.md`, `.claude/rules/context-*.md`, `.claude/rules/profile.md`, the nine named skill directories under `.claude/skills/` or `.agents/skills/`, and `.claude/agents/code-reviewer.md`. Your own settings, rules, skills, agents, and commands under `.claude/` or `.agents/` are yours; never replace those directories wholesale. Re-apply your glob and profile edits after updating.
