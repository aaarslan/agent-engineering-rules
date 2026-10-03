# Agent Engineering Rules

[![Validate](https://github.com/aaarslan/agent-engineering-rules/actions/workflows/validate.yml/badge.svg)](https://github.com/aaarslan/agent-engineering-rules/actions/workflows/validate.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Complete engineering, simple implementation, proportionate verification.**

AER installs a compact, model-neutral engineering contract for Claude Code and Codex in one selected repository. The contract asks agents to repair owning defects, preserve exact behavior, complete real integrations, supply missing technical judgment, and support completion claims with relevant evidence.

V5 succeeds v3.1.1 directly. V4 is skipped; its branch remains historical evidence. Read the [release notes](CHANGELOG.md), [review and implementation plan](docs/decisions/5.0.0-review-and-plan.md), and [grievance inventory](source/evals/grievances.json) for the requirements and decisions. V5 makes no general efficacy claim.

## Install

Use Node.js 24 or newer and a Git repository:

```bash
npm install --global @aaarslan/aer@5.0.0
aer init --host claude --target <project> --dry-run
aer init --host claude --target <project>
```

Select `codex` or `both` only when the project uses those hosts. The default assurance profile is `standard`; alternatives are `prototype` and `high-assurance`. No stack context is selected by default.

Global installation only makes the executable available. Managed content and ownership records stay in the selected project. From a source checkout, use `node tools/aer.mjs` instead of `aer`. See [INSTALL.md](INSTALL.md) for updates, profiles, contexts, collisions, recovery and uninstall.

Inspect the [installation walkthrough](docs/installation-walkthrough.md) for an
actual managed-block diff, an unowned collision refusal, a saved-edit recovery,
and the precise limits of `doctor`.

## Engineering contract

Completeness determines what must work; simplicity determines how it is built. A large refactor or subsystem replacement is appropriate when evidence supports it. Small patches, large diffs, added layers and test counts are not quality signals.

The kernel uses stable directives, normative strength, an explicit execution order and a completion predicate. It keeps universal responsibilities in the initial contract: ownership, exact input/output behavior, lifecycle, authorization, secrets, data integrity, migration, recovery, accessibility and operations. User product constraints remain authoritative; proposed mechanisms still require engineering judgment.

| Layer | Purpose |
| --- | --- |
| Kernel | Always-active engineering obligations and completion conditions |
| Assurance profile | Evidence investment suited to lifespan, exposure, contract stability and failure cost |
| Task skill | Concern-specific guidance when the task calls for it |
| Reference | Design, security, data, UI or verification detail read only when relevant |
| Optional diagnostic | A selected calculation or heuristic with a bounded, explicit result |

Every implementation needs enough evidence of its real behavior. It does not automatically need permanent test infrastructure. Durable coverage protects stable contracts; relevant production regressions and repository gates still apply. Reuse passing evidence unless a change or unresolved concern invalidates it.

Completion requires working behavior, coherent consumers and artifacts, relevant evidence, and honest limits. Reports distinguish direct exercises, regression coverage, existing checks and material omissions. V5 imposes no report parser, mandatory verifier run, command ledger, automatic broad-suite loop or hook-based completion gate.

## Optional diagnostics

`aer verify` selects one diagnostic; it neither runs a project test suite nor certifies completion:

```bash
aer verify contrast '#ffffff' '#000000'
aer verify slop --root <project>
aer verify size --check <file>
```

After installation, the equivalent entrypoint is `node agent-rules/tools/aer-verify.mjs <check> <args>`. Contrast checks only supplied opaque color pairs; slop and size findings require contextual review. See [the diagnostic contracts](INSTALL.md#optional-diagnostics).

## Delivery and trust

Claude receives a managed `CLAUDE.md` block, native rules and skills, and an optional read-only reviewer. Codex receives a managed `AGENTS.md` block and native skills. Both receive on-demand references and diagnostic files. [Current host documentation](docs/capability-matrix.md) supports the layouts; installation is not proof of model adherence.

The dependency-free installer checks boundaries, symbolic links, collisions, ownership hashes and interrupted updates. It preserves consumer-owned text and configuration. `aer doctor` inspects integrity without repair. AER does not install permissions, hooks, consumer CI, global agent settings, services or accounts; prose is not a security boundary.

## Evidence and contribution

[Evaluation policy](docs/evaluation.md) distinguishes structural checks, historical outcomes and future paid research. Frozen history remains intact. The dormant execution harnesses are removed, and CI never dispatches a provider.

The [evidence-bundle workflow](docs/evidence/README.md) helps an explicitly authorized
study owner freeze a reviewed protocol and validate imported records. It exposes
missing evidence and unsuccessful attempts without generating benchmark scores.
It is repository-only; no new study or general efficacy result is claimed.

Run the provider-free release gate at a meaningful integration boundary:

```bash
npm run release:check
```

Edit rules in `source/`, update the shared `MANIFEST` in `tools/manifest.mjs` when paths change, and regenerate `dist/` with `node tools/build-distributions.mjs`. Runtime tools ship once at package root; the installer copies the required files into the selected project.

See [CONTRIBUTING.md](CONTRIBUTING.md), [AGENTS.md](AGENTS.md), [CHANGELOG.md](CHANGELOG.md), and [tools/README.md](tools/README.md). Report vulnerabilities through the private [security advisory form](https://github.com/aaarslan/agent-engineering-rules/security/advisories/new). MIT licensed.
