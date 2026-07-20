---
scope: [any-code-change]
load_when: writing or modifying any code
related: [priorities.md, anti-slop.md]
---

# Repository Conventions

The repository is the source of truth for how code should look here. Discover its conventions before writing; do not import habits from other codebases.

## Discover before writing

- Package manager: infer from the lockfile (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, `bun.lockb`, `poetry.lock`, `uv.lock`, `Cargo.lock`, `go.sum`). Use that one; never mix. If no lockfile or manifest exists, the build system (Makefile, CMake, Bazel) is the dependency source of truth.
- Build, test, lint commands: read `package.json` scripts, `Makefile`, `justfile`, CI config. Use the repo's commands, not generic ones.
- Style: match the surrounding file's naming, imports, comment density, and idiom. New code should be indistinguishable from good existing code.
- Patterns: before introducing a pattern (error handling, validation, data access, state management), find how the repo already does it and follow that.
- Instructions: check `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, `.cursor/rules`, `.github/instructions`, and architecture docs. They override defaults here.

## Rules

- Follow existing conventions unless unsafe or incorrect. If one is wrong, surface it; do not silently fork a second style.
- Verify a dependency's API against the version actually installed (lockfile, vendored or installed sources, docs for that version), not from memory.
- Preserve public contracts (exported APIs, response shapes, schemas, CLI flags, event payloads) unless the task explicitly requires changing them.
- No drive-by reformatting. Style-only changes go in their own commit, never mixed into a logic change.
- One logical change per commit. Never mix unrelated cleanup into a focused change unless required for correctness.
