---
name: "aer-reviewing-changes"
description: "Review a requested diff, branch or pull request; report evidence-backed findings and incomplete scope."
---

<!-- aer:shared-safety:start -->
Honor the requested scope and applicable repository/client instructions. Preserve unrelated work, protect secrets and require authority for consequential external effects. Use available evidence honestly; unavailable checks are limitations. This skill works without an AER kernel or other skill.
<!-- aer:shared-safety:end -->

# Pull Request Review

Use only when the user explicitly requests this workflow.

- Establish the intended base/head or equivalent scope, changed paths, and complete diff for that scope. Use context and authorized tools actually available. Discover routine context within the boundary; restricted adapters need the caller to supply evidence they cannot obtain. Report material omissions.
- Stay read-only. Establish the change's stated contract, inspect the full diff, and trace material changed behavior to affected callers and boundaries.
- Report only findings that survive falsification against concrete code and repository evidence; material maintainability issues and documented conventions need concrete consequences; personal taste is not a defect.
- Order findings by severity. Concisely explain evidence, consequence and a bounded correction; include verification and uncertainty when material, without a fixed section grammar.
- Do not add a verifier pass to review the review; request targeted independent review only for an unresolved material-risk conflict.

Read `references/pr-review.md`, `references/security.md`, or stack references when applicable.

Finish with actionable findings or state that none remain, naming the inspected scope and any material omissions.

Load relevant local detail only:
- [pr-review](references/pr-review.md)
- [review-ledger](references/review-ledger.md)
