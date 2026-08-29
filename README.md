# Agent Engineering Rules

Compact, evidence-first engineering rules for AI coding agents. One canonical corpus generates tested, project-scoped Claude Code and OpenAI Codex distributions.

The project is greenfield: there are no legacy aliases, migration hooks, compatibility profiles, or state-less adoption paths. Claude Code and Codex are the only supported hosts.

## Install in a project

Run the zero-dependency CLI against the repository you want to configure. It installs no global plugin or runtime service:

    npm exec --yes --package=github:aaarslan/agent-engineering-rules#<tag> -- aer init --host <claude|codex|both> --target <project>

Use an immutable release tag or commit instead of a moving branch. To pin the tool in a project's development dependencies instead:

    npm install --save-dev github:aaarslan/agent-engineering-rules#<tag>
    npm exec -- aer init --host <claude|codex|both>

The default profile is `standard`; fresh installs activate no stack contexts until selected. See [INSTALL.md](INSTALL.md) for `init`, `update`, `doctor`, `uninstall`, profiles, contexts, ownership, and recovery.

Plugins are not the delivery boundary. Codex supports repository marketplace discovery, but installed plugins still use a user cache/configuration, do not cover the IDE extension, and do not provide this project's cross-host root-file ownership contract. The CLI writes only to the explicit target and requires no account-wide or user-home configuration. A skills-only plugin can remain a future optional channel.

## Repository layout

| Path | Role |
| --- | --- |
| `source/kernel/` | Sole normative universal contract: 25 stable `AE-*` directives within the 90-line and 6 KiB budgets |
| `source/profiles/` | Prototype, standard, and high-assurance deltas |
| `source/skills/` | Ten canonical task skills, including namespaced verification and security review skills |
| `source/design/`, `source/quality/`, `source/contexts/`, `source/workflow/`, `source/agents/` | On-demand references and thin host route adapters |
| `source/compatibility/`, `source/policy/`, `source/evals/` | Repository-only research, policy, and evaluation inputs; never shipped to target projects |
| `dist/claude/`, `dist/codex/` | Generated host-native payloads; never edit by hand |
| `tools/` | Project CLI, deterministic build and validation, provider-free preflight, and explicitly gated live evaluation |
| `docs/` | Dated capability evidence and evaluation protocol |

After any `source/` or manifest change, run `node tools/build-distributions.mjs` and commit `source/` and `dist/` together.

## Runtime design

1. Always on: one compact contract and one active profile. Claude uses unscoped `.claude/rules/`; Codex receives the same authority once inside the managed root `AGENTS.md` block.
2. When selected: thin Claude path rules and Codex root pointers route relevant work to full stack references. Fresh installs select none; updates preserve the recorded selection.
3. On demand: task skills contain task-specific deltas. Design, quality, workflow, stack, and orchestration detail remains behind explicit references.

The 3,500-token product target uses `ceil(UTF-8 bytes / 4)` and bounds generated automatic instructions plus one selected skill. It excludes full references read later, host/user/nested instructions, other skills, tool context, history, and consumer customizations.

Static distributions are model-neutral. Reviewed model behavior and policy mappings guide research but add zero prompt bytes. Deterministic requirements remain consumer-owned permissions, sandboxes, hooks, schemas, tests, and CI; prose is not a security boundary.

## Evidence and limits

The predecessor corpus passed 35/36 guardrail runs versus 27/36 without rules in a preregistered 108-run study (Fisher exact p = 0.014). The compact corpus, delivery layout, and installer are material changes and do not inherit that efficacy result. Methodology and limitations: https://github.com/aaarslan/claude-rules

This repository includes provider-free fixtures and a dormant paired live A/B runner for `host-baseline` versus the installed `standard` profile. Live execution requires an explicit flag, environment opt-in, exact plan and adapter hashes, a non-expired authorization record, provider/model/call limits, and spend caps. CI never calls a model provider. Comparative claims still require representative paid-model and held-out evaluation. See [docs/evaluation.md](docs/evaluation.md).

## Validate

    npm test
    npm run validate
    npm pack --dry-run

The release path runs unit tests, public-content checks, source validation, a clean build, distribution validation, installer lifecycle checks, and Linux/Windows coverage. Research preflight runs separately and remains provider-free.

MIT licensed. See [LICENSE](LICENSE).
