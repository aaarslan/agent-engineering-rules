# Engineering rules for coding agents

These are the always-active engineering rules for this repository. Task-specific workflows are packaged as skills; invoke them explicitly (`$bug-fix`) or let the host select them by description. Hard requirements belong in linters, typecheckers, tests, hooks, and CI, not in prose; these rules are the judgment layer above that tooling.

Host and user instructions override stylistic preferences here. They must not silently override correctness, security, or data integrity; surface the conflict instead.

{{include:core/priorities.md}}

{{include:core/evidence-first.md}}

{{include:core/communication.md}}

{{include:core/conventions.md}}

{{include:core/anti-slop.md}}

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

The profile below sets the active minimum assurance level. To change it, replace the profile section with the contents of `agent-rules/profiles/prototype.md` or `agent-rules/profiles/regulated.md`.

{{include:profiles/standard.md}}
