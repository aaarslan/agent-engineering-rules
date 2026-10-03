# Agent Engineering Rules v6

AER supplies independently usable engineering skills, a compact project contract,
assurance profiles, and an ownership-aware project installer. `@aaarslan/aer` is
ESM, requires Node 24.0.0 or newer, and has no runtime dependencies.

The release separates mechanical safety, client controls, and model outcomes.
Isolated client-control probes do not establish model efficacy. See the dated
[capability matrix](docs/capability-matrix.md) and repository
[execution record](https://github.com/aaarslan/agent-engineering-rules/blob/main/docs/decisions/6.0.0-plan.md).

## Installation

Install the pinned CLI with Node 24.0.0 or newer. Preview project changes before
installing; the exercised recovery commands are in [INSTALL.md](INSTALL.md).
A floating version does not preserve treatment bytes.

```sh
npm install --global @aaarslan/aer@6.0.0
aer install --destination codex:.agents/skills --destination claude-code:.claude/skills --dry-run
aer install --destination codex:.agents/skills --destination claude-code:.claude/skills
aer check --json
aer uninstall --dry-run
```

Default: `portable:.agents/skills`, `AGENTS.md`, `standard`, all released skills.
The representation is explicit; a vendor-looking path does not select controls.
Portable copies use standard metadata. Codex adds invocation sidecars. Claude
Code adds manual invocation controls and a `Read, Grep, Glob` reviewer adapter
for the two review skills. The native review directories require that adapter;
they are a combined integration inventory, not portable standalone packages.
Arbitrary safe project-relative destinations remain available; client discovery
at a custom path requires separate configuration/inspection.

Later `install` retains omitted recorded selections. `--skills none` installs the
same kernel/profile and browser-conditional UI clause without owning skills.
Skills installed alone retain their own safety context and resources. AER does
not own skills delivered by another installer or plugin.

## Available skills

| Skill | Task | Integrated invocation |
|---|---|---|
| aer-implementing-features | Complete product behavior | Contextual |
| aer-fixing-bugs | Symptom, cause, correction, evidence | Contextual |
| aer-refactoring-code | Preserve behavior while changing structure | Contextual |
| aer-designing-code | Consequential boundaries and structure | Contextual |
| aer-changing-data | Data meaning, mixed versions and recovery | Contextual |
| aer-securing-code | Implement affected trust-boundary protections | Contextual |
| aer-reviewing-security | Bounded read-only security review | Manual |
| aer-verifying-work | Requested disputed claim or diagnostic | Manual |
| aer-reviewing-changes | Requested diff/branch/PR review | Manual |
| aer-writing-docs | Documentation against current evidence | Contextual |
| aer-building-web-ui | Browser interaction and styling | Contextual |
| aer-building-backend-apis | Endpoint and failure contracts | Contextual |
| aer-running-long-tasks | Explicitly delegated long work | Manual |

Portable descriptions request the same scope, but do not enforce invocation or
read-only tools. Explicit invocation uses the actual client's mechanism. Relevant
tasks can use multiple skills; none requires another skill or the kernel.

## Ownership and verification

`aer.lock.json` records package/source and representation identities, selections,
block ownership and complete file inventory. `check` compares sets and hashes and
never repairs. `packageMatch` compares the locally running package, not publisher
authenticity. Unowned identical collisions and modified owned material refuse.
Dry runs create no lock, state, directories or temporary files. A real operation
records a pending transaction before modifying payload; rerun with its recorded
request and creating package. Manual stale-lock recovery and retention are in
[INSTALL.md](INSTALL.md). Consumer bytes outside the managed block are preserved.

AER has no automatic hooks, telemetry, provider runner, background updater or
permission grants. Optional diagnostics run only when explicitly selected.
Plugins are deferred; no plugin manifest or marketplace package is advertised.
V5 detection is read-only and refuses mixed installations; use the tested pinned
[v5 exit path](INSTALL.md#leaving-v5).

Contributors: [repository guide](https://github.com/aaarslan/agent-engineering-rules/blob/main/CONTRIBUTING.md). Evidence and prepared offline
fixtures: [repository evaluation guide](https://github.com/aaarslan/agent-engineering-rules/blob/main/docs/evaluation.md). Security reporting:
[SECURITY.md](SECURITY.md).
