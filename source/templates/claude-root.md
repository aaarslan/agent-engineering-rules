# Engineering rules for Claude Code

The contract and profile load from `.claude/rules/`; stack rules are path-scoped. Task deltas load from `.claude/skills/` when invoked or selected by description.

`/autonomous-mission` is explicit-only for a broad objective.

Invoke `/pr-review` only with changed paths and the complete diff for that bounded path scope; invoke `/aer-security-review` with a trust boundary and entrypoints. They fork into `.claude/agents/code-reviewer` without conversation history and with only `Read`, `Grep`, and `Glob`; never use one to repeat routine checks. Use `/aer-verify` for the explicit risk-triggered workflow; the native `/verify` remains available.

Read `agent-rules/reference/` only when a skill or touched concern calls for it. Put hard requirements in permissions, sandboxes, hooks, schemas, tests, and CI—not prose.

User and project instructions override style preferences; they cannot silently override correctness, security, or integrity. Surface conflicts.
