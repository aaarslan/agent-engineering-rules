# Evaluation and evidence

AER v5 makes no efficacy claim. Release checks establish corpus consistency, diagnostic behavior, package contents, and installation safety. They do not establish better model engineering, lower token use, or less human rework.

## Product validation

Run `npm test`, `npm run validate`, `npm run validate:research`, and `npm run test:packed` at the release integration gate. These are provider-free. During implementation, use targeted checks; broaden or repeat only when evidence was invalidated or a required integration gate is reached.

- [The grievance inventory](../source/evals/grievances.json) preserves every user-supplied requirement ID and its owner. All efficacy statuses remain unmeasured. Source references establish design traceability, not model adherence.
- [The live directive registry](../source/evals/directives.json) and [scenarios](../source/evals/scenarios.json) close over the current kernel. They describe intended situations, not a hidden-test benchmark.
- [The corpus validator](../tools/validate-corpus.mjs) checks registries, grievance closure, frozen history, official-source metadata, policy ownership, and compatibility dates. Negative tests exercise missing, duplicate, stale and mutated records.
- [The load validator](../tools/validate-runtime-loads.mjs) models generated automatic content and task loads. Its byte-based token count is an estimate. Host/user instructions and optional references add context; mandatory AER reads cannot be excluded merely because they live in a reference file.
- Installer and packed-artifact checks exercise real local ownership, updates, drift refusal and uninstall. Diagnostics prove only their selected mathematical or lexical scope.

No release or CI path dispatches an evaluation provider or needs provider credentials. V5 has no paid runner, fake provider adapter, repetition matrix or benchmark-report generator.

## Informal v5 todo comparison

The user separately requested a local pair of fresh GPT-6 Astra subagents at low effort, with and without the then-current v5 payload. Under the disclosed todo rubric, the reviewer scored the baseline eight of ten groups and v5 nine of ten: v5 avoided one stale-draft recovery failure, while both apps lost keyboard focus after toggling tasks. V5 also lost focus after edit cancellation. This pair does not establish general efficacy or lower testing, token or monetary cost; the evaluator was unblinded, exact adversarial inputs were chosen during inspection, and precise per-agent usage was unavailable.

[The delivery decision](decisions/5.0.0-ui-interaction-delivery.md) preserves the original report and treatment identities and explains the resulting compact UI clause. The apps and original scores remain unchanged. Revised delivery is a product repair with no new efficacy claim; it is not a retroactive perfect score.

## Subsequent three-way todo comparison

A separate user-requested run compared fresh low-effort GPT-6 Astra agents with released v3.1.1, revised v5, and no AER. V3.1.1 and v5 passed all ten exercised groups; the baseline passed eight, losing a revised draft on retry and keyboard focus after state changes. V3.1.1's explicit reset was exercised through an accepted-confirmation adapter after its native dialog stalled the browser driver; native dialog handling remains unverified.

[The comparison record](decisions/5.0.0-three-way-todo.md) preserves treatment identities, execution qualifications and the original results artifact. This reused a known task after v5 was changed using the earlier pair, with one observation per treatment and an unblinded evaluator. It establishes neither v5 superiority over v3.1.1 nor general efficacy or lower testing cost; the earlier pair remains unchanged.

## Historical evidence

[Frozen history](../source/evals/frozen-history.json) pins historical files and their source revision. Validation hashes them without executing tasks or graders. Values may differ from the current corpus; a future experiment needs a new protocol and treatment version. Never modify an old arm after observing outcomes.

| Record | Status and interpretation |
| --- | --- |
| Earlier predecessor study | Historical evidence for that predecessor only; it establishes no v3, v4 or v5 efficacy. |
| V2 corpus at `57eb0d0` | Design history with a strong completeness/simplicity target and larger always-on load. This is distinct from the version-2 evaluation registry. |
| V3.1.1 at `c1353c7993b4ff78e09963b01207d8b2d2c5d29e` | Released starting point. Its frozen application plan was not a completed comparative outcome study; the example run is schema evidence, not an observed result. |
| Earlier UI pilot and replication | Supplied evidence informed v3 patches. Single observations, unavailable checks and task/harness defects prevent general causal claims. The original protocol and dispositions remain in this file at v3.1.1. |
| Rejected v4 at `af7803f21629e71f3b65036923fffd34277e8b0a` | Unreleased experiment preserved on `feature/AER0004`. Its source, decisions and raw evidence remain in Git. Different graders, revisions, models, missing cost and invalid execution cannot form clean pairs. V5 does not relabel those outcomes. |

Retrieve an artifact with `git show <revision>:<path>`. For v4, inspect `docs/evaluation.md`, `docs/decisions/4.0.0-reconciliation.md`, `docs/decisions/4.0.0-deviations.md` and `docs/evidence/` at the rejected revision. [The v5 review](decisions/5.0.0-review-and-plan.md) records the product consequences: report repair loops, mandatory rereads, duplicated verification, undisclosed contracts and false check classification.

Dormant v3 dispatch and synthetic execution harnesses are removed. Frozen inputs remain intact; implementations remain retrievable at v3.1.1. Removing a harness does not turn an unrun experiment into a successful experiment.

## Future evaluation

Product repair comes first. Any future study requires a reviewed plan and explicit spend authorization. The motivating request names ZAI, DeepSeek and Meta as intended paid providers. Claude/Codex installation support, historical metadata, existing credentials and previous approvals do not authorize a new Anthropic/OpenAI study or provider substitution. Establish exact endpoints, model identities, account capabilities and budget enforcement from current official sources before dispatch.

Prefer maintained, auditable, established evaluation methods when they fit the product question. Do not build another bespoke harness merely to obtain a favorable percentage, repeatedly repair Deep-SWE during product work, or claim official benchmark improvement from private variants. Official recorded performance and a matched local baseline are different evidence; label them.

The original v3 question remains: does the same model improve against its recorded baseline with the specified v3 treatment? A v5 comparison needs a separately named v5 treatment. Do not silently change the target version or transfer scores.

Before running:

1. Freeze the question, tasks, rubric, exact baseline/treatment, budgets, stopping rules, exclusions, pairing and analysis method. Choose repetition and uncertainty methods before results. No predetermined improvement percentage.
2. Audit fairness. Disclose every graded interface, representation, error behavior, formatting constraint, editable file and dependency. Withhold concrete inputs, not essential contracts. Repair or exclude already-passing tasks, dependent exercises, inaccessible files and incomplete contracts before scoring AER. Calibrate with materially different correct solutions.
3. Isolate each session and checkout. Pin prompts, repository, model, effort, provider configuration, tools and budget. Separate baseline, original rules, v3 and v5 without shared conversation, memory or mutable fixtures. Randomize paired order; never compare unmatched revisions as a clean pair.
4. Authorize the exact providers, models, study and spend ceiling explicitly. An instruction to improve AER is not permission for paid evaluation. CI stays provider-free.

Archive every attempted run:

| Dimension | Required record |
| --- | --- |
| Identity | Plan ID, authorization reference, provider/configuration without secrets, exact model/revision when available, host/tool versions, effort, repository revision |
| Task and treatment | Task ID/version, full prompt and contract hashes, treatment ID, expanded instruction bytes/hash, baseline identity, editable files, pair ID/order |
| Execution | Budget, enforcement and overshoot limits, start/end, timeout, retries, token breakdown, measured cost or unavailable cost, termination status |
| Scoring | Scorer/version, disclosed rubric, strict contract score, engineering-quality dimensions, reviewer disagreement, scoring status and uncertainty |
| Integrity | Hashes of prompts, outputs, diffs, check results, logs and final artifacts; artifact manifest and bundle digest; explicit missing/corrupt artifacts |

Execution success, artifact integrity, grading success, behavioral correctness and engineering quality are separate outcomes. Failed, skipped, crashed, timed-out, unavailable, empty, flaky and unresolved checks are not passes. Retain infrastructure failures and distinguish them from product failures. Never silently drop malformed rows or default missing prices, scores or statuses to success.

Measure owner repair, affected consumers, preserved contracts, real integration, lifecycle/recovery, unnecessary architecture, security/data obligations and human rework. Record completion before budget exhaustion and verification cost. Mocks and permanent-test volume do not prove production behavior. Distinguish direct exercises, regressions added, existing checks rerun and reasoned omissions.

A future report must expose per-run records, valid matched comparisons, failures and uncertainty before aggregates. Its HTML should make treatment, task, model, status, strict score, timeout, tokens, cost and artifact integrity inspectable and explain failed/inconclusive rows. Keep all attempts and predeclared exclusions. A repaired task, grader or harness gets a new version, never overwritten evidence. Do not speculate about provider incentives or model habits as the cause of retesting without evidence.
