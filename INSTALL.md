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

    npm exec --yes --package=@aaarslan/aer@3.1.0 -- aer init --host claude --dry-run

A project may instead pin the package as a development dependency:

    npm install --save-dev --save-exact @aaarslan/aer@3.1.0
    npm exec -- aer init --host claude --dry-run

The immutable GitHub tag remains available as a source-install fallback, not the primary quick start:

    npm exec --yes --package=github:aaarslan/agent-engineering-rules#v3.1.0 -- aer init --host claude --dry-run

Contributors to this repository can use `node tools/aer.mjs <command>`.

## Initialize

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

The context names are `web-ui`, `typescript-react`, and `backend-api`. Selecting either web context activates both because they reference each other. All full references are installed regardless; selection controls only automatic Claude routes and Codex root pointers.

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

- one managed block in `AGENTS.md` containing the contract, selected profile, skill index, and selected context pointers;
- ten `.agents/skills/*` task skills; and
- `agent-rules/` references, profiles, and utilities.

Research, compatibility records, policy maps, evaluation fixtures, live-evaluation tooling, source files, and repository documentation are not installed into target projects.

For Claude, edit only selected context-rule `paths:` globs when the generated patterns do not match the project. The ledger preserves the complete customized file and reports when upstream prose cannot be merged automatically. Use CLI options for normal profile/context changes. For Codex, put repository-owned instructions outside the managed markers and use CLI options instead of editing inside them.

## Optional shipped quality tools

The distributions include three Node utilities, but installation never enables hooks or runs checks automatically. Use each tool's `--help` before wiring it into a repository contract.

`node agent-rules/tools/file-size-guard.mjs --check FILE...` is an advisory CLI. It reports `APPLICABLE-PASS`, `ADVISORY`, `NOT-APPLICABLE` with a reason, or `ERROR`; CLI exits are 0 for a completed applicable check (including an advisory), 2 for malformed input or tool failure, and 3 when every input is not applicable. `FILE_SIZE_GUARD_THRESHOLD` overrides the 500-line signal. Git HEAD supplies the baseline, generated/vendor/declarative exceptions remain not applicable, and a cheap authored-byte density signal catches some formatting-resistant cases. These lexical signals are not maintainability or complexity verdicts.

With no arguments, the same file-size utility accepts one `PostToolUse` JSON object on stdin. It recognizes Claude `tool_input.file_path` and Codex `apply_patch` paths in `tool_input.command`, emits explicit JSON context, and re-notifies after at least 20% additional line or byte growth. Hook mode is deliberately nonblocking even for malformed input, but emits `ERROR` rather than silent success. A repository may wire this optional hook using current host documentation and trust controls; it is not an enforcement boundary.

`node agent-rules/tools/contrast-check.mjs --help` documents single-pair and named JSON `--batch` input. Exit 0 means all selected opaque pairs pass the applicable AA threshold, 1 means at least one pair fails, and 2 means invalid or unsupported input. Stylesheet paths, alpha, gradients, and compositing are not parsed. The tool checks only the named foreground/background/font pair supplied; it does not establish whole-page or general WCAG conformance. Rerun failed named pairs after editing.

`node agent-rules/tools/slop-scan.mjs --help` documents explicit `--root`, `--file`, and `--glob` selectors for root-level or `src/`-based HTML/JavaScript/TypeScript projects. It excludes generated, vendor, dependency, test, coverage, and build artifacts and prints category plus `file:line` evidence. Exit 0 is a complete applicable root scan without findings; exit 1 reports findings or a file/glob scope where project-wide reference checks are explicitly not applicable; exit 2 is input/tool failure, and exit 3 means no supported authored input was applicable. Completion alone is not evidence that quality improved.

## Verify

For Claude, inspect `/status` and `/context`, then ask which project rules apply to a bounded task. For Codex, start from the target root and ask it to list loaded instruction sources; confirm the project-root `AGENTS.md` is present. Run `aer doctor` for the mechanical ownership check.

For agent-driven adoption, use [ADOPT.md](ADOPT.md).
