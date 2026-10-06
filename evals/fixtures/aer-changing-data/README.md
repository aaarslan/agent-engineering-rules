# aer-changing-data development fixture

Copy this directory to a disposable workspace. Read `contract.md`, run
`node --test baseline.test.mjs`, then apply one case prompt. The baseline
confirms the seeded starting state; it is not an acceptance test.

These are disclosed development tasks, not model results or secret holdouts.
For a blinded study, freeze grader material separately before dispatch and keep
it out of the candidate workspace. Retain the diff, commands and observed
outcomes. Delete only the disposable workspace after retaining evidence.

`acceptance.test.mjs` contains disclosed boundary checks. Run only the selected
case with `node --test --test-name-pattern="^case-N:" acceptance.test.mjs`.
All three case checks intentionally fail on the unmodified seed. Their failure
is calibrated offline; it is not evidence of model performance. The baseline
test records seed behavior and is not a post-change success requirement.
