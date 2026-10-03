---
name: "aer-verifying-work"
description: "Investigate a requested disputed completion claim or diagnostic uncertainty. Explicit invocation only on integrated clients; exclude routine final passes and repeated checks without new evidence."
---

<!-- aer:shared-safety:start -->
Honor the requested scope and applicable repository/client instructions. Preserve unrelated work, protect secrets and require authority for consequential external effects. Use available evidence honestly; unavailable checks are limitations. This skill works without an AER kernel or other skill.
<!-- aer:shared-safety:end -->

# Focused Verification

- Identify the claim, changed artifact, available evidence, and remaining uncertainty.
- Inspect relevant implementation and existing results before selecting any new check; do not repeat valid evidence simply because another agent produced it.
- Exercise the real boundary when the uncertainty is behavioral; use an isolated check only for what it can establish.
- Optional diagnostics are explicitly selected scripts in this skill. Run only a relevant check; no diagnostic inventory or completion certification.
- Separate observed behavior, heuristic findings, and unavailable verification. Falsify candidate findings before reporting them.

Read `references/verification.md` only when the remaining uncertainty needs its procedure. Finish with the supported conclusion, evidence, and limitations; no repeated verifier or report gate.

Load relevant local detail only:
- [verification](references/verification.md)
- [testing](references/testing.md)
- [skeptic-pass](references/skeptic-pass.md)

Optional scripts require an available Node 24 runtime. Resolve paths from the loaded skill’s actual root and quote paths with spaces. From that root, run only a relevant `node "scripts/slop-scan.mjs" --help` to inspect its input contract. Without Node, use repository tools or manual evidence and report the limitation. Scripts never run on discovery or installation.
