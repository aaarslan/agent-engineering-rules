# Agent Engineering Rules

AER gives coding agents reusable guidance for completing engineering work: trace a
change through its real callers and state, preserve unrelated behavior, verify the
risks that matter, and report what the evidence actually supports.

Use an individual skill for a task, or install the project contract and the skills
together. Skills include their own safety context and local references; none
requires another skill. The contract supplies shared expectations across tasks.
AER is guidance, not a permission boundary or a certification of model output.

For example, invoking `aer-fixing-bugs` asks the agent to establish the failure,
repair its owning code, preserve affected contracts, and exercise the correction.
It does not ask for a new framework, an unrelated redesign, or a routine verifier
chain. In Codex, use `$aer-fixing-bugs`; in Claude Code, use `/aer-fixing-bugs`.

## Install the project contract and skills

The CLI requires Node 24.11.1 or newer and has no runtime dependencies. Preview
changes in the consumer project, then apply the same command:

```sh
npm install --global @aaarslan/aer@6.0.1
aer install --destination codex:.agents/skills --destination claude-code:.claude/skills --dry-run
aer install --destination codex:.agents/skills --destination claude-code:.claude/skills
aer check
```

This installs the contract in an owned `AGENTS.md` block and renders each client's
native invocation controls. If Claude Code prefers an existing `CLAUDE.md`, add
`@AGENTS.md` there after reviewing the import and check `/context`. For a
Claude-only project, the existing `--instructions-file .claude/rules/aer.md`
option delivers the same contract through an unconditional native rules file.
See [installation options](INSTALL.md) for single-client commands, profiles,
selection changes, upgrades and recovery.

## Install individual portable skills

The committed `skills/<name>/SKILL.md` directories can also be copied directly or
installed with the [generic skills CLI](https://github.com/vercel-labs/skills):

```sh
npx skills add aaarslan/agent-engineering-rules --skill aer-fixing-bugs
```

This channel supplies portable skill instructions and resources. It does not
install the project contract, Codex invocation sidecars, or Claude's restricted
reviewer adapter. In portable copies, explicit-only and read-only scope are
instructions rather than mechanically enforced controls. Use the AER CLI when
those native integration controls are needed. Each installer owns its own files;
use its removal/update command rather than asking another installer to adopt them.

## Choose guidance for the work

| Skill | Use it for | Native invocation |
|---|---|---|
| aer-implementing-features | New or changed product behavior | Contextual |
| aer-fixing-bugs | A reproduced or established failure | Contextual |
| aer-refactoring-code | A named structural problem; preserve behavior | Contextual |
| aer-designing-code | An unresolved consequential architectural decision | Contextual |
| aer-changing-data | Data meaning, mixed versions and recovery | Contextual |
| aer-securing-code | Trust boundaries implicated by the change | Contextual |
| aer-building-web-ui | Browser interaction and styling | Contextual |
| aer-building-backend-apis | Endpoint and failure contracts | Contextual |
| aer-writing-docs | Documentation against current behavior | Contextual |
| aer-reviewing-changes | A requested diff, branch or PR review | Manual |
| aer-reviewing-security | A requested bounded security review | Manual |
| aer-verifying-work | A requested disputed claim or diagnostic | Manual |
| aer-running-long-tasks | Explicitly delegated long work | Manual |

Several skills can support one task, such as an API feature with authorization
and a migration. Design and refactoring skills are not default companions to every
feature. Native manual routes require explicit invocation. Routing quality and
model adherence have not been measured.

The `standard` profile is the default for maintained work. `prototype` limits
permanent test infrastructure for disposable work; `high-assurance` asks for
stronger evidence where failures are costly. Apply the actual task's exposure and
risk within the repository profile; correctness and integrity always apply.

## Update, inspect and remove

Rerun `aer install` to update an existing installation. Omitted selections retain
the recorded profile, skills, destinations and instruction path. Version 6.0.1
recognizes the released 6.0.0 inventory and retires its unused reference copies.
Modified owned files and unowned collisions refuse changes; inspect and preserve
consumer edits before resolving them.

```sh
aer install --dry-run
aer install
aer check --json
aer uninstall --dry-run
aer uninstall
```

The ownership ledger and pending operation support interrupted updates without
losing consumer text outside the managed block. `--keep-modified` detaches and
reports retained material. [INSTALL.md](INSTALL.md) explains these paths and the
pinned v5 exit. AER has no automatic hooks, telemetry, background updater, provider
runner or permission grants. Diagnostics run only when explicitly selected.

## Evidence and contributing

Mechanical release checks exercise package contents, ownership, recovery and
standalone resources. Client probes establish only the named versions and tested
controls. AER makes no claim of better model outcomes or lower cost; current
behavioral fixtures and routing cases prepare future matched trials.
See the [capability matrix](docs/capability-matrix.md) and
[repository evaluation guide](https://github.com/aaarslan/agent-engineering-rules/blob/main/docs/evaluation.md).

Contributor guidance: [CONTRIBUTING.md](https://github.com/aaarslan/agent-engineering-rules/blob/main/CONTRIBUTING.md).
Security reporting: [SECURITY.md](SECURITY.md).
