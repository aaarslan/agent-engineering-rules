---
scope: [template]
load_when: never load directly; copy to create a new context file
related: []
---

# <Technology>

Repository-specific stack instructions belong in a host-owned path per [ADOPT](../../ADOPT.md); use the host's schema, such as Claude `paths:` globs. A justified universal context added to this corpus needs a `MANIFEST.contexts` entry in `tools/manifest.mjs`. Set `scope`, fill `load_when`, and delete this paragraph and the guidance section.

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
