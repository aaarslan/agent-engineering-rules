# Prepare and inspect an evidence bundle

This is a repository-only record workflow, not an experiment runner. It does not
dispatch a provider, execute a task, grade output, select a winner, calculate an
improvement percentage, or authorize spending. The v5 installed contract and
diagnostics do not load it. [Evaluation policy](../evaluation.md) remains the
authority for study design, provider restrictions, and explicit authorization.

## Freeze before observing results

1. Copy [the deliberately incomplete template](protocol.template.json) into a new
   local study directory as `protocol.json`. It cannot pass validation unchanged.
2. Review the bounded question and complete every field. Pin the actual task,
   disclosed contract, rubric, expanded baseline and treatment instructions as
   separate UTF-8 files. Record their SHA-256 hashes. An empty baseline file is
   valid only if the design explicitly means no additional AER text; record the
   actual host/user instructions and isolation method elsewhere in the contract.
3. Name the exact authorized provider/model and authorization reference without
   credentials. Record the external spending enforcement and allowed overshoot;
   this tool enforces neither. The existing ZAI/DeepSeek/Meta restriction and
   prohibition on automatic provider substitution still apply.
4. Freeze tasks, editable files, repository revision, model/effort/tool settings,
   retries, budgets, exclusions, stopping rules, scoring, human-rework measurement,
   uncertainty method, and randomized order before dispatch. V1 supports one
   baseline and one treatment under one shared configuration. Other designs need
   a separately reviewed format, not silently mixed rows.
5. From the AER source checkout, run:

   ```bash
   node tools/study-record.mjs freeze <study>/protocol.json <study>/protocol.lock.json
   node tools/study-record.mjs validate <study>/protocol.json <study>/protocol.lock.json
   ```

The lock hashes the **exact protocol bytes**, including whitespace, and records a
UTC freeze time. The freeze command verifies every declared input digest and
refuses to overwrite an existing lock. Commit the protocol, lock, and inputs to an
independently reviewable immutable revision before starting. A digest and local
timestamp alone do not prove when a plan was written or who approved it.

No research was run to produce this template. The template is a planning aid,
not a frozen or approved study. Existing historical hashes and evidence remain
untouched. A changed task, grader, treatment, or analysis plan needs a new study
version and lock; retain the old bundle.

## Import externally collected records

Create `records.json` with exactly these top-level fields:

| Field | Contract |
| --- | --- |
| `schemaVersion` | `aer-study-records/1` |
| `studyId`, `protocolSha256` | Match the frozen protocol and lock |
| `status` | `partial` or `complete`; complete requires every planned pair/treatment cell |
| `attempts` | Every attempted run, including failures, retries, and explicit skipped cells |

Each attempt has these exact fields. Missing numbers are `null`, never fabricated
zeroes. Unknown fields and unsupported statuses are errors.

| Attempt field | Contract |
| --- | --- |
| `id`, `pairId`, `treatmentId`, `attempt` | Unique run ID, planned pair/treatment, and consecutive attempt number starting at 1 |
| `configurationSha256`, `configurationNote` | SHA-256 of `JSON.stringify(observedConfiguration)` with the frozen configuration's field order; null if unavailable. A matching digest uses null note; unavailable/mismatched identity requires an explanation and is surfaced as a comparison exception |
| `status` | `completed`, `failed`, `timeout`, `infra-error`, or `skipped` |
| `startedAt`, `endedAt` | Canonical UTC timestamps (`YYYY-MM-DDTHH:mm:ss.sssZ`); both null for skipped cells |
| `terminationReason` | Actual disposition, including why execution stopped or was skipped |
| `usage` | Exact object: `inputTokens`, `outputTokens`, `cost`, `currency`, `unavailableReason`. Unavailable quantities require a reason; fully measured usage uses null reason |
| `scoring` | Exact object: `status` (`scored`, `unavailable`, `inconclusive`), `reviewer`, `strictScore`, `engineeringQuality`, `humanReworkMinutes`, `disagreement` |
| `scoring.strictScore` | `{ "earned": number, "possible": positiveNumber }` within range when scored; otherwise null. The pinned rubric defines the meaning |
| `scoring.engineeringQuality` | Reviewer assessment and material limitations, including why unavailable; does not replace strict correctness |
| `scoring.humanReworkMinutes`, `disagreement` | Non-negative measured minutes or null; reviewer disagreement text or null |
| `artifacts` | Exactly one record for each kind: `transcript`, `diff`, `checks`, `output`, `usage`, `scoring` |

Every artifact uses `{ "kind", "status", "path", "sha256", "reason" }`. An
`available` artifact has a contained relative path, matching SHA-256, and null
reason. `missing` or `corrupt` artifacts have null path/hash and an explicit
reason. Preserve original corrupt evidence in the separate raw collection and
describe its disposition; do not claim its digest was verified. All paths resolve
relative to the protocol directory, including record artifacts. External URLs,
absolute paths, traversal, aliases, and symbolic-link paths are rejected. Text,
scripts, and logs are hashed as data, never evaluated.

```bash
node tools/study-record.mjs validate <study>/protocol.json <study>/protocol.lock.json <study>/records.json
```

Exit 0 means the selected record structure and available artifact digests are
consistent. It does **not** establish execution success, truthful provenance,
valid authorization, model identity, grading correctness, budget compliance, or
efficacy. Exit 2 means invalid input or unverifiable declared available evidence.
The tool never writes to the imported protocol, records, or artifacts.

The observed configuration must come from the actual run metadata, not copying
the expected digest to hide a change. Preserve its serialized bytes in the
transcript artifact. The validator compares the declared digest to the frozen
configuration; it cannot authenticate the metadata or the provider identity.

Its JSON diagnostic exposes missing planned cells, configuration exceptions, incomplete evidence, recorded
time/token budget exceptions, known-cost ceiling exceptions, and whether cost is
incomplete. A valid report can contain failed runs and failed grades. Unknown cost
is not replaced by zero; known cost is only a lower bound when any cost is missing.
Repeated attempts must remain consecutive, and the first attempts must respect
the frozen pair order. The tool cannot detect a deliberately omitted entire run,
unlogged provider retry, false timestamp, or falsified evidence bundle.

Before writing any outcome report, inspect per-run execution, integrity, scoring,
strict correctness, engineering quality, human rework, and budget dispositions
separately. Apply the frozen pairing and exclusions with uncertainty. Keep all
inconclusive and unsuccessful rows visible before aggregates. No HTML report or
benchmark score is generated by this tool.

## Maintenance evidence

`tools/study-record.test.mjs` constructs explicitly synthetic **format fixtures**
in temporary directories. Those fixtures test rejection and provenance contracts;
they are not observations from model runs. `npm run validate:research` runs these
tests without provider credentials alongside the existing research gates. The
package allowlist and packed-artifact gate keep the validator and this directory
out of installed projects.
