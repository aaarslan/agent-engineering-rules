# Tools

All tooling is dependency-free. The public CLI installs into an explicitly selected project; validation stays in this repository.

| Authority | Role |
| --- | --- |
| `aer.mjs` | Project-local init, update, doctor, uninstall, and explicit optional diagnostic dispatch |
| `manifest.mjs` | Single source-to-host mapping, including runtime copy destinations |
| `install-distribution.mjs` | Hash-owned payload lifecycle, safe boundaries, collision refusal and interrupted-update recovery |
| `aer-verify.mjs` | Selects exactly one contrast, slop or size diagnostic and preserves its result |
| `contrast-check.mjs`, `slop-scan.mjs`, `file-size-guard.mjs` | Internal diagnostic implementations; see [the public contracts](../INSTALL.md#optional-diagnostics) |
| `build-distributions.mjs` | Deterministic source composition into host distributions; repository-only |
| `validate-source.mjs` | Source metadata, links, includes, ownership and budgets |
| `validate-corpus.mjs` | Live directive/scenario/grievance closure, historical digests, compatibility and policy |
| `validate-runtime-loads.mjs` | Composed automatic and task instruction loads, including mandatory-read safeguards |
| `validate-distributions.mjs` | Fresh-build identity and host layout contracts; does not rerun the installer test suite |
| `validate-public-content.mjs` | Rejects machine-specific paths from public artifacts |
| `study-record.mjs` | Repository-only frozen protocol and imported artifact/record validation; no execution, grading, aggregation, or spending authority |
| `packed-install-smoke.mjs` | Packs and installs locally with an isolated npm prefix/cache, then exercises the installed CLI and payload |

`npm test` covers meaningful structural, diagnostic and installation regressions. `npm run validate` checks source and distributions. `npm run validate:research` tests the small corpus validator and verifies frozen inputs and load plans without executing model tasks. `npm run test:packed` checks the actual npm artifact. `npm run release:check` composes these gates before publication.

A consumer can invoke `node agent-rules/tools/aer-verify.mjs <contrast|slop|size> <arguments>`. No selected diagnostic means a usage error, not an automatic scan. Diagnostics never run project test scripts or a completion gate. Their mathematical or lexical output is limited evidence, not a quality certification.

Runtime modules ship once at package root under `tools/`; the installer copies their declared destinations through its normal ownership checks. Generated host distributions contain rule/configuration data, not duplicate runtime modules. Research inputs, tests, validators and the builder do not enter the package runtime.

The retired v3 evaluation harness and rejected v4 runtime/bench remain retrievable from their historical Git revisions; [evaluation policy](../docs/evaluation.md) records the limits. There are no paid provider adapters in the v5 release path.

The [evidence workflow](../docs/evidence/README.md) documents optional `freeze` and
`validate` commands for study records. Synthetic format tests run in the research
gate. The validator is excluded from the package runtime and never becomes a
consumer completion gate.
