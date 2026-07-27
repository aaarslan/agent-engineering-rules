# Engineering rules for Claude Code

Always-active engineering rules load from `.claude/rules/` (core rules unconditionally, stack rules when matching files are touched). Task-specific workflows are skills; invoke them directly or let Claude select them by description:

/feature-implementation, /bug-fix, /refactor, /pr-review, /database-change, /security-audit, /autonomous-mission, /doc-update, /ui-styling

For review-only passes, the `code-reviewer` subagent in `.claude/agents/` reviews without edit access.

Deeper design, quality, and orchestration references live in `agent-rules/reference/`; read them when a skill or rule points there. Hard requirements belong in linters, typecheckers, tests, hooks, and CI, not in prose.

User and project instructions override stylistic preferences in these rules. They must not silently override correctness, security, or data integrity; surface the conflict instead.
