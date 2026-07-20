# Adopt Agent Engineering Rules

Use this after the directory is placed in a host repository by submodule, subtree, or copy. Treat the import as read-only; host-specific rules, profiles, contexts, and commands stay in the host.

## Integrate

1. Resolve the host root from VCS or the nearest directory owning manifests and build configuration; record ambiguity.
2. Find this directory's path relative to that root; do not assume its name.
3. Inspect manifests, lockfiles, build files, source directories, configuration, and existing agent instructions. Detect technologies from evidence.
4. Choose only matching contexts from [AGENTS.md](AGENTS.md). For an uncovered major stack, copy [the template](contexts/_template.md) to a host-owned path and fill it from verified commands and APIs.
5. Select one profile using the [router precedence](AGENTS.md#route-the-task). Preserve an explicit selection; otherwise default to `standard`. Never infer regulatory obligations from industry labels.
6. Add or update the block below in the host root's `AGENTS.md`, preserving existing instructions. Integrate separate Git roots independently unless shared policy is requested.
7. For Claude Code, add `@AGENTS.md` and `@<path>/AGENTS.md` to the host's `CLAUDE.md` without deleting Claude-specific instructions. If routed files are skipped, wire `<path>/tools/route-hook.mjs` as a `UserPromptSubmit` hook per `<path>/tools/README.md`.
8. Use existing linters, typecheckers, hooks, or CI for hard requirements. Do not add infrastructure merely to complete adoption.

```markdown
## Agent Engineering Rules

Before starting any task, read `<path>/AGENTS.md` and load the files its task table routes for the current task. Required context, not optional documentation.
Active profile: `<path>/profiles/<profile>.md`.
Active canonical contexts: `<paths from <path>/contexts/>`; ignore the others.
Project contexts: `<host paths, or none>`.
Treat `<path>/` as read-only. Host rules override it except the correctness, security, and data-integrity priorities in `<path>/core/priorities.md`.
```

## Verify and report

Run `node <path>/tools/validate-system.mjs`; verify every pointer path from the host root; confirm the imported directory is unmodified. For supported web/TypeScript hosts, `bash <path>/tools/slop-scan.sh <host-root>` supplies warnings, not proof.

Report the host root, import method, detected technologies with evidence, selected profile and contexts, host files changed, enforcement gaps, and unresolved uncertainty.

Update later through the original import method, rerun validation, and recheck host profile/context paths. Never merge host-specific changes into the imported directory.
