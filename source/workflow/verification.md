---
scope: [routed]
load_when: material verification uncertainty, failure diagnosis, or a requested verification procedure
related: [skeptic-pass.md, ../quality/testing.md, ../kernel/contract.md]
---

# Verification

Select evidence for the changed contract and actual risk. This procedure is concern-triggered, not an extra mandatory contract.

## During implementation

Use the cheapest check that resolves the current uncertainty: direct execution, targeted assertions, incremental compile, or relevant existing coverage. Do not test scaffolding repeatedly or rerun all tooling after each edit.

## At a complete behavior or integration boundary

- Exercise the real entrypoint through its actual effect, including material failure and recovery cases. For UI, observe rendered interaction and keyboard/focus behavior.
- If the real boundary is unavailable, use the strongest useful proxy and state what it cannot establish; a mock never becomes proof of production wiring.
- Run relevant established regressions and repository-required gates. Use broader checks when the integration risk warrants them; preserve valid prior results.
- Build when the changed deliverable requires it; inspect the declared output. A development server is not evidence of a completed production build.
- Regenerate changed schemas, contracts, and generated artifacts; inspect their consumers and final diffs.
- New permanent tests follow [testing](../quality/testing.md), independently of the need to verify behavior now.

Use the repository's actual commands. Record component exit status and material output; later success cannot hide earlier failure. Keep pass, failure, advisory, not-applicable, and unavailable distinct.

Optional diagnostics use `aer verify`, invoked in an installed project as `node agent-rules/tools/aer-verify.mjs <check> <args>`. Select one only when its documented scope addresses a concrete uncertainty. There is no automatic scan or help-discovery gate, and heuristic warnings require inspection.

## Failed or unavailable evidence

Collect useful output and diagnose before repairing. A diagnostic rerun may classify a transient; repeating the same failure needs a changed hypothesis, implementation, input, command, or environment. Stop an identical no-progress loop and continue independent work. State the exact missing input or unresolved boundary when further progress requires it.

After repair, rerun the failed check and checks whose evidence the repair invalidates. An unchanged relevant pass remains evidence; agent boundaries and final-message timing alone do not invalidate it.

## Completion

Inspect the final diff and repository state, including authored untracked files, consumers, generated artifacts, docs, duplicate/superseded/dead paths, scaffolds, unsafe defaults, side effects, and self-introduced regressions.

Map each completion claim to relevant observed evidence and its limitations. Report substantive results, permanent coverage added, existing checks rerun, material omitted checks and why, and unresolved risk. No fixed report layout is required.

Use [skeptic review](skeptic-pass.md) only for an actual material-risk or uncertainty trigger; it should settle a claim, not repeat successful deterministic commands.
