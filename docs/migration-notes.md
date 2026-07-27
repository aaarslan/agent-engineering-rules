# Migrating from 1.x to 2.0

1.x delivered one router (`AGENTS.md`) plus a Claude injection hook. 2.0 delivers two generated native layouts from the same corpus. Rule prose is carried over; locations and mechanisms changed.

| 1.x concept | 2.0 location |
| --- | --- |
| Root `AGENTS.md` task router | Gone. Task routing is native skill selection; the routed file bundles became the skills' included content |
| `CLAUDE.md` import shim (`@AGENTS.md`) | `dist/claude/CLAUDE.md` (real root file; rules and skills load natively) |
| `core/*.md` (always/any-code-change) | `source/core/`; always-on: Claude `.claude/rules/core-*.md`, Codex inside `AGENTS.md` |
| `workflow/*.md` (routed per task) | `source/workflow/`; included into skill bodies at build time |
| `contexts/web-ui,typescript-react,backend-api` | `source/contexts/`; Claude path-scoped rules, Codex `agent-rules/reference/` |
| `contexts/database-migrations.md` | Included in the `database-change` skill (both hosts) |
| `contexts/pr-review.md` | Included in the `pr-review` skill and the Claude `code-reviewer` subagent |
| `contexts/documentation.md` | Included in the new `doc-update` skill |
| `contexts/ui-styling.md` | The new opt-in `ui-styling` skill |
| `profiles/*` | `source/profiles/`; active profile materialized into each host root, all three shipped under `agent-rules/profiles/` |
| `agents/orchestration.md`, `workflow/review-ledger.md`, design/quality concern files | `agent-rules/reference/`, read on demand when a skill or rule points there |
| `.agents/skills/*` thin adapters | Self-contained generated skills: Claude `.claude/skills/`, Codex `.agents/skills/` (location unchanged for Codex and still officially correct) |
| `tools/route-hook.mjs` + `UserPromptSubmit` wiring | Deprecated; `tools/legacy/route-hook.mjs` kept one transition cycle. Remove the hook block from `.claude/settings.json` when upgrading |
| `tools/validate-system.mjs` | Split into `tools/validate-source.mjs` and `tools/validate-distributions.mjs` |
| Frontmatter `scope` / `load_when` / `related` | Retained in `source/` as internal metadata only; generated outputs use each host's real schema (`paths`, `allowed-tools`, etc.) |

For existing 1.x installs: delete the copied 1.x directory and the hook block, then follow [INSTALL.md](INSTALL.md) for a clean 2.0 copy. The rules your agent follows will read the same; they arrive through native mechanisms instead of injection.
