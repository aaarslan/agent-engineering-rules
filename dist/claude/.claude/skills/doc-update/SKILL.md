---
name: doc-update
description: Write, update, or audit documentation with every factual claim verified against the repository. Use for README, guides, API docs, and doc audits.
---

# Documentation Update

Documentation is a claim about the system; wrong docs are worse than no docs. Verify every command, flag, path, and behavior claim against the current repository before writing it. For material factual or compatibility claims, finish with a skeptic pass over the changed text.

## Documentation

Documentation is a claim about the system. Wrong docs are worse than no docs.

### Verifying claims

Check every factual claim against the current code, config, schemas, tests, package scripts, and primary docs. When auditing, label each claim:

- **Verified**: confirmed against a cited file
- **Outdated**: contradicted by current code; include the correction and evidence
- **Unsupported**: nothing in the repo confirms or denies it
- **Ambiguous**: multiple readings; surface it rather than guessing

Never document aspirational behavior as implemented behavior. If a feature is planned, say planned.

### Writing docs

- Commands, flags, paths, env vars, and version numbers must be copied from the repo, not reconstructed from memory. Run commands where practical to confirm they work.
- Write for the reader's task: what they need to do, in order, with the failure modes they will actually hit.
- Prefer prose and short lists. Add a diagram or table only when it clarifies the real system better than a sentence would.
- Update docs in the same change that invalidates them; a behavior change with stale docs is an incomplete change.
- Public surfaces get one tight docstring paragraph: what it does, its contract, its failure modes. Not an essay.

### Checklist

- [ ] Every command shown was executed or verified against repo scripts
- [ ] Every claim maps to a current file, not memory
- [ ] Nothing aspirational is stated as fact

## Completion

Finish only when every command shown was executed or verified against repository scripts, every claim maps to a current file, and nothing aspirational is stated as fact.
