# Install and update

Agent Engineering Rules is installed per repository by the zero-dependency `aer` CLI. It does not require a global package, plugin, hook, daemon, or user-home configuration. Node.js 20 or newer is required.

Use an immutable release tag or commit for reproducible installs:

    npm exec --yes --package=github:aaarslan/agent-engineering-rules#<tag> -- aer <command>

You can instead pin the package as a development dependency and use `npm exec -- aer <command>`. Contributors to this repository can use `node tools/aer.mjs <command>`.

## Initialize

Choose only the hosts used by the target repository:

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

Fetch the desired immutable version, then update the target:

    aer update --target <project> --dry-run
    aer update --target <project>

The ledger supplies the configured hosts and preserves each host's profile and contexts when options are omitted. Pass `--host`, `--profile`, or `--contexts` only to make an explicit selection change. Reapplying the same version is byte-idempotent.

An update changes only proven-owned content. It rejects unrecognized collisions and modified non-customizable files, preserves supported Claude context/profile customizations, replaces one verified managed root block instead of appending another, and removes a retired path only when the ledger hash or the tool's cumulative retired-path authority proves ownership. The current retired-path list is empty and can grow only through reviewed releases.

## Inspect with `doctor`

`doctor` is read-only:

    aer doctor --target <project>
    aer doctor --target <project> --json

Use it in CI or before an update to distinguish a current install from drift or invalid ownership state. It validates the state schema, configured hosts, expected inventory, content hashes, managed root-block hashes, pending recovery data, and filesystem boundaries without repairing anything.

## Uninstall

Preview first:

    aer uninstall --target <project> --dry-run
    aer uninstall --target <project>

Limit removal with `--host claude` or `--host codex`. Uninstall removes only owned files and a managed root block whose recorded portable hash still matches. It restores the pre-install root-file boundary exactly, including a missing, empty, blank, or unterminated root, and writes or removes the state ledger last. Modified owned content stops the operation; use `--keep-modified` only when you intentionally want those files left in place and reported. An interrupted update must be recovered with `aer update` before uninstall can proceed.

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

## Optional Claude size guard

`agent-rules/tools/file-size-guard.py` is an advisory `PostToolUse` hook that reports when an edited source file grows beyond 500 lines. It is shipped but never enabled automatically. Projects that choose to use it must wire it into their own repository-scoped Claude settings and can set `FILE_SIZE_GUARD_THRESHOLD` to a different limit. It always exits zero and is not an enforcement boundary.

## Verify

For Claude, inspect `/status` and `/context`, then ask which project rules apply to a bounded task. For Codex, start from the target root and ask it to list loaded instruction sources; confirm the project-root `AGENTS.md` is present. Run `aer doctor` for the mechanical ownership check.

For agent-driven adoption, use [ADOPT.md](ADOPT.md).
