---
scope: [routed]
load_when: deciding what and when to verify or preserve as automated regression coverage
related: [../workflow/verification.md, ../kernel/contract.md, ../profiles/standard.md]
---

# Testing

Verification establishes current behavior. Permanent tests protect stable behavior against future regression. They are separate investments.

## Choose the investment

- Scale effort with project maturity, expected lifespan, real users and exposure, contract stability, regression/security/privacy/data risk, and failure cost.
- Demos, experiments, single-use tools, and changing prototypes need a complete working path first. Add permanent tests only when requested, materially risk-reducing, or faster than direct development and verification.
- For durable features, finish the real vertical behavior and stabilize its user/caller contract before investing in end-to-end or boundary regression coverage. High-consequence behavior warrants earlier checks.
- When extending existing production behavior, run relevant established coverage to protect current customers alongside the new behavior.
- Do not construct test architecture around substantially changing behavior. Tests added are not progress toward an unfinished feature.

## Choose the evidence

- Use the cheapest decisive check for the uncertainty: direct execution, build, focused assertion, targeted existing test, or manual vertical-path exercise.
- Reproduce bugs before repair when practical; retain a regression only when its future value warrants it.
- Before restructuring, establish the behavior to preserve from executable evidence or a reliable contract. If no runnable baseline exists, state the gap and use characterization only where it resolves preservation uncertainty.
- Protect observable contracts and meaningful failure boundaries, not implementation shape, framework behavior, fixture counts, or line counts.
- Test dense decisions, parsing, state machines, serialization, and storage failure boundaries where isolated checks are decisive; exercise glue through its real integration.
- Mocks prove isolated behavior. Their size and complexity need justification when they exceed the behavior protected.

## Timing and reuse

- During implementation, target relevant uncertainty. Do not rerun an unchanged broad suite after every edit.
- Rerun when relevant behavior changed, prior evidence was invalidated, integration creates a new risk, or a repository completion gate requires current evidence.
- Reserve broad regression suites for meaningful integration boundaries and required final gates; a final report alone does not invalidate a passing result.
- Failure calls for diagnosis and a relevant repair, not identical reruns. Follow [verification](../workflow/verification.md).
- Match existing repository tooling and deterministic test patterns; introduce no framework merely to appear rigorous.

Report direct behavior exercised, permanent regressions added, existing checks rerun, and material checks omitted with their cost/value reason. Optimize information gained per time, context, execution cost, and complexity; do not infer provider incentives from repeated testing behavior.
