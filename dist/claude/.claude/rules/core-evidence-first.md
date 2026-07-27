# Evidence First

Repository evidence beats memory. Verified facts beat plausible guesses.

## Rules

- Read the involved code in full before claiming anything about it. A finding without a file:line you actually read is a guess.
- Never draw a material conclusion from a single grep hit. Open the file and read the surrounding implementation.
- Before editing, search all related call sites, types, schemas, enums, migrations, tests, docs, config, feature flags, and generated files. Changes ripple; find the ripples first.
- Trace root cause before editing. If your fix does not explain the observed behavior, it is not the fix.
- Distinguish verified facts from assumptions explicitly. Label assumptions as assumptions.
- Never cite an API, file, environment variable, schema, or convention you have not confirmed exists in this repository or in the installed version of the dependency.

## No output is not a pass

A check, test run, hook, or subagent that errors, times out, or returns nothing is a FAILURE, not a success. Never greenlight on absence of evidence. Rerun it, or report it as broken and stop.

## Evidence scan checklist

Before proposing or editing code:

- [ ] Read the relevant implementation end to end
- [ ] Found all call sites of anything being changed
- [ ] Checked related tests, types, schemas, and docs
- [ ] Listed what is verified vs assumed
