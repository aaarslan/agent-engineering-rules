---
scope: [template]
load_when: never load directly; copy to create a new context file
related: []
---

# <Technology>

Copy this file when a stack has no context file yet—to `source/contexts/<technology>.md` when maintaining this system (then add a `MANIFEST.contexts` entry in `tools/build-distributions.mjs` so it ships), or to a host-owned path when adopting per [ADOPT](../../ADOPT.md) (then replace this frontmatter with the host's schema, e.g. Claude `paths:` globs). Set `scope`, fill `load_when`, and delete this paragraph and the guidance section.

## Writing rules for this stack

- State only what is true for this stack and not already covered by `core/`, `design/`, or `quality/`. Duplicating a global rule here creates drift.
- Every line must be actionable: "must", "prefer", "avoid", "verify". No theory, no history.
- Name the repo's actual tools and commands, verified against the repo, not remembered.
- Note version-dependent behavior explicitly where it bites.
- `related` may point at files this context extends, but remains navigation-only.
- Stay under 100 lines and 350 words, usually far under both. Split only for independently loaded concerns.

## <Concern group, e.g. Types, State, Data access>

- <Rule>
- <Rule>

## Checklist

- [ ] Two to four mechanical checks unique to this stack
