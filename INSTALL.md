# Install, inspect and recover

## Exercise the unpublished artifact

From the AER checkout with Node 24.0.0 or newer:

```sh
npm run build
npm run release:check
npm pack --ignore-scripts --pack-destination /path/to/disposable-artifacts
npm install --global --prefix /path/to/disposable-prefix --ignore-scripts --no-audit --no-fund /path/to/disposable-artifacts/aaarslan-aer-6.0.0.tgz
```

Use the prefix's `bin/aer` on POSIX or `aer.cmd` on Windows. The packed smoke also
executes the installed `src/cli.mjs` with the tested Node executable. Targets must
already exist. Test in disposable consumers, never the AER checkout or a global
agent configuration. Installation does not execute lifecycle scripts or skills.
Registry examples below assume a separately authorized publication and version pin.

## Direct representations

```sh
aer install --target /path/to/consumer --destination codex:.agents/skills --destination claude-code:.claude/skills --instructions-file AGENTS.md --dry-run --json
aer install --target /path/to/consumer --destination codex:.agents/skills --destination claude-code:.claude/skills --instructions-file AGENTS.md
aer check --target /path/to/consumer --json
```

`portable` copies standard skill directories. `codex` adds `agents/openai.yaml`
with `allow_implicit_invocation: false` for manual routes. `claude-code` renders
`disable-model-invocation: true`; both review routes bind a fork to the installed
`.claude/agents/aer-code-reviewer.md` with `Read, Grep, Glob` only. This resource is
visible in previews and collision checked. Installed engineering body bytes are
the same across representations. Native controls are documented by the clients;
final-session invocation and available-tool probes remain separate release gates.

AER does not edit `CLAUDE.md` or private settings automatically. When your actual
Claude setup prefers `CLAUDE.md`, explicitly review adding `@AGENTS.md` there and
inspect `/context` in a fresh session. Inspect ancestors/nested files and memory,
including whether the contract loads once. Custom destinations are installable,
but their discovery is not certified by their directory name. See
[capability limits](docs/capability-matrix.md).

## Changes and uninstall

```sh
aer install --profile high-assurance --skills aer-implementing-features,aer-reviewing-changes --dry-run
aer install --instructions-file docs/engineering.md --destination portable:team-skills --dry-run
aer uninstall --dry-run --json
aer uninstall
aer uninstall --keep-modified --json
```

Execute a reviewed selection change by repeating it without `--dry-run`.
Omitted settings retain the validated ledger. Instruction-file changes move the
owned block and remove it from the former file, preserving outside text. Changed
skills/representations retire only recognized owned resources. Case aliases,
overlapping destinations, reserved names, symlinks and hard links refuse.
Shared destination directories may contain consumer files outside managed skill
roots; AER preserves them. Unexpected files within an owned skill are drift.

Ordinary uninstall preflights every conflict. `--keep-modified` preserves and
reports modified blocks/files and additional consumer files, then detaches their
ownership. They may still affect a client session until the owner deliberately
removes or relocates them. AER never deletes them on an eventual reinstall.
Text ownership normalizes CRLF/LF only on declared UTF-8 resources; binary assets
hash exactly. Mutation guards always compare exact bytes and file identity.

## Interrupted operations

`aer.lock.json` schema 1 is independent of package version. Stable and pending
states are described in the repository
[execution record](https://github.com/aaarslan/agent-engineering-rules/blob/main/docs/decisions/6.0.0-plan.md).
Exit 3 means preflight refusal with no consumer payload/state changes. Exit 4
means invalid state or I/O/concurrency failure, possibly after partial changes.
An install/update/uninstall may be interrupted after any per-file operation.
Run `check --json`; inspect the pending kind and desired selection; rerun the same
operation using its creating package. Do not delete the ledger to bypass drift.
Resolve conflicting edits by backing them up and deliberately restoring owned
bytes, or use the supported uninstall retention path. Outside instruction edits
are preserved during recovery. Unknown prior inventory identities require their
pinned package; a hash in an edited ledger cannot authorize arbitrary deletion.
Recognized package history enables tested upgrade/downgrade transitions; 6.0.0
has no earlier v6 release inventories. Unknown future downgrades refuse safely.

`.aer.run.lock` excludes mutators and records PID, hostname, nonce and creation
time. AER does not automatically recover stale locks. Inspect that record, confirm
no installer/uninstaller is running (including another machine sharing the tree),
back up the lock and pending ledger, then remove only that confirmed stale run
lock. Empty/partial locks need the same inspection. Rerun the pending operation.
Never remove a live lock. The installer releases only its own unchanged lock.
Pending operations also record raw temporary hashes. Complete same-operation
temporaries resume under the lock; partial or modified temporaries require backup
and manual inspection/removal at the exact reported path. A journal temporary
left before the initial journal rename is unowned: check reports interruption,
and install refuses to adopt it. After confirming the mutator stopped, back up
and inspect that temporary and remove it deliberately before retrying.
`check` reports lock activity or an unstable snapshot without repairing anything.
The guarantee covers recoverable process interruption with file sync/rename; it
is not a power-loss transaction or a sandbox against a hostile filesystem owner.

## Leaving v5

V6 never adopts or removes v5 state/markers. The packed v5 fixture at audited
revision `25377518505432f0362cca28de3b00fd525af20c` exercises this walkthrough:

```sh
npx --yes --package @aaarslan/aer@5.0.0 aer doctor --target /path/to/consumer --json
npx --yes --package @aaarslan/aer@5.0.0 aer uninstall --target /path/to/consumer --dry-run
```

Back up modified managed material outside every managed tree. Preview identifies
conflicts; preserve the original consumer instruction files too. If restoring
modified owned bytes, obtain them from the exact pinned v5 artifact, retain your
backup, then rerun the preview. Otherwise use v5's explicit
`uninstall --keep-modified` to detach preserved material and deliberately relocate
remaining v5 instruction blocks before trying v6. Detachment alone can leave v5
markers active, so v6 continues to refuse them. V6 performs no automatic cleanup.

```sh
npx --yes --package @aaarslan/aer@5.0.0 aer uninstall --target /path/to/consumer
# Inspect remaining consumer files/markers, then preview v6.
aer install --target /path/to/consumer --dry-run
```

The smoke packs and installs the audited v5 fixture locally, verifies v6 refusal,
previews uninstall, verifies modified-content refusal, backs up/restores owned
content and uninstalls with consumer-byte preservation before v6 installation.
This tests the pinned artifact workflow without registry or provider access.
