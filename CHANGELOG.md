# Changelog

## Unreleased

## 3.0.1 - 2026-08-29

Source corpus:

- No rule prose, profiles, contexts, compatibility inputs, policy inputs, or evaluation inputs changed. This release makes no efficacy claim.

Claude distribution:

- No generated Claude Code payload changed; project-local ownership, collision, recovery, and update behavior remains unchanged.

Codex distribution:

- No generated OpenAI Codex payload changed; the supported-host boundary and project-state schema remain unchanged.

Package and CLI distribution:

- Changed the package metadata from private `agent-engineering-rules` to public scoped `@aaarslan/aer` at version `3.0.1`, retained the zero-dependency `aer` executable and Node.js 24 minimum, and made public publication explicit.
- Made install-once global npm installation the primary CLI distribution path while keeping all generated content, markers, and ownership state inside the explicitly selected repository.
- Added exact installed-package version reporting, deterministic command-line help/error coverage, a complete provider-free prepublication gate, and a cross-platform packed-install smoke test using isolated npm prefixes and caches.
- Kept exact-version npm execution, a pinned development dependency, and the immutable GitHub-tag source form as reproducible alternatives. No telemetry, self-update behavior, install/post-install/download script, consumer CI, hook, service, daemon, account, global agent configuration, publication token, or automatic publishing workflow was added.

Documentation:

- Replaced the cumbersome GitHub-tag quick start with `npm install --global @aaarslan/aer` and separated CLI installation and upgrades from repository initialization, payload updates, diagnosis, and removal.
- Documented that `aer update` updates a managed repository with the installed CLI version rather than upgrading the CLI, and recommended a Node.js version manager instead of `sudo` for npm-prefix permission problems.

## 3.0.0 - 2026-08-29

Release hardening:

- Declared the public v3 package metadata and Node.js 24 minimum.
- Hardened CI triggers to validate pull requests and default-branch pushes without duplicate feature-branch runs.
- Added a security policy, contribution guidance, issue forms, pull-request template, citation metadata, and exact immutable-tag installation commands.

Source corpus:

- Replaced five always-on core files with one 25-directive, model-neutral contract using stable `AE-01` through `AE-25` ownership. The kernel is validated against 90-line and 6 KiB product budgets.
- Made design, verification, retries, delegation, cleanup, external authority, and long-run stopping proportional to scope and material risk. Generic final skeptic review and verifier subagents are no longer universal defaults.
- Rewrote task skills as ten canonical thin deltas without recursive workflow expansion. Namespaced `aer-security-review` and `aer-verify` preserve host-native command names; all compatibility aliases were removed.
- Reduced profiles to the canonical `prototype`, `standard`, and `high-assurance` set, with `standard` as the single declared default.
- Kept compatibility, policy, and evaluation inputs repository-only. They remain validated research authorities but are no longer copied into target distributions.
- Enforced thin context adapters mechanically: one heading, one routing paragraph, strict byte/line budgets, and no duplicated `AE-*` authority or composed rule prose.

Claude distribution:

- Generates one compact always-on contract rule, the selected profile, selected path-scoped pointers to full on-demand stack references, ten canonical skills, and explicit review skills that pass a bounded `$ARGUMENTS` packet to the `Read`/`Grep`/`Glob`-only `code-reviewer` fork.
- Keeps model-specific guidance out of the static prompt and reserves independent review for explicit or material high-assurance risk.

Codex distribution:

- Generates one compact root contract with the selected profile, selected on-demand stack pointers, and ten canonical skills.
- Validates the composed managed root against the 32 KiB project instruction default and simulates representative root-to-working-directory loads without injecting model-overlay text.

Tooling and documentation:

- Added the zero-dependency `aer` project CLI with `init`, `update`, read-only `doctor`, and ownership-safe `uninstall`. It is packaged for immutable GitHub/npm execution without a global install or runtime dependency.
- Made initialization strictly greenfield: pre-existing ledgers, markers, and even byte-identical unowned collisions are rejected. Removed frozen legacy inventories, migration artifacts, route hooks, aliases, and state-less adoption code.
- Upgraded the ownership ledger to schema 3 with portable managed-file/block hashes, root-boundary provenance, and pending old/new hashes. Git CRLF conversion no longer creates false drift; updates refuse substantive edits inside managed markers; uninstall first requires interrupted-update recovery and then restores missing, empty, blank, and unterminated host roots exactly.
- Retained cross-platform leases, collision and link preflight, mutation-time snapshot checks, atomic replacement, pending-hash recovery, UTF-8/BOM preservation, safe Claude customization handling, bounded retired-path authority, and Codex root/catalog checks.
- Hardened distribution builds before any output deletion: every source and recursive include must be a readable contained regular file without symlink traversal; portable destination validation rejects path escapes and Windows aliases; output roots are type-checked; and NFC/case-insensitive collision detection covers every generated path. Added Linux/Windows CI coverage and adversarial regressions for these boundaries.
- Reduced runtime simulation to 36 canonical, installed-marker-aware plans with exact active-profile and public-skill closure. The 3,500-token target excludes subsequent references and consumer/host context.
- Separated release validation from research preflight in CI. Both are provider-free; Linux and Windows release jobs use least-privilege permissions, timeouts, and concurrency cancellation.
- Added a dormant, paired and blinded `host-baseline` versus `standard` live A/B runner with randomized arm order, exact plan/adapter hash authorization, expiry, provider/model/call/spend caps, shell-free adapters, fake-only tests, and zero provider calls by default or in CI.
- The compact corpus and new delivery path make no efficacy claim until representative authorized live evaluation is completed; predecessor results are historical context only.
- Reworked README, INSTALL, and ADOPT around the greenfield project CLI and refreshed the official capability matrix on 2026-08-29.

## 2.1.0 - 2026-07-31

Delivery hardening against Claude Code capabilities re-verified 2026-07-31 (v2.1.220). Zero rule-prose changes; the evaluated corpus is untouched.

Claude Code distribution (`dist/claude/`):

- `pr-review` and `security-audit` skills added `disallowed-tools: Edit, Write, NotebookEdit`, blocking those direct edit tools for the invoking turn. Shell and other mutation paths remained available, so this was not a complete read-only boundary; the compact release corrects it with the custom reviewer tool allowlist above.
- New optional tool `agent-rules/tools/file-size-guard.py` (both distributions): an advisory PostToolUse hook that nudges decomposition when the agent grows a source file past a threshold (default 500 lines, `FILE_SIZE_GUARD_THRESHOLD` env override). Git-HEAD baseline, once-per-file-per-session, always exits 0. Opt-in wiring documented in INSTALL.md; nothing is added to any settings file by the build.

Docs:

- `docs/capability-matrix.md` re-verified and re-dated 2026-07-31: extended skill frontmatter (`disallowed-tools`, `user-invocable`, `when_to_use`, `context: fork`, and others), the ~1,536-char description listing cap and ~1% listing budget, recursive `.claude/rules/` and nested-skills discovery, `paths` pattern budgets and v2.1.217 glob fixes, documented `claudeMdExcludes`, and the finding that plugins cannot deliver rules files — which keeps this repository's copy-into-repo model the correct distribution mechanism for rules.
- INSTALL.md documents the optional size-guard wiring.

## 2.0.0 - 2026-07-27

Delivery rewrite: one canonical corpus, two generated native distributions. Rule prose is carried over from 1.0.0 with minimal edits; what changed is how it reaches each agent.

Source corpus:

- Canonical corpus moved under `source/` (core, workflow, design, architecture, quality, contexts, profiles, agents).
- Nine self-contained skill frames in `source/skills/`: the seven 1.x task routes plus `doc-update` and `ui-styling`, composed from shared workflow files via `{{include:}}` so no rule text is maintained twice.
- Root router removed. The 1.x `AGENTS.md` task table is superseded by native skill selection; per-task file bundles are superseded by the three-tier load model (always-on, path-scoped, on-demand).

Claude Code distribution (`dist/claude/`):

- Native layout: short `CLAUDE.md`; core rules always-on in `.claude/rules/`; stack contexts as `paths:`-scoped rules; skills in `.claude/skills/` with `allowed-tools`, `paths`, and `disable-model-invocation` where appropriate; read-only `code-reviewer` subagent in `.claude/agents/`.
- The `@AGENTS.md` import shim and the `UserPromptSubmit` route hook are no longer part of any install path. `tools/route-hook.mjs` moved to `tools/legacy/` and is deprecated.

Codex distribution (`dist/codex/`):

- Native layout: short generated `AGENTS.md` (~10 KB against the 32 KiB `project_doc_max_bytes` default) with core rules, skill index, stack reference pointers, and the active profile; skills in `.agents/skills/`, the officially documented repo-scoped location.
- The 1.x thin skill adapters pointing back at the router are replaced by self-contained skills.

Tooling:

- `tools/build-distributions.mjs`: deterministic, dependency-free generator; the `MANIFEST` constant is the single source-to-host mapping.
- `tools/validate-source.mjs` replaces `validate-system.mjs`: frontmatter, include targets, links, budgets, manifest closure.
- `tools/validate-distributions.mjs`: rebuilds and requires byte-identical committed distributions; enforces skill frontmatter shape, the Codex root byte budget, and link integrity.
- CI workflow running both validators.

Docs:

- README, INSTALL, and ADOPT rewritten around the two native install paths; `docs/capability-matrix.md` records the dated platform capabilities this release was verified against; `docs/migration-notes.md` maps 1.x concepts to 2.0 locations.
- The 1.x measured-efficacy results describe the same rule prose under 1.x delivery; the 2.0 delivery change has not yet been separately evaluated and the README says so.

## 1.0.0 - 2026-07-19

First standalone release of the rules corpus as a drop-in directory.

- Canonical rules: priorities, evidence-first working, conventions, anti-slop, implementation, verification, skeptic pass, design and architecture guidance, testing, security, observability, performance, technology contexts, and three delivery profiles.
- Single task router (`AGENTS.md`), agent-driven adoption (`ADOPT.md`), thin Claude Code import (`CLAUDE.md`), and repository-scoped Codex skills.
- Mechanical delivery hook for Claude Code (`tools/route-hook.mjs`), added after measurement showed prose pointers under-deliver on that surface.
- Structural validator (`tools/validate-system.mjs`) enforcing links, budgets, and one-authority-per-rule.
- Rule prose is identical to the corpus frozen and evaluated in the research repository (https://github.com/aaarslan/claude-rules): 108 blinded runs, two agent surfaces, two grader families, corpus 35/36 vs no-rules 27/36.
