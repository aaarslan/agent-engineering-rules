# Mechanical Tools

These scripts support review; they do not make advisory policy universally enforceable.

| Result | Meaning | Exit behavior |
| --- | --- | --- |
| Deterministic failure | Supported input proves an actionable condition | Non-zero |
| Heuristic warning | Text suggests risk but runtime semantics may disprove it | Zero; inspect |
| Manual review | A sensitive touchpoint needs contextual reasoning | Zero; disposition when relevant |

Invalid paths, missing prerequisites, crashes, and unusable output exit `2`. Tool failure is never a pass.

## `validate-system.mjs`

Run `node tools/validate-system.mjs`. It checks local Markdown links and anchors, canonical frontmatter, Codex skill metadata, empty directories, a 100-line ceiling for Markdown and scripts, and prompt-facing word budgets. Exit `1` means findings; `2` means the validator failed.

It does not validate external URLs, semantic contradictions, duplicate meaning, or model-specific skill triggering.

## `contrast-check.mjs`

Run `node tools/contrast-check.mjs <foreground> <background> [font-px] [bold]`. It supports opaque hex, numeric or percentage `rgb()`, and space-form `oklch()` without alpha. Exit `1` means the supplied pair misses its WCAG AA text threshold; `2` means invalid or unsupported input.

The tool clamps out-of-sRGB OKLCH values. It does not composite alpha, resolve CSS variables or backgrounds, or establish broader conformance.

## `route-hook.mjs`

Mechanical route delivery for Claude Code hosts, for models that skip routed files even with the router in context. A `UserPromptSubmit` hook classifies the prompt with coarse keywords (misses fall through to the Feature bundle, a superset), then injects the routed rule files' contents directly, chunked under the 10k-character context cap. Wire four entries in the host's `.claude/settings.json`, each running `node "$CLAUDE_PROJECT_DIR/<path>/tools/route-hook.mjs" <n>` for chunks 1 to 4, as one matcher group under `hooks.UserPromptSubmit`. Contexts and profile are taken from the host `AGENTS.md` declaration lines; greenfield prompts naming web/UI or TypeScript/React additionally inject the matching context file even when the host declares none. Codex hosts do not need it. Missing files and overflow are reported on stderr, never silently dropped.

## `slop-scan.sh`

Run `bash tools/slop-scan.sh <project-root>` for web/TypeScript projects with `src/` and optional `public/`.

All findings require review. Text search cannot prove framework routing, filename conventions, barrels, dynamic or generated imports, package exports, build splits, or asset pipelines. Orphan and dead-export candidates are not deletion instructions. Exit `0` means the scan completed, not that every candidate is safe or resolved.
