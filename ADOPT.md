# Adopt Agent Engineering Rules

Use this procedure to initialize or update Agent Engineering Rules in another repository. The surrounding task still defines the objective; this file defines only adoption mechanics.

1. Resolve the target root from version control or the nearest directory that owns the build manifests. Stop on genuine ambiguity.
2. Identify the hosts actually used by the project: `claude`, `codex`, or `both`. Do not install a second instruction root merely because another tool recognizes its filename.
3. Choose `prototype`, `standard`, or `high-assurance` from explicit requirements. Default to `standard`; never infer assurance or regulatory obligations from an industry label.
4. Inspect manifests, lockfiles, build files, and source directories. Activate only evidenced contexts: `web-ui`, `typescript-react`, and/or `backend-api`. Fresh installs otherwise use `none`.
5. Preflight the exact target. Use the installed CLI, or pin the exact npm package version when reproducibility requires it:

       npm exec --yes --package=@aaarslan/aer@3.1.1 -- aer init --host <claude|codex|both> --target <target> --profile <profile> --contexts <none|all|comma-list> --dry-run

6. Resolve every reported collision; never force ownership. Rerun without `--dry-run`, then commit the generated payload and `.agent-engineering-rules-state.json` together.
7. On an already initialized project, use `aer doctor` and `aer update`; do not rerun `init`. Omitted update selections are read from the ledger.
8. For Claude, adjust only selected context-rule `paths:` globs when verified project layout requires it. Use CLI options for normal profile/context changes.
9. For Codex, keep repository-owned instructions outside the managed `AGENTS.md` markers. Never hand-edit the managed block or state ledger.
10. Keep deterministic requirements in the project's permissions, linters, typecheckers, hooks, tests, or CI. The installed prose is not a security boundary.
11. Run the target's relevant checks plus `aer doctor`. Report the selected host, profile, contexts, files changed, and verification evidence.

Initialization is greenfield and refuses existing markers, ledgers, or unowned colliding paths even when their bytes happen to match. Do not delete or overwrite such content unless the repository owner explicitly resolves it.

The first successful initialization owns exact generated paths, not whole `.claude/`, `.agents/`, or `agent-rules/` directories. Existing unrelated configuration remains outside its authority. `update` and `uninstall` act only on cryptographically proven owned content.

Installing `@aaarslan/aer` globally only makes the CLI executable available. It does not create global agent settings, consumer CI, hooks, services, or project content outside the explicitly selected target.

For an unsupported major stack, start from `source/contexts/_template.md`, verify commands and APIs against the target, and add it as a clearly project-owned file outside the generated inventory. Do not duplicate the universal contract.
