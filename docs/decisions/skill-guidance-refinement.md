# Skill guidance and diagnostic corrections

Baseline: clean `main` at `8be91c0ae218d40343badef7e29f75694d1e4240`,
`@aaarslan/aer` 6.0.1. The supplied source archive SHA-256 was
`a889ec6d7a58e817c8c1c15c2dd193d6db5ad6ac057bf7fea50787da79aed570`.
Both supplied Library references were materialized and read. No newer local
changes needed reconciliation. The old installer experiment was not adopted.

## Bounded sanity check

The audit's reported passages and diagnostic paths exist at this HEAD. Confirmed
technical defects are unknown git-show failures reported as zero baseline,
unsafe numeric overrides, silent out-of-sRGB conversion clipping, and lexical
HTML patterns presented as established unsafe findings. Focused-scan advisory
exits were intentional and documented; changing them is an explicit contract
correction, not discovery of undocumented behavior.

Mandatory review bookkeeping conflicts with a read-only reviewer; portable
fork assumptions belong in the restricted Claude adapter. Defaults on an
existing column do not repair existing NULLs, and not every migration runs once.
Test-last and broad planning restrictions conflict with proportional work.
Universal layering, wrappers, boolean remodeling and query bans are editorial
heuristics being narrowed, not demonstrated model-quality defects. Existing
proportional verification, requested-outcome completion, integrity, permission
controls and concrete accessibility obligations remain.

Primary-source checks, 23 October 2026:

- [PostgreSQL ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html)
  distinguishes defaults from existing-row updates and constraint validation.
- [Flyway repeatable migrations](https://documentation.red-gate.com/fd/repeatable-migrations-273973335.html)
  and [Django historical models](https://docs.djangoproject.com/en/6.0/topics/migrations/#historical-models)
  narrow applied-history immutability without authorizing casual rewrites.
- [RFC 9110, 9.2.2](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.2)
  allows retrying a non-idempotent request known not to have applied.
- [TypeScript aliases](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#type-aliases)
  do not create nominal types; [SQLite](https://www.sqlite.org/np1queryprob.html)
  gives a concrete exception to a universal N+1 prohibition.
- [OWASP HTML sanitization](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html#html-sanitization)
  supports intentionally sanitized rich HTML; lexical names do not establish
  provenance or exploitability.
- [CSS Color 4](https://www.w3.org/TR/2026/CRD-css-color-4-20261022/#gamut-mapping)
  distinguishes gamut mapping from channel clipping. It is a draft, not proof
  of deployed-browser equivalence. This diagnostic rejects wider-gamut input
  and accepts only conversion roundoff within 1e-7 linear sRGB channels.

## Implementation and compatibility

Edit canonical `source/shared/`, skill bodies and the affected kernel
clauses, then regenerate mapped consumers and payload inventory. Preserve all
13 skill names, AE identifiers, UI-01, client metadata and native controls. The
Claude adapter already owns its read-only tools and caller-context limits;
portable skill prose no longer assumes every host implements those restrictions.
Review stays read-only; remediation requires an authorized implementation step.

The size diagnostic resolves a literal HEAD tree entry before reading its blob.
Successful absence, known line count and unavailable evidence are distinct;
Git errors cannot create zero-baseline growth claims. Existing advisory size
exit behavior remains. The override must be a positive safe integer; an omitted
or empty override retains the configured default.

The scanner retains its small lexical scope. HTML output category, severity,
summary field and resulting fingerprints intentionally change to avoid claiming
proven unsafety. No in-repository active consumer depends on the old label.
Focused file/glob omissions remain visible, but cannot alone cause exit 1.
Contrast exit codes remain 0/1/2, with failures narrowed to selected text pairs.
External consumers parsing these textual labels must update their expectations.

The exact unchanged 6.0.1 `historyRecord()` was captured before any payload edit
and appended to `integrations/payload-history.json`. A real old-package install
and candidate upgrade use custom skills, profile, instruction filename and two
client destinations; consumer text and extra files survive update/uninstall.
Existing lifecycle regressions cover collision, modified-file refusal, obsolete
resource removal and interruption recovery. No ownership assertion is weakened.

The live semantic map tracks the AE-06/AE-11 refinements; frozen research bytes
remain untouched.

No model trials were run. These changes make no efficacy or certification claim.

## Repository boundary recommendation

Keep one product repository for now. The npm allowlist already excludes
`research/`, `evals/`, `test/`, `tools/` and historical evidence. A second repository
would improve development ownership and organization, not shipped package size.
No second remote, file move, historical deletion or CI change is made here.

Keep with AER:

- Installer, ownership/recovery and diagnostic regression tests, packed and legacy
  checks, including the immutable v5 fixture and its assertions.
- `source/shared/`, generation maps and every bundled runtime reference. Each
  independently distributed skill must remain usable on its own.
- Current routing/manual-only assertions and runtime-load budgets, even though
  their present validators live partly under research commands.
- Release ownership history and the product's current directive/requirement
  traceability. These are product contracts, not evidence of model efficacy.

Move candidates, when independent research work justifies another repository:
`evals/behavior/` and fixture calibration, frozen historical research/evals v2
components/designs, study-record tools/tests/protocol templates, historical
comparison outputs, future model transcripts, benchmarks and bulky evidence.
There is no current provider-dispatch runner to extract.

A precise future migration sequence:

1. Inventory source paths, owners, hashes and relative links. Assign a product
   maintainer to runtime contracts and a research maintainer to experiments.
   Copy historical material with provenance and immutable revision/hash records;
   verify copies before considering any separately authorized removal.
2. Separate product assertions from research validators: `test/content.test.mjs`
   imports `routingErrors` from `tools/validate-evals.mjs` and reads
   `evals/routing/catalog-cases.json`. Keep that current routing contract in AER.
   `tools/validate-runtime-loads.mjs` imports payload/block/thresholds and protects
   actual loads, so it must remain a product release gate.
3. Split current traceability from frozen-history verification inside
   `tools/validate-corpus.mjs`. Move `tools/study-record.mjs` and its test with the
   protocols, after removing that test from the product test composition in a
   separately reviewed change. Keep all runtime tests and immutable v5 coverage.
4. Research should consume a pinned AER package/revision and source identity,
   never reconstruct a candidate from a mutable main checkout. Preserve result
   ownership, input hashes, licensing and sanitizer rules for public evidence.
5. Update relative evidence links in `docs/evaluation.md`, decision records,
   research indexes and manifests to immutable research references. Review
   `prepublishOnly` -> `release:check` -> runtime/research composition so product
   publication requires product contracts, while historical/model studies have
   separate opt-in gates. Current required gates remain intact on this branch.

This boundary can be extracted later without delaying the authorized corrections.

## Observed verification

On Node 24.21.0, Darwin arm64:

- `npm test`: 42 passed, including the focused diagnostic regressions.
- `npm run validate`: public-content, inventory/schema/resources/native metadata
  and links passed. `git diff --check` passed.
- `npm run test:legacy`: all 77 immutable v5 checks passed; no fixture edits.
- `npm run test:packed`: complete 87-file allowlist and isolated lifecycle passed,
  including packed interruption/recovery, modified-file refusal, uninstall and
  the pinned v5 exit. A first attempt could not write the shared npm cache;
  rerunning only this component with a task-local cache passed.
- Corpus validation passed 26 directives, 6 scenarios, 110 grievances and 37
  frozen files after synchronizing the live semantic map. Fixture validation
  passed 140 routing cases, 39 behavior cases, 13 baselines and 18 calibrated
  checks with zero model trials. The sandbox initially blocked the fixture's
  loopback listener; rerunning that component with authorized loopback access
  passed. Runtime-load validation passed 54 scenarios (maximum block 7118 bytes).
- A disposable install from the actual unchanged 6.0.1 checkout upgraded to the
  final candidate, retained custom selection/profile/instruction/destination
  settings and native controls, then uninstalled with consumer bytes intact.

The encompassing release command stopped at the initial cache failure. Its
remaining/invalidated components were run separately as described above rather
than duplicating already-valid suites. No final-client probe, remote host change,
provider campaign, push, PR, release or publication occurred.
