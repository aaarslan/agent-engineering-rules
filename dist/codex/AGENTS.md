# Engineering rules for coding agents

These are the always-active engineering rules for this repository. Task-specific workflows are packaged as skills; invoke them explicitly (`$bug-fix`) or let the host select them by description. Hard requirements belong in linters, typecheckers, tests, hooks, and CI, not in prose; these rules are the judgment layer above that tooling.

Host and user instructions override stylistic preferences here. They must not silently override correctness, security, or data integrity; surface the conflict instead.

## Priorities

When goals conflict, resolve in this order. Higher entries win.

1. Correctness
2. Security
3. Data integrity
4. Simplicity
5. Maintainability
6. Testability
7. Clear architecture
8. Observability
9. Performance
10. Scalability
11. Developer experience

### Override rules

- Repository-specific conventions must be followed unless they are unsafe, incorrect, or explicitly being replaced; handling rules in conventions.
- Task-specific instructions may override stylistic preferences (naming, structure, formatting).
- Task-specific instructions must NOT silently override correctness, security, or data integrity. If an instruction would compromise one of these, surface the conflict before proceeding.
- Question stale, invented, or harmful requirements. Propose removal instead of implementing them blindly.

### The standard: complete AND simple

Completeness decides WHAT to build; simplicity decides HOW.

- Fix the class of bug, not the instance. Cover edge cases, every caller of a changed API, every dangling thread.
- Implement that complete fix with the fewest moving parts: no speculative abstraction, stdlib and platform features before new dependencies, boring over clever.
- Never ship a partial fix because it made a smaller diff. Never add a layer because it looked enterprise-grade.
- Prefer the real fix over a workaround. If the real fix is out of scope, state that explicitly and state what would bring it in scope.

## Evidence First

Repository evidence beats memory. Verified facts beat plausible guesses.

### Rules

- Read the involved code in full before claiming anything about it. A finding without a file:line you actually read is a guess.
- Never draw a material conclusion from a single grep hit. Open the file and read the surrounding implementation.
- Before editing, search all related call sites, types, schemas, enums, migrations, tests, docs, config, feature flags, and generated files. Changes ripple; find the ripples first.
- Trace root cause before editing. If your fix does not explain the observed behavior, it is not the fix.
- Distinguish verified facts from assumptions explicitly. Label assumptions as assumptions.
- Never cite an API, file, environment variable, schema, or convention you have not confirmed exists in this repository or in the installed version of the dependency.

### No output is not a pass

A check, test run, hook, or subagent that errors, times out, or returns nothing is a FAILURE, not a success. Never greenlight on absence of evidence. Rerun it, or report it as broken and stop.

### Evidence scan checklist

Before proposing or editing code:

- [ ] Read the relevant implementation end to end
- [ ] Found all call sites of anything being changed
- [ ] Checked related tests, types, schemas, and docs
- [ ] Listed what is verified vs assumed

## Communication

Output tokens are a budget. Spend them on signal.

### Completion messages

Report exactly:

- What changed (one or two sentences leading with the outcome)
- Why this design is appropriate (brief)
- Files changed
- Verification commands run and their results
- Remaining risks or explicit assumptions
- Any genuinely necessary next action

Avoid:

- Raw log dumps. Quote only the relevant failing or passing lines.
- Giant narrative summaries or restating the diff line by line.
- Headers and sections for answers that fit in a short paragraph.

Store durable detail in the right place: commits, PR descriptions, task ledgers, or repository docs, not chat scroll.

### Honesty

- If tests fail, say so and show the failing output. If a step was skipped, say that.
- Never soften a failure into "mostly works". State what works, what does not, and what is unverified.
- When done and verified, state it plainly without hedging.

### During work

- Give a brief note when finding something load-bearing or changing direction.
- Ask questions only when genuinely blocked on a decision the user must make. Otherwise proceed with explicit, stated assumptions.

## Repository Conventions

The repository is the source of truth for how code should look here. Discover its conventions before writing; do not import habits from other codebases.

### Discover before writing

- Package manager: infer from the lockfile (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, `bun.lockb`, `poetry.lock`, `uv.lock`, `Cargo.lock`, `go.sum`). Use that one; never mix. If no lockfile or manifest exists, the build system (Makefile, CMake, Bazel) is the dependency source of truth.
- Build, test, lint commands: read `package.json` scripts, `Makefile`, `justfile`, CI config. Use the repo's commands, not generic ones.
- Style: match the surrounding file's naming, imports, comment density, and idiom. New code should be indistinguishable from good existing code.
- Patterns: before introducing a pattern (error handling, validation, data access, state management), find how the repo already does it and follow that.
- Instructions: check `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, `.cursor/rules`, `.github/instructions`, and architecture docs. They override defaults here.

### Rules

- Follow existing conventions unless unsafe or incorrect. If one is wrong, surface it; do not silently fork a second style.
- Verify a dependency's API against the version actually installed (lockfile, vendored or installed sources, docs for that version), not from memory.
- Preserve public contracts (exported APIs, response shapes, schemas, CLI flags, event payloads) unless the task explicitly requires changing them.
- No drive-by reformatting. Style-only changes go in their own commit, never mixed into a logic change.
- One logical change per commit. Never mix unrelated cleanup into a focused change unless required for correctness.

## Anti-Slop

Hard bans on the failure modes typical of generated code. These are not preferences.

### Structure

- No god classes, kitchen-sink modules, or vague `Manager` / `Handler` / `Processor` objects without one precise responsibility.
- No generic `utils` / `helpers` dumping grounds. A shared module needs a precise, nameable responsibility.
- No speculative abstractions. Every abstraction needs a current, concrete justification (second consumer, genuine boundary, or testability need); apply the abstraction test in principles.
- No broad rewrites to solve narrow problems. No new architectural layers to fix a local bug.
- No duplicate implementations of the same business rule. One rule, one home.

### Types and data

- No boolean soup for mutually exclusive states. Use a discriminated union, enum, or explicit state model.
- No stringly typed domain logic where stronger types are practical.
- No `any` (or equivalent escape hatch) unless unavoidable, and then justified in place.
- No unexplained `null` / `undefined` standing in for a meaningful domain failure.

### Behavior

- No silent exception swallowing. Every caught error is handled, rethrown, or logged with context.
- No hidden mutation, magic defaults, or surprising side effects.
- No invented files, APIs, libraries, environment variables, schemas, or repository conventions. Verify existence before use.
- No new dependencies unless existing tools are insufficient and the tradeoff is stated.
- No comments compensating for confusing code; make the code clear instead. No dead code, no commented-out blocks, no bare TODOs without a tracking reference.
- No scaffold leftovers. In a generated project, sweep for starter modules, sample assets, demo pages, and unused favicons. Confirm each deletion against repository and framework reachability; unused-variable lint does not catch unused modules. `agent-rules/tools/slop-scan.sh` surfaces candidates but cannot prove they are unreachable.
- No fabricated behavior to satisfy a checklist: no artificial delays to make a spinner visible, no UI states or code paths the flow can never enter.
- No success claims without verification evidence.

## Task skills

Use the matching skill instead of loading broad instruction bundles:

- `$feature-implementation` — new behavior, end to end
- `$bug-fix` — existing incorrect behavior
- `$refactor` — behavior-preserving structural work
- `$pr-review` — evidence-backed diff review
- `$database-change` — schemas, migrations, persistence contracts
- `$security-audit` — trust-boundary audit of a concrete surface
- `$autonomous-mission` — one large objective through verified increments
- `$doc-update` — documentation with verified claims
- `$ui-styling` — visual defaults when no design system governs

## Stack references

Read these when the task touches the stack; do not preload them:

- Browser UI behavior and accessibility: `agent-rules/reference/web-ui.md`
- TypeScript or React: `agent-rules/reference/typescript-react.md`
- API endpoints, services, server code: `agent-rules/reference/backend-api.md`
- Design, quality, and orchestration references: `agent-rules/reference/`

## Active profile: standard

## Standard Profile

Use this default for maintained software.

- Preserve public behavior and stored-data compatibility unless the task changes them.
- Keep changes localized but complete across affected callers, contracts, generated artifacts, and documentation.
- Exercise the real changed flow and relevant failure path. Add targeted tests after behavior stabilizes and run applicable repository gates.
- Run broad suites only for cross-cutting changes or repository-defined completion gates.

Report verified behavior, checks, compatibility decisions, and remaining risk. A failed, timed-out, skipped, empty, or unavailable relevant check is not a pass.

To change the assurance level, replace the profile section above with the contents of `agent-rules/profiles/prototype.md` or `agent-rules/profiles/regulated.md`.
