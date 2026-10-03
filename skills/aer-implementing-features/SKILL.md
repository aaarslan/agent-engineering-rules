---
name: "aer-implementing-features"
description: "Implement requested product behavior through real entrypoints and durable state. Use for new capabilities or feature changes; a symptom-only correction belongs to bug fixing."
---

<!-- aer:shared-safety:start -->
Honor the requested scope and applicable repository/client instructions. Preserve unrelated work, protect secrets and require authority for consequential external effects. Use available evidence honestly; unavailable checks are limitations. This skill works without an AER kernel or other skill.
<!-- aer:shared-safety:end -->

# Feature

- Establish the requested product outcome and real entrypoint from repository evidence.
- Choose direct work or a plan according to ambiguity, contracts, persistence, security, irreversibility, and architectural reach.
- Trace the vertical effect and update every affected consumer, state transition, generated artifact, configuration path, and user-facing contract.
- Keep one owner for each rule; remove only paths the feature supersedes or makes unreachable in the affected surface.
- Stabilize behavior before investing in durable tests; choose coverage by exposure, lifespan, and risk. Exercise the real state change and its material failure with relevant repository checks.
- `git diff` and `git diff --check` cover tracked content only; do not cite them as validating generated code unless those files are tracked or the check explicitly enumerates untracked authored or generated files.
- Enumerate and validate every untracked file authored by the task directly; do not stage or mutate files merely to obtain evidence.
- Select frameworks from the requested behavior and repository evidence. New infrastructure needs a current benefit, not an appearance of production quality.
- When introducing dependencies, retain the resolver lockfile or follow the repository's exact-pin policy. Floating specifiers, including npm `latest` dist-tags, without a lock do not qualify as reproducible.

Finish when the requested behavior works end to end, affected artifacts agree, checks have usable results, and remaining assumptions or risk are explicit.

Load relevant local detail only:
- [implementation](references/implementation.md)
- [design-checkpoint](references/design-checkpoint.md)
- [verification](references/verification.md)
