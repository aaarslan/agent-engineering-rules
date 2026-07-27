# Tools

Dependency-free Node/shell scripts. Build and validation keep `source/` and `dist/` honest; the utilities support review.

| Script | Role |
| --- | --- |
| `build-distributions.mjs` | Generates `dist/claude/` and `dist/codex/` from `source/`. Deterministic; the exported `MANIFEST` constant is the single source-to-host mapping. Run after any source change and commit both. |
| `validate-source.mjs` | Validates the corpus: frontmatter shape, `{{include:}}` targets, relative links, line budgets, and that every source file is shipped by the manifest or allowlisted. |
| `validate-distributions.mjs` | Rebuilds into a temp dir and requires the committed `dist/` to match byte for byte, then enforces host contracts: skill frontmatter (name/dir match, description limits), the Codex `AGENTS.md` 32 KiB budget, no unresolved includes, no broken links. |
| `contrast-check.mjs` | Standalone WCAG contrast checker; shipped inside both distributions under `agent-rules/tools/`. |
| `slop-scan.sh` | Heuristic scaffold/slop scan for web/TypeScript projects; shipped inside both distributions. Warnings, not proof. |
| `legacy/route-hook.mjs` | Deprecated 1.x Claude `UserPromptSubmit` injection hook. Not part of any 2.0 install path; kept one transition cycle for old setups. Native rules and skills replace it. |

Result semantics for the utilities: deterministic failures exit non-zero; heuristic warnings exit zero and need inspection; sensitive touchpoints need contextual reasoning, not automation.

CI runs `validate-source.mjs` and `validate-distributions.mjs` on every push and pull request (`.github/workflows/validate.yml`).
