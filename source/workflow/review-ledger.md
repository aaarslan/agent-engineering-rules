---
scope: [routed]
load_when: performing PR reviews, resolving review comments, or any multi-pass review loop
related: [skeptic-pass.md]
---

# Review Ledger and Anti-Flip-Flop

Iterative review cycles must converge, not oscillate. Keep a decision ledger in the PR thread or a scratch file.

## Ledger entry format

For every comment or finding:

- **ID**: comment or finding reference
- **Claim**: the original assertion
- **Evidence inspected**: files and lines actually read
- **Decision**: accept | reject | partial | ambiguous, with one-line reason
- **Fix applied**: what changed, or "none"
- **Verification**: gate or test that confirms the fix
- **Conflicts**: does this contradict a prior ledger entry?
- **Confidence**: high | medium | low

Check the ledger before changing any line in response to a comment.

## Anti-flip-flop protocol

Before reversing a prior fix or conclusion:

1. Re-read the exact code as it is now.
2. Review the prior rationale in the ledger.
3. Identify the specific new evidence. No new evidence means no reversal.
4. Compare both versions against tests, specs, contracts, and runtime behavior.

Never reverse a deliberate fix because a later reviewer expressed a preference. If two interpretations are genuinely ambiguous, surface the ambiguity for a human decision instead of oscillating between them.

Never introduce design debt merely to satisfy a reviewer comment. If a comment demands a worse design, record the conflict in the ledger and raise it.
