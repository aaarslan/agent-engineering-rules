# Tools

The project CLI and all build, validation, and evaluation tools are dependency-free.

| Script | Role |
| --- | --- |
| `aer.mjs` | User-facing `init`, `update`, `doctor`, and `uninstall` CLI. Targets the current project by default, reports the installed package version, and emits stable exit codes and optional JSON diagnostics. |
| `install-distribution.mjs` | Ownership engine behind the CLI. Uses a target lease, portable managed-content hashes, root-boundary provenance, a pending recovery journal, byte-exact mutation snapshots, atomic replacement, bounded retired-path authority, safe customization handling, and Codex root/catalog preflight. |
| `aer.test.mjs`, `install-distribution.test.mjs` | CLI and lifecycle regressions for greenfield initialization, idempotent updates, drift diagnosis, uninstall, interruption recovery, collisions, concurrent changes, path/link safety, customization preservation, and size-preflight atomicity. |
| `build-distributions.mjs` | Deterministically generates `dist/claude/` and `dist/codex/` from `source/`. `MANIFEST` is the single source-to-host mapping; its `research` entries are validated but not emitted. |
| `build-distributions.test.mjs` | Build boundary, manifest, portable-path, collision, symlink, and thin-route regressions. |
| `validate-source.mjs` | Fast release-source gate for frontmatter, includes, links, budgets, manifest closure, canonical inventory, and thin route adapters. It does not execute research preflight. |
| `validate-runtime-loads.mjs` | Simulates 36 canonical Claude/Codex load plans, enforcing profile/skill closure, host caps, duplicate IDs, declared conflicts, and the 3,500-token generated-artifact target. |
| `validate-distributions.mjs` | Requires byte-identical output from a clean temporary build, enforces host/runtime contracts, and runs installer lifecycle tests. |
| `validate-public-content.mjs` | Rejects machine-specific home-directory paths while allowing explicit portable placeholders. |
| `packed-install-smoke.mjs` | Packs the public npm artifact, validates its closed manifest, installs it into an isolated temporary prefix and cache, and exercises the installed Linux/macOS executable or Windows command shim against temporary Git repositories. |
| `preflight-evals.mjs` | Separate, provider-free research gate for directives, scenarios, experiments, frozen cell plans, compatibility review windows, policy records, fixtures, graders, and run provenance. |
| `preflight-eval-harness.mjs` | Executes five synthetic task fixtures and graders in a contained, credential-scrubbed, loopback-only harness; mechanically closes 47 frozen cells without provider calls. |
| `preflight-evals.test.mjs` | Negative research regressions for registry, fixture, archive, authorization, spend, topology, evidence, and provenance boundaries. |
| `live-ab-eval.mjs` | Dormant paired `host-baseline` versus `standard` runner. Preparation and default execution are provider-free; live dispatch snapshots exact inputs and requests and requires every explicit authorization gate documented in `docs/evaluation.md`. |
| `live-ab-eval.test.mjs` | Uses only a fake adapter to test pairing, order randomization, blinding, hash authorization, frozen inputs, fresh workspaces, host-version evidence, environment filtering, runtime expiry/spend rejection, and credential-free archives. |
| `contrast-check.mjs` | Standalone WCAG contrast checker shipped under `agent-rules/tools/`. |
| `slop-scan.sh` | Heuristic web/TypeScript scaffold scan shipped under `agent-rules/tools/`; warnings are not proof. |
| `file-size-guard.py` | Optional advisory Claude hook shipped under `agent-rules/tools/`; never enabled automatically. |

Deterministic failures exit non-zero. Heuristic warnings require inspection, and sensitive behavior still requires contextual review.

The release workflow runs the packed-install smoke test on Linux and Windows. Research preflight is a separate CI job, and no CI job has provider credentials or permission to make live evaluation calls. `npm run release:check` runs the complete provider-free release-readiness suite; `prepublishOnly` invokes that gate before manual publication.
