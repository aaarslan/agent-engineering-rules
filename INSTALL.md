# Install and update

Agent Engineering Rules is installed per repository by the zero-dependency `aer` CLI. Installing the CLI globally is a distribution convenience: AER-managed configuration, generated content, ownership state, and markers remain exclusively inside the explicitly selected target repository. AER does not install consumer CI, hooks, services, daemons, accounts, global agent settings, or user-home agent configuration, and it does not write to unrelated repositories. Node.js 24 or newer is required.

## Install the CLI

    npm install --global @aaarslan/aer

Do not use `sudo npm install -g`. If the npm global prefix has permission problems, use a Node.js version manager so the prefix is owned by your user.

## Upgrade the CLI

    npm install --global @aaarslan/aer@latest

Upgrading the CLI changes the installed `aer` program. It does not modify any managed repository until you explicitly run `aer update` against that repository.

## Reproducible alternatives

Run an exact npm version without installing it globally:

    npm exec --yes --package=@aaarslan/aer@5.0.0 -- aer init --host claude --dry-run

A project may instead pin the package as a development dependency:

    npm install --save-dev --save-exact @aaarslan/aer@5.0.0
    npm exec -- aer init --host claude --dry-run

The immutable Git tag is an alternative source install:

    npm exec --yes --package=github:aaarslan/agent-engineering-rules#v5.0.0 -- aer init --host claude --dry-run

Contributors to this repository can use `node tools/aer.mjs <command>`.

## Initialize

For a connected example with an actual installation diff and refusal/recovery
outcomes, see the [provider-free walkthrough](docs/installation-walkthrough.md).

Install AER into the current repository after reviewing the preview:

    aer init --host claude --dry-run
    aer init --host claude

Choose only the hosts used by the target repository. Use `--target` when the target is not the current directory:

    aer init --host claude --target <project> --dry-run
    aer init --host claude --target <project>

    aer init --host codex --target <project>

    aer init --host both --target <project>

`--target` defaults to the current directory. `--dry-run` performs the same ownership, collision, filesystem, and budget checks without writing.

The default profile is `standard`. The canonical alternatives are `prototype` and `high-assurance`:

    aer init --host both --profile high-assurance

Fresh installs activate no stack contexts. Enable only contexts supported by repository evidence:

    aer init --host codex --contexts backend-api
    aer init --host claude --contexts web-ui,typescript-react
    aer init --host both --contexts all

The context names are `web-ui`, `typescript-react`, and `backend-api`. Selecting either web context activates both because they reference each other. All full references are installed regardless; selection controls automatic Claude routes and Codex root context content. The selected web-UI content includes a compact interaction obligation directly; its full reference remains optional detail.

Initialization is deliberately greenfield. Existing managed markers, an ownership ledger, or any colliding generated path—including a byte-identical but unowned file—causes a refusal. The CLI never guesses that pre-existing files belong to it.

## Update

Update an already managed current repository with the installed CLI version:

    aer update --dry-run
    aer update

Use `--target` when the target is not the current directory:

    aer update --target <project> --dry-run
    aer update --target <project>

`aer update` updates the managed project payload; it does not upgrade the globally installed CLI. Use `npm install --global @aaarslan/aer@latest` separately when you want a newer CLI. The ledger supplies the configured hosts and preserves each host's profile and contexts when options are omitted. Pass `--host`, `--profile`, or `--contexts` only to make an explicit selection change. Reapplying the same version is byte-idempotent.

An update changes only proven-owned content. It rejects unrecognized collisions and modified non-customizable files, preserves supported Claude context/profile customizations, replaces one verified managed root block instead of appending another, and removes a retired path only when the ledger hash or the tool's cumulative retired-path authority proves ownership. The current retired-path list is empty and can grow only through reviewed releases.

## Inspect with `doctor`

`doctor` is read-only:

    aer doctor
    aer doctor --target <project>
    aer doctor --target <project> --json

Use it in CI or before an update to distinguish a current install from drift or invalid ownership state. It validates the state schema, configured hosts, expected inventory, content hashes, managed root-block hashes, pending recovery data, and filesystem boundaries without repairing anything.

## Uninstall

Preview first:

    aer uninstall --dry-run
    aer uninstall

Use `--target` when the target is not the current directory:

    aer uninstall --target <project> --dry-run
    aer uninstall --target <project>

Limit removal with `--host claude` or `--host codex`. Uninstall removes only owned files and a managed root block whose recorded portable hash still matches. It restores the pre-install root-file boundary exactly, including a missing, empty, blank, or unterminated root, and writes or removes the state ledger last. Modified owned content stops the operation; use `--keep-modified` only when you intentionally want those files left in place and reported. An interrupted update must be recovered with `aer update` before uninstall can proceed.

## Remove the global CLI

    npm uninstall --global @aaarslan/aer

Removing the global CLI does not remove managed content from repositories. Run `aer uninstall` in each selected repository before removing the CLI when you also want that project-local content removed.

## Ownership and recovery

Commit `.agent-engineering-rules-state.json` with the generated payload. Schema version 3 records only repository-relative paths, host/profile/context selections, portable generated-file and managed-block hashes, root-boundary provenance, and a bounded pending-install journal. It contains no machine-specific paths. Ownership hashing normalizes CRLF to LF so a normal Git checkout remains valid across platforms; all other bytes remain significant, while mutation-time concurrency checks remain byte-exact. Do not edit the ledger or root markers by hand.

Each mutation holds a target-scoped lease from before ownership is read until the final ledger write. Atomic sibling replacements and mutation-time snapshot checks prevent a successful run from silently overwriting concurrent edits. The pending journal records old and planned hashes before payload changes, allowing a later invocation to classify an interrupted operation safely.

If the CLI reports an unverifiable lock or abandoned recovery guard, follow the filename-specific diagnostic and remove it only after confirming no installer is running for that target. Symlinked, hard-linked, malformed, or otherwise unverifiable locks and owned files are preserved for inspection.

The CLI preserves valid UTF-8 host content outside the managed root block, including a UTF-8 BOM. It rejects path escapes, symbolic-link traversal, duplicate/case-aliased destinations, invalid state, and unsafe output roots before mutation; atomic replacement does not mutate other hard links to the prior inode. For Codex it also checks the composed root against the configured project-instruction limit and checks this package's contribution to the skill catalog.

## Installed payloads

Claude receives:

- one managed block in `CLAUDE.md`;
- `.claude/rules/core-*.md` and the active `.claude/rules/profile.md`;
- selected thin `.claude/rules/context-*.md` route files;
- ten `.claude/skills/*` task skills;
- `.claude/agents/code-reviewer.md`; and
- `agent-rules/` references, profiles, and utilities.

Codex receives:

- one managed block in `AGENTS.md` containing the contract, selected profile, skill index, and selected context content;
- ten `.agents/skills/*` task skills; and
- `agent-rules/` references, profiles, and utilities.

Research, compatibility records, policy maps, evaluation fixtures, live-evaluation tooling, source files, and repository documentation are not installed into target projects.

For Claude, edit only selected context-rule `paths:` globs when the generated patterns do not match the project. The ledger preserves the complete customized file and reports when upstream prose cannot be merged automatically. Use CLI options for normal profile/context changes. For Codex, put repository-owned instructions outside the managed markers and use CLI options instead of editing inside them.

## Optional diagnostics

Diagnostics are opt-in and selected explicitly. They do not run project tests, certify completion, or install hooks. A missing or unsupported selection is a usage error; `aer verify --help` describes the interface.

```bash
aer verify contrast '#ffffff' '#000000'
aer verify contrast --batch contrast-pairs.json
aer verify slop --root .
aer verify size --check src/app.js src/view.tsx
```

A project installed from an ephemeral npm invocation can use its local entrypoint without a global CLI:

```bash
node agent-rules/tools/aer-verify.mjs <contrast|slop|size> <arguments>
```

| Selection | Evidence and limits | Exit status |
| --- | --- | --- |
| `contrast` | Checks only supplied opaque foreground/background/font pairs, including named JSON batches. It does not parse stylesheets, alpha, gradients or compositing, or prove page-wide accessibility. | 0: selected pairs pass; 1: a pair fails; 2: invalid/unsupported input |
| `slop` | Lexical HTML/JavaScript/TypeScript review candidates. Root scans exclude managed/generated/vendor/test/build material; explicit selectors can include it. Output identifies scope and finding fingerprints. Inspect findings in context. | 0: applicable full-root scan without findings; 1: findings or partial-selector scope; 2: input/tool failure; 3: no applicable authored input |
| `size` | Advisory size/density observations on named files, interpreted with the Git baseline and generated/declarative exceptions. Neither file size nor diff size establishes design quality. | 0: applicable result, including advisories; 2: invalid input/tool failure; 3: all inputs not applicable |

An applicable empty finding set means only that the selected diagnostic found nothing in its scope. Partial, advisory and not-applicable results are not proof of overall correctness. Use a diagnostic when it resolves a concrete uncertainty; fix or disposition relevant findings and rerun only when a changed input or unresolved concern requires it.

## V3 to v5 migration

V5 is built directly from released v3.1.1. After installing the v5 CLI, use the normal `aer update --dry-run` and `aer update` lifecycle; preserve the ownership ledger and consumer instructions. Existing modified owned files still require deliberate resolution. Profiles and task guidance change, but repository settings and operational systems remain consumer-owned.

The diagnostic entrypoint is now `aer verify`; runtime files ship once in the package and are installed through the same ownership checks as rule files. They are not emitted inside each generated distribution.

V4 was an unreleased experiment. Its hook/runtime configuration is not a supported v5 upgrade source. Preserve that checkout and inspect its ownership records and host settings before migrating any experimental install; do not delete `.aer/` or host settings, or force a v5 ledger over them. This release adds no v4 cleanup authority.

## Verify the installation

Run `aer doctor` for the mechanical ownership check. Start the host in the target repository and inspect which project instructions it loaded. A valid installation is not proof that a model followed every directive. The [capability matrix](docs/capability-matrix.md) records the current documentation basis.

For agent-driven adoption, use [ADOPT.md](ADOPT.md).
