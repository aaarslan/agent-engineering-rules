# Evaluation protocol

The compact-contract release has deterministic structural validation, not a new model-efficacy result. Do not transfer the historical 1.x outcome numbers to this corpus or claim comparative quality, latency, or token improvements until representative outcome runs are complete.

## Frozen inputs

- [`source/evals/directives.json`](../source/evals/directives.json) maps every stable directive to one owner, rationale, counterexample, and scenario.
- [`source/evals/scenarios.json`](../source/evals/scenarios.json) defines the behavioral situations and covered directive IDs.
- [`source/evals/treatments.json`](../source/evals/treatments.json) defines the closed, mechanically frozen version-1 baseline and compact treatment arms. An intentional arm change requires a new evaluation version and matching validator update.
- [`source/evals/experiments.v2.json`](../source/evals/experiments.v2.json) pre-registers six model-specific experiments, their exact arms, supported host/model overlays, scenarios, base treatments, pairing fields, and required instruction components. These cover final verification, bounded subagent count, cumulative instruction-group removal, GPT effort, duplicate instruction ingestion, and skill-catalog/skill-body size. Add a new registry version instead of changing an arm after inspecting outcomes. [`source/evals/cells.v2.json`](../source/evals/cells.v2.json) is the mechanically derived, byte-frozen 47-cell application plan: every row pins its task, host, scenario, arm, treatment, model, component hashes, instruction-assembly hash, expanded-instruction hash, execution-config hash, and factor value. [`source/evals/components.v2.json`](../source/evals/components.v2.json) pins the eight final composed component snapshots retained from the same freeze, so later corpus edits cannot silently redefine v2 plan bytes.
- [`source/evals/tasks.v2.json`](../source/evals/tasks.v2.json) and [`source/evals/graders.v2.json`](../source/evals/graders.v2.json) are closed executable manifests. Five distinct synthetic tasks cover every scenario used by the frozen experiments: bounded scope projection, changed-diagnostic recovery, exact record lifecycle, unavailable-evidence honesty, and duplicate instruction ingestion. Each task also selects the exact compact-task kernel, profile, catalog, and task-skill logical names and forbids plugin, hook, and policy components. Each repository fixture pins one task-owned interface/error contract by path, version, and exact hash; ordered case and expected-artifact fixtures remain the executable success oracle. Their declared coverage closes every planned cell exactly once, while every grader pins its exact rubric bytes and execution limits.
- [`source/evals/run.schema.json`](../source/evals/run.schema.json) defines the closed version-2 provenance record for each frozen experiment-cell run. It records the frozen cell ID; closed named and hashed instruction-assembly, expanded-instruction, and execution-config artifacts; typed kernel, profile, skill, plugin, hook, and policy component hashes; task-contract and grader-rubric hashes; the exact frozen experiment factor value applied by the selected arm; bounded subagent topology and roles; structured tool, test, and retry evidence; token totals; raw output, grader output, and named artifact hashes; and explicit provider authorization, reference, spend cap, run cost, and delegated spend. Semantic validation closes every ID against its registry and the task's declared coverage, requires cell tuples, factor values, component maps, artifact hashes, effort, and subagent caps to agree, and rejects host/provider, experiment-arm, topology, command, total, task/grader, or authorization inconsistencies. Version 2 deliberately rejects executable null-experiment treatment records: `host-baseline`, `compact-kernel`, `compact-verify`, and `compact-high-assurance` remain design treatments until a new version freezes their exact task/host application bytes.
- [`source/evals/run.example.json`](../source/evals/run.example.json) is a schema-valid structural fixture, not an evaluation result. Its `invalid` statuses, null scores, zero hashes, and `example-not-executed` values must never be reported as outcome evidence.

Changing a task, experiment, scenario, treatment, rubric, or directive after inspecting outcomes creates a new evaluation version. Keep held-out tasks separate from development examples. Preserve the exact expanded instructions plus raw model and grader outputs in the evaluation archive and hash their stored bytes into the run record. The run record deliberately uses canonical logical names and repository-relative working directories instead of local machine paths because local paths are neither portable nor durable.

## Free preflight

Run these before any provider-backed evaluation:

    node tools/preflight-evals.mjs
    node --test tools/preflight-evals.test.mjs
    node tools/validate-runtime-loads.mjs --json

Together these checks prove registry and schema closure, reference resolution, example-record validity, directive coverage, non-expired official-source metadata for host and model records, budget compliance, generated load order, duplicate-ID absence, declared-conflict absence, and host-cap compliance. The executable harness iterates every declared task and grader with provider access disabled; validates canonical contained paths, links, strict UTF-8/LF files, exact repository-to-contract hashes, read permissions, runtime readiness, loopback-only network and credential policy, bounded startup/execution/cleanup, artifact capture, and grader output. The lifecycle task executes identical initial/repeat calls, each disclosed invalid predicate, and recovery after rejection on one service instance. For every frozen cell, preflight loads hash-pinned final composed components produced through the distribution composition authority at freeze time, archives contained regular component/assembly/config files, reconstructs expanded instructions byte-for-byte, and derives the factor from captured bytes or parsed config. It rejects snapshot frontmatter/include leakage, wrong task components, duplicate verification fragments, incorrect kernel groups or copies, size drift, config drift, and missing, linked, oversized, or mutated artifacts. Current corpus composition is used only when preparing a new registry before outcomes. Host and model compatibility records remain freshness-validated external context; changing a v2 execution target requires a versioned snapshot or a new registry, never a silent cell rewrite.

A provider-backed runner must archive the canonical instruction assembly and execution config before the provider call, require explicit run authorization with a durable reference and positive spend cap, then use that exact parsed config as the sole source for the provider request and local subagent limiter. Frozen configs pin callable model aliases and use `requires-explicit-run-authorization`. `effort_mode: provider-default` always pairs with `requested_effort: null` and instructs the runner to omit the provider effort field; the literal sentinel must never be sent to a provider. The provider-free harness has a separate hard no-dispatch boundary and deliberately makes no provider call. Its archive checks prove captured instruction assembly and runner-requested configuration, not provider compliance, model behavior, or outcome improvement.

## Dormant live A/B path

[`tools/live-ab-eval.mjs`](../tools/live-ab-eval.mjs) prepares a small paired comparison of the host baseline and the current `standard` profile without dispatching a provider call. A configuration pins a full repository revision, task prompts and fixture hashes, supported host/provider/model/effort targets, the exact standard distribution artifact hash, a pre-registered randomization seed, and repetitions. Preparation deterministically randomizes the two arms within every task/target/repetition pair and gives each arm an opaque label. Withhold the seed, configuration, and execution plan from graders until their scores are frozen; publish them with the unblinded archive afterward:

    {
      "schema_version": 1,
      "plan_id": "standard-versus-baseline",
      "seed": "publish-after-scoring",
      "repository_revision": "<full-git-object-id>",
      "repetitions": 3,
      "tasks": [{
        "id": "bounded-change",
        "prompt": "Complete the bounded task and report exact evidence.",
        "working_directory": ".",
        "fixture_sha256": "<exact-fixture-sha256>"
      }],
      "targets": [{
        "id": "codex-medium",
        "host": "codex",
        "host_version": "<pinned-host-version>",
        "provider": "openai",
        "model": "<pinned-model>",
        "effort": "medium",
        "standard_artifact_directory": "codex-standard",
        "standard_artifact_sha256": "<exact-standard-distribution-sha256>"
      }]
    }

    node tools/live-ab-eval.mjs --prepare live-ab-config.json --archive live-ab-archive

Compute each `fixture_sha256` from the exact task working directory with the provider-free tree hasher before preparing the plan:

    node tools/live-ab-eval.mjs --hash-fixture fixture-root/task-directory

Compute `standard_artifact_sha256` the same way from the matching directory below the artifact root:

    node tools/live-ab-eval.mjs --hash-fixture artifact-root/codex-standard

The new archive contains exact `plan.json` bytes and their SHA-256 plus `grading-plan.json`, which omits the treatment mapping. Execution snapshots the hash-verified task and standard-artifact trees under `inputs/`, records their bounded manifest in `input-snapshots.json`, and writes the exact JSON request under `run-requests/` before every adapter dispatch. Keep those files, `plan.json`, `run-evidence/`, authorization evidence, and the execution summary unavailable to graders until scoring is frozen; give graders only the grading plan and blinded files under `runs/`. The grader files contain only opaque run identity, status, bounded output, and named artifact hashes; host versions, call counts, costs, fixture hashes, and applied-treatment hashes are kept in non-grader evidence. Reusing the same configuration produces the same pair order and labels. These public development fixtures are repeatable regression evidence, not held-out generalization evidence.

Reading a prepared plan remains provider-free and requires no credential, authorization, or adapter:

    node tools/live-ab-eval.mjs --plan live-ab-archive/plan.json

Live dispatch is deliberately dormant. `--execute` succeeds only when `AER_LIVE_EVAL_EXECUTE` equals the tool's explicit acknowledgement value and a non-expired authorization file binds all of the following:

- the exact plan and trusted local JavaScript adapter hashes;
- a durable approval reference and strict future expiry;
- exact allowed providers and models;
- a call maximum, total USD cap, per-call USD cap, and bounded timeout.

The authorization is a separate, closed JSON document; replace every placeholder from reviewed evidence rather than copying an example value:

    {
      "schema_version": 1,
      "authorized": true,
      "plan_sha256": "<exact-plan-sha256>",
      "adapter_sha256": "<exact-reviewed-adapter-sha256>",
      "reference": "<durable-approval-reference>",
      "expires_at": "<strict-future-UTC-instant>",
      "allowed_providers": ["openai"],
      "allowed_models": ["<pinned-model>"],
      "max_calls": 6,
      "spend_cap_usd": 3,
      "per_call_spend_cap_usd": 0.5,
      "timeout_ms_per_call": 60000
    }

The runner stages the exact hash-authorized, self-contained adapter bytes in a private temporary directory and invokes them through Node with an option terminator and `shell: false`. It sends one bounded JSON request on standard input and accepts one bounded JSON response. Before dispatch, it freezes and verifies the declared fixture and standard-artifact trees in the archive. For every arm, it copies the frozen fixture to a fresh bounded workspace, re-verifies the copy, creates fresh home and temporary directories, and passes only basic process variables plus credentials associated with the selected provider. The baseline request omits both `active_profile` and artifact-directory access; the treatment request sets `active_profile` to `standard` and supplies a fresh copy of the frozen standard artifact. Configuration files reject credential-like fields, input snapshots reject known credential values, authorization contents are not copied into the archive, known credential values in adapter output abort the run before output is archived, and blinded result files omit treatment, host-version, cost, and provider-call evidence. The committed tests use only a fake local adapter and assert zero provider calls in default mode, exact arm selection, fresh workspaces, isolated user configuration, frozen inputs and requests, credential-output rejection, runtime spend rejection, and mid-run expiry:

    node --test tools/live-ab-eval.test.mjs

A real adapter remains a trusted, self-contained evaluation component. The runner supplies a verified fresh fixture as its current directory and, only for the treatment arm, the frozen standard artifact at the request's relative artifact directory. The adapter must verify the actual host version, install no Agent Engineering Rules material for `host-baseline` or install the supplied artifact for `standard`, enforce the request's per-call cap before dispatch, and return the observed host version, measured cost, applied artifact hash, bounded output, and named artifact hashes. The runner compares these claims with the plan and archives the exact request and input bytes. It still cannot independently attest provider behavior, actual remote calls/cost, or what the trusted adapter did after launch, and cannot retroactively prevent a faulty provider or adapter from exceeding a request-side limit. The declared Git revision remains a provenance reference rather than an independently queried remote ref; the frozen fixture bytes are the executable input authority. Keep provider credentials out of command arguments and archives. Keep the live archive outside both input roots so creating it cannot change an input tree.

After separately reviewing the prepared plan and authorization, set `AER_LIVE_EVAL_EXECUTE=I_UNDERSTAND_PROVIDER_CALLS` in the invoking shell and run:

    node tools/live-ab-eval.mjs --plan live-ab-archive/plan.json --authorization live-ab-authorization.json --adapter trusted-adapter.mjs --workspace fixture-root --artifacts artifact-root --execute

This live A/B contract is separate from the frozen version-2 experiment registry. Its results must not be relabeled as version-2 experiment cells or used to make comparative claims without the declared repetitions, blinded scoring, raw outputs, failures, costs, and limitations.

## 2026-08-31 UI pilot response

An external one-shot UI benchmark compared AER 3.0.1 with a host baseline across three models and three workloads. It supplied one observation per cell. The tool and evidence failures documented by that benchmark informed 3.1.0, but the sample does not establish a statistically reliable quality improvement and this release makes no efficacy claim.

| Requirement | 3.1.0 disposition |
| --- | --- |
| 1. File-size guard | Fixed. The supported Node utility has explicit CLI and stdin-hook contracts, classifies every result, remains advisory by default, preserves Git/generation/override exceptions, and adds cheap density evidence without treating 500 physical lines as a verdict. The superseded Python path is retired. |
| 2. Contrast checker | Fixed. The core opaque-pair calculation is retained with help, named JSON batching, exact pair output, explicit exit semantics, unsupported-input errors, and scoped rerun guidance. |
| 3. Slop scan | Fixed. The supported Node utility accepts roots, files, and globs; handles root-static and `src/` projects; excludes generated/vendor/build output; and separates findings, review, not-applicable, and errors. The superseded shell path is retired. No quality claim is inferred from completion. |
| 4. Evidence and functional validation | Fixed in the canonical contract and feature/UI guidance. Empty, malformed, unsupported, irrelevant, or unobserved output is not a pass; exit zero alone is insufficient; untracked greenfield output is enumerated without staging; and prompt-critical state assertions outrank repeated structural checks. |
| 5. Responsive and prompt fidelity | Fixed in on-demand UI guidance with representative desktop/mobile checks, page-versus-component overflow, preserved requested form factors/navigation, and honest treatment of optional concept controls. |
| 6. UI quality dimensions | Fixed. Composition/prompt hierarchy, functional/responsive behavior, and accessibility/safety/recovery are evaluated and reported independently. Framework choice, file count, LOC, and ARIA volume are not proxies. |
| 7. Framework and dependencies | Fixed. Empty single-screen prototypes default to platform-native code unless a concrete benefit exists; frameworks remain available when justified; direct dependencies must be repository-approved or exactly pinned for reproducible work. |
| 8. Progressive disclosure | Retained and sharpened. UI detail remains on demand; React/TypeScript, testing, security, and verification routes now have mechanical triggers; selected single-owner directives are checked across representative simultaneous loads. |
| 9. Recovery and safe rendering | Intentionally retained and regression-tested: safe text APIs/framework escaping, visible corrupt-storage recovery without overwrite, keyboard equivalents, focus lifecycle, reduced motion/focus visibility, and reachable states only. |
| 10. Resources and assurance profiles | Fixed. Self-contained prototypes default to system/local resources unless remote use is requested or justified; fallbacks/offline relevance are reported. Prototype reduces ceremony, not correctness, security, integrity, accessibility, or prompt adherence; maintained/persistent/extendable work routes to standard. |
| 11. Regression coverage | Fixed for deterministic repository scope: fresh-build distribution identity, source/manifest/link/budget/metadata checks, host guidance placement, supported CLI contracts, tool applicability semantics, and benchmark-derived guidance placement checks. The byte-frozen v2 arms, cells, tasks, and graders remain unchanged; the omitted composed component bytes are now retained as separately frozen snapshots so v2 stays reconstructable. Executable UI outcome fixtures are deferred to a new versioned registry because v2 has no browser-UI contract and must not be rewritten after outcomes. |

### Follow-up randomized A/B design

The broader application comparison remains unrun and requires explicit cost authorization. Before dispatch, create a new byte-frozen registry for root-static and React/TypeScript UI tasks, then:

1. Run repeated trials rather than one observation per cell: start with at least 10 repetitions per model/workload/arm and size a confirmatory run from observed variance and predeclared minimum effects.
2. Randomize arm order within model/workload blocks, use opaque run and arm labels, balance time of day, and keep concurrency, retry policy, host/account load, browser, dependencies, and timeouts matched. Retry an entire affected paired block; retain infrastructure failures for reliability analysis.
3. Keep treatment mappings, paths, and model/arm labels from graders until scores freeze. Use multiple blinded raters and score separately: visual composition/prompt form factor; functional/responsive behavior; and semantics/keyboard/focus/motion/contrast/safe rendering/recovery.
4. Use evaluator-owned browser assertions. At minimum, verify page overflow versus intentional local scrollers; required navigation; visible note/log/hydration state changes; search/filter results; correct keyboard row activation; Escape and focus return; safe text rendering; corrupt-storage recovery; computed contrast for preselected actual pairs; external requests; and console errors.
5. Archive tracked and untracked authored output without staging it, exact tool argv/stdin/result class/exit/output, causal edits, runtime, retries, dependency versions, external requests, and uncached/input/output/reasoning tokens. A pass requires the expected artifact or state observation, not merely exit zero.

Publish raw outcomes, failures, rating disagreement, costs, and limitations before making any comparative claim. The 3.1.0 deterministic release gates do not substitute for this experiment.

## Outcome evaluation

The current version-2 runner contract supports only the six frozen compact-task experiments. Before running the broader treatment comparison, publish a new byte-frozen application registry that binds every task and host to exact components, assembly, expanded instructions, and execution config; do not relabel a version-2 experiment cell as another treatment. Then use at least the supported Claude Code and Codex surfaces, current pinned model snapshots, blinded grading where practical, and tasks that exercise direct execution, plan reuse, contract changes, migration integrity, security boundaries, failed-check recovery, delegation, and high-assurance traceability. Compare correctness and policy adherence first; report latency, input/output tokens, tool calls, and external cost separately.

Provider-backed runs may incur cost and are intentionally not launched by repository validation. Before starting one, record affirmative authorization, a durable authorization reference, and a positive spend cap; the run and delegated spend must remain within that cap. Publish failures and inconclusive results with successes, and avoid aggregate claims that hide host- or scenario-specific regressions.
