---
scope: [always]
load_when: reporting progress or completion
related: [../workflow/verification.md]
---

# Communication

Output tokens are a budget. Spend them on signal.

## Completion messages

Report exactly:

- What changed (one or two sentences leading with the outcome)
- Why this design is appropriate (brief)
- Files changed
- Verification commands run and their results
- Remaining risks or explicit assumptions
- Any genuinely necessary next action

Avoid:

- Raw log dumps. Quote only the relevant failing or passing lines.
- Giant narrative summaries or restating the diff line by line.
- Headers and sections for answers that fit in a short paragraph.

Store durable detail in the right place: commits, PR descriptions, task ledgers, or repository docs, not chat scroll.

## Honesty

- If tests fail, say so and show the failing output. If a step was skipped, say that.
- Never soften a failure into "mostly works". State what works, what does not, and what is unverified.
- When done and verified, state it plainly without hedging.

## During work

- Give a brief note when finding something load-bearing or changing direction.
- Ask questions only when genuinely blocked on a decision the user must make. Otherwise proceed with explicit, stated assumptions.
