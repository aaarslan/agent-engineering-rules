import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  experimentTaskCoverage, frozenComponentSnapshotErrors, frozenEvaluationHashErrors, readinessFailureCleanupProbe, portableRelativePathError, taskCaseFixtureErrors,
  taskContractLinkErrors, utf8LfErrors, validateCellArchive, validateNoProviderHarness, writeCellArchive,
} from './preflight-eval-harness.mjs';
import { exactUrlSourceMatch, registryEnumErrors, reviewWindowErrors, runRecordSemanticErrors, schemaValidationErrors } from './preflight-evals.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(repo, 'source/evals');
const zero = '0'.repeat(64);
const clone = (value) => structuredClone(value);
const harnessPromise = validateNoProviderHarness();

async function fixtureContext() {
  const harness = await harnessPromise;
  assert.deepEqual(harness.errors, []);
  const models = JSON.parse(await readFile(path.join(repo, 'source/compatibility/models.json'), 'utf8'));
  return { harness, context: {
    tasks: harness.tasks,
    graders: harness.graders,
    experimentArms: harness.experimentArms,
    experiments: harness.experiments,
    cellPlans: harness.cellPlans,
    overlays: new Map(models.overlays.map((overlay) => [overlay.id, overlay])),
  } };
}

function frozenCells(harness) {
  if (harness.cellPlans instanceof Map) return [...harness.cellPlans.values()];
  if (Array.isArray(harness.cellPlans)) return harness.cellPlans;
  return harness.cellPlans?.cells ?? [];
}

function recordForCell(example, cell, context) {
  const record = clone(example);
  const task = context.tasks.get(cell.task_id);
  const ref = (value) => ({ name: value.name, sha256: value.sha256, content_type: value.content_type });
  record.task_id = cell.task_id;
  record.task_contract_sha256 = task.task_contract_sha256;
  record.scenario_id = cell.scenario_id;
  record.treatment_id = cell.treatment_id ?? cell.base_treatment_id;
  record.experiment_id = cell.experiment_id;
  record.experiment_arm_id = cell.experiment_arm_id ?? cell.arm_id;
  record.experiment_factor_value = clone(cell.factor_value);
  record.cell_id = cell.cell_id;
  record.host = cell.host;
  record.provider = cell.provider;
  record.model = cell.model;
  record.effort = cell.effort;
  record.instructions.components = clone(cell.components ?? cell.instructions.components);
  record.instructions.expanded_artifact = ref(cell.expanded_instructions ?? cell.expanded_artifact);
  record.instruction_assembly = ref(cell.instruction_assembly);
  record.execution_config = ref(cell.execution_config);
  const componentArtifactsValue = cell.component_artifacts ?? cell.artifacts?.components ?? [];
  const componentArtifacts = Array.isArray(componentArtifactsValue)
    ? componentArtifactsValue
    : Object.entries(componentArtifactsValue).map(([name, value]) => ({ name, ...value }));
  for (const artifact of [
    ...componentArtifacts,
    cell.expanded_instructions ?? cell.expanded_artifact,
    cell.instruction_assembly,
    cell.execution_config,
  ]) record.artifacts[artifact.name] = { sha256: artifact.sha256, content_type: artifact.content_type };
  record.subagents = { count: 0, max_depth: 0, spend_usd: 0, nodes: [] };
  return record;
}

test('greenfield evaluation registries omit the historical release treatment', async () => {
  const treatments = JSON.parse(await readFile(path.join(source, 'treatments.json'), 'utf8'));
  const runSchema = JSON.parse(await readFile(path.join(source, 'run.schema.json'), 'utf8'));
  const treatmentIds = treatments.treatments.map((treatment) => treatment.id);
  assert.deepEqual(treatmentIds, [
    'host-baseline', 'compact-kernel', 'compact-task', 'compact-verify', 'compact-high-assurance',
  ]);
  assert.equal(runSchema.properties.treatment_id.enum.includes('release-2.1.0'), false);
});

test('evaluation schema helper rejects extra fields and malformed closed token records', () => {
  const schema = {
    type: 'object',
    required: ['tokens'],
    properties: {
      tokens: {
        type: 'object',
        required: ['input', 'output', 'total'],
        properties: {
          input: { type: 'integer', minimum: 0 },
          output: { type: 'integer', minimum: 0 },
          total: { type: 'integer', minimum: 0 },
        },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  };
  assert.deepEqual(schemaValidationErrors({ tokens: { input: 1, output: 2, total: 3 } }, schema), []);
  assert.ok(schemaValidationErrors({ tokens: { input: -1, total: 3, cached: 4 }, extra: true }, schema).length >= 3);
});

test('evaluation schema helper enforces conditional scored and unscored records', () => {
  const scoreSchema = {
    type: 'object',
    required: ['grader_status', 'score'],
    properties: {
      grader_status: { enum: ['passed', 'invalid'] },
      score: { type: ['number', 'null'], minimum: 0, maximum: 1 },
    },
    allOf: [{
      if: { properties: { grader_status: { const: 'passed' } }, required: ['grader_status'] },
      then: { properties: { score: { type: 'number' } } },
      else: { properties: { score: { type: 'null' } } },
    }],
    additionalProperties: false,
  };
  assert.deepEqual(schemaValidationErrors({ grader_status: 'passed', score: 0.5 }, scoreSchema), []);
  assert.deepEqual(schemaValidationErrors({ grader_status: 'invalid', score: null }, scoreSchema), []);
  assert.ok(schemaValidationErrors({ grader_status: 'passed', score: null }, scoreSchema).length >= 1);
  assert.ok(schemaValidationErrors({ grader_status: 'invalid', score: 0 }, scoreSchema).length >= 1);
});

test('compatibility sources require an exact URL in an array', () => {
  const officialUrl = 'https://code.claude.com/docs/en/commands';
  assert.equal(exactUrlSourceMatch([officialUrl], officialUrl), true);
  assert.equal(exactUrlSourceMatch(officialUrl, officialUrl), false);
  assert.equal(exactUrlSourceMatch([`${officialUrl}.attacker.example`], officialUrl), false);
  assert.equal(exactUrlSourceMatch([`https://attacker.example/?next=${officialUrl}`], officialUrl), false);
  assert.equal(exactUrlSourceMatch([null, 42, {}], officialUrl), false);
});

test('evaluation registries and capability review windows are exact', () => {
  assert.deepEqual(registryEnumErrors('host', ['claude', 'codex'], ['claude', 'codex']), []);
  assert.ok(registryEnumErrors('host', ['claude', 'codex'], ['claude', 'other']).length >= 2);
  assert.deepEqual(reviewWindowErrors('model', '2026-08-29', '2026-11-29', '2026-08-29'), []);
  assert.match(reviewWindowErrors('model', '2026-08-29', '2026-08-28', '2026-08-29').join('\n'), /must be later|expired/);
  assert.match(reviewWindowErrors('model', '2026-08-29', '2026-08-30', '2026-08-31').join('\n'), /expired/);
});

async function validateFrozenFixture(harness, cell, { plan = cell, mutate = null } = {}) {
  const archive = await mkdtemp(path.join(tmpdir(), 'aer-eval-cell-test-'));
  try {
    await writeCellArchive(archive, harness.cellFixtures.get(cell.cell_id));
    await mutate?.(archive);
    return await validateCellArchive(plan, archive);
  } finally { await rm(archive, { recursive: true, force: true }); }
}

test('provider-disabled harness executes every task and grader with six frozen experiments', async () => {
  const { harness } = await fixtureContext();
  assert.equal(harness.metrics.provider_calls, 0);
  assert.equal(harness.metrics.tasks_executed, harness.metrics.tasks);
  assert.equal(harness.metrics.graders_executed, harness.metrics.graders);
  assert.equal(harness.metrics.tasks, 5);
  assert.equal(harness.metrics.cases_executed, 12);
  assert.equal(harness.metrics.experiments_registered, 6);
  assert.equal(harness.metrics.planned_experiment_cells, 47);
  assert.equal(harness.metrics.cell_archives_validated, 47);
});

test('version-2 experiment, cell, component, and executable fixture bytes are independently frozen', () => {
  assert.deepEqual(frozenEvaluationHashErrors({ cells: '0'.repeat(64) }), [
    'cells bytes changed after the version-2 freeze; create a new evaluation version for intentional changes',
  ]);
  assert.deepEqual(frozenEvaluationHashErrors({ unknown: '0'.repeat(64) }), ['unknown frozen evaluation document unknown']);
  assert.deepEqual(frozenEvaluationHashErrors({ components: '0'.repeat(64) }), [
    'components bytes changed after the version-2 freeze; create a new evaluation version for intentional changes',
  ]);
});

test('frozen component snapshots are closed, hash-pinned final composed bodies', () => {
  const bytes = Buffer.from('# Frozen component\n');
  const digest = createHash('sha256').update(bytes).digest('hex');
  const snapshotFile = 'evals/components/v2/kernel/contract.txt';
  const record = {
    logical_name: 'kernel/contract.md', snapshot_file: snapshotFile, sha256: digest, content_type: 'text/markdown',
  };
  const registry = { schema_version: 2, evaluation_contract_version: '2', components: [record] };
  const snapshots = new Map([[snapshotFile, { bytes, sha256: digest }]]);
  const required = new Set(['kernel/contract.md']);
  assert.deepEqual(frozenComponentSnapshotErrors(registry, required, snapshots), []);

  const duplicate = clone(registry);
  duplicate.components.push(clone(record));
  assert.ok(frozenComponentSnapshotErrors(duplicate, required, snapshots).some((error) => error.includes('logical names must be unique')));
  const missing = { ...clone(registry), components: [] };
  assert.ok(frozenComponentSnapshotErrors(missing, required, new Map()).some((error) => error.includes('logical names must be exactly')));
  const extra = clone(registry);
  extra.components.push({ ...clone(record), logical_name: 'skills/extra.md', snapshot_file: 'evals/components/v2/skills/extra.md' });
  assert.ok(frozenComponentSnapshotErrors(extra, required, snapshots).some((error) => error.includes('logical names must be exactly')));
  const wrongHash = clone(registry);
  wrongHash.components[0].sha256 = zero;
  assert.ok(frozenComponentSnapshotErrors(wrongHash, required, snapshots).some((error) => error.includes('hash does not match')));

  for (const invalidText of ['---\nname: leaked\n---\n# Body\n', '# Body\n{{include:kernel/contract.md}}\n']) {
    const invalidBytes = Buffer.from(invalidText);
    const invalidDigest = createHash('sha256').update(invalidBytes).digest('hex');
    const invalidRegistry = clone(registry);
    invalidRegistry.components[0].sha256 = invalidDigest;
    const invalidSnapshots = new Map([[snapshotFile, { bytes: invalidBytes, sha256: invalidDigest }]]);
    assert.ok(frozenComponentSnapshotErrors(invalidRegistry, required, invalidSnapshots).some((error) => error.includes('final composed body')));
  }
});

test('experiment task coverage rejects missing scenario and arm cells', async () => {
  const tasks = JSON.parse(await readFile(path.join(source, 'tasks.v2.json'), 'utf8')).tasks;
  const experiments = JSON.parse(await readFile(path.join(source, 'experiments.v2.json'), 'utf8')).experiments;
  assert.deepEqual(experimentTaskCoverage(tasks, experiments).errors, []);
  assert.equal(experimentTaskCoverage(tasks, experiments).cells.length, 47);

  const missingArm = clone(tasks);
  missingArm.find((task) => task.scenario_id === 'scope-and-ownership').experiment_coverage
    .find((coverage) => coverage.experiment_id === 'gpt-instruction-group-removal').arm_ids.pop();
  assert.ok(experimentTaskCoverage(missingArm, experiments).errors.some((error) => error.includes('scope-and-ownership arm no-kernel-groups')));

  const missingScenario = tasks.filter((task) => task.scenario_id !== 'evidence-economics-and-truth');
  assert.ok(experimentTaskCoverage(missingScenario, experiments).errors.some((error) => error.includes('scenario evidence-economics-and-truth')));

  const ambiguous = [...tasks, { ...clone(tasks[0]), id: 'second-scope-task' }];
  assert.ok(experimentTaskCoverage(ambiguous, experiments).errors.some((error) => error.includes('must have exactly one executable task')));
});

test('repository hashes, task contracts, errors, and lifecycle cases are exact', async () => {
  const tasks = JSON.parse(await readFile(path.join(source, 'tasks.v2.json'), 'utf8')).tasks;
  const task = tasks.find((entry) => entry.id === 'synthetic-normalize-record-v2');
  const contractBytes = await readFile(path.join(repo, 'source', task.task_contract_fixture));
  const contract = JSON.parse(contractBytes.toString('utf8'));
  const repository = JSON.parse(await readFile(path.join(repo, 'source', task.repository_fixture), 'utf8'));
  const input = JSON.parse(await readFile(path.join(repo, 'source', task.input_fixture), 'utf8'));
  const expected = JSON.parse(await readFile(path.join(repo, 'source', task.expected_artifact_fixture), 'utf8'));
  const hash = createHash('sha256').update(contractBytes).digest('hex');
  assert.deepEqual(taskContractLinkErrors(task, repository, contract, hash), []);
  assert.deepEqual(taskCaseFixtureErrors(task, contract, input, expected), []);

  const wrongRepository = clone(repository);
  wrongRepository.task_contract_sha256 = zero;
  assert.ok(taskContractLinkErrors(task, wrongRepository, contract, hash).some((error) => error.includes('exact contract bytes')));
  const wrongContract = clone(contract);
  wrongContract.task_id = 'different-task';
  assert.ok(taskContractLinkErrors(task, repository, wrongContract, hash).some((error) => error.includes('task IDs')));
  const wrongError = clone(expected);
  wrongError.cases[2].body = { error: 'different' };
  assert.ok(taskCaseFixtureErrors(task, contract, input, wrongError).some((error) => error.includes('not exactly disclosed')));
  const wrongRepeat = clone(input);
  wrongRepeat.cases[1].request.display_name = 'Different';
  assert.ok(taskCaseFixtureErrors(task, contract, wrongRepeat, expected).some((error) => error.includes('repeated-use')));
});

test('harness path and UTF-8/LF guards reject non-portable or ambiguous inputs', () => {
  assert.match(portableRelativePathError('../escape.json'), /parent/);
  assert.match(portableRelativePathError('C:/private.json'), /relative/);
  assert.match(portableRelativePathError('nested/output.json', { flat: true }), /flat/);
  assert.equal(portableRelativePathError('evals/fixtures/task-input.v2.json'), null);
  assert.ok(utf8LfErrors(Buffer.from('\ufeff{}\n'), 'bom').some((error) => error.includes('BOM')));
  assert.ok(utf8LfErrors(Buffer.from('{}\r\n'), 'crlf').some((error) => error.includes('LF line endings')));
  assert.ok(utf8LfErrors(Buffer.from('{}'), 'terminal').some((error) => error.includes('end with LF')));
  assert.ok(utf8LfErrors(Buffer.from([0xc3, 0x28, 0x0a]), 'utf8').some((error) => error.includes('valid UTF-8')));
});

test('archive validation derives every factor and rejects reused, mutated, missing, oversized, or linked evidence', async (t) => {
  const { harness } = await fixtureContext();
  const cells = frozenCells(harness);
  const byFactor = (factor, arm = null) => cells.find((cell) => cell.factor_name === factor && (arm === null || cell.arm_id === arm));
  const factorMutations = [
    [byFactor('generic_final_verification', 'present'), false],
    [byFactor('loaded_instruction_groups', 'all-kernel-groups'), ['authority-and-scope']],
    [byFactor('universal_instruction_copies', 'duplicated-root-files'), 1],
    [byFactor('skill_catalog_and_selected_body_scale', 'at-target'), { catalog_characters: 2001, selected_skill_estimated_tokens: 800 }],
    [byFactor('effort', 'low'), 'medium'],
    [byFactor('maximum_subagents', 'one'), 2],
  ];
  for (const [cell, wrongValue] of factorMutations) {
    const plan = clone(cell);
    plan.factor_value = wrongValue;
    const result = await validateFrozenFixture(harness, cell, { plan });
    assert.ok(result.errors.some((error) => error.includes(`derived ${cell.factor_name}`)), cell.factor_name);
  }

  const verificationAbsent = byFactor('generic_final_verification', 'absent');
  const fragment = Buffer.from('Before reporting completion, run one final verification pass over the requested outcome and report the exact result.\n');
  const duplicated = await validateFrozenFixture(harness, verificationAbsent, { mutate: async (archive) => {
    for (const name of ['kernel.md', 'expanded-instructions.txt']) {
      const original = await readFile(path.join(archive, name));
      await writeFile(path.join(archive, name), Buffer.concat([original, fragment, fragment]));
    }
  } });
  assert.ok(duplicated.errors.some((error) => error.includes('must occur zero or one time, found 2')));

  const verificationPresent = byFactor('generic_final_verification', 'present');
  const reusedPlan = clone(verificationPresent);
  reusedPlan.components = clone(verificationAbsent.components);
  reusedPlan.component_artifacts = clone(verificationAbsent.component_artifacts);
  reusedPlan.instruction_assembly = clone(verificationAbsent.instruction_assembly);
  reusedPlan.expanded_instructions = clone(verificationAbsent.expanded_instructions);
  reusedPlan.execution_config = clone(verificationAbsent.execution_config);
  const reused = await validateFrozenFixture(harness, verificationPresent, { plan: reusedPlan });
  assert.ok(reused.errors.some((error) => error.includes('bytes do not match frozen SHA-256')));

  const wrongProfile = clone(verificationAbsent);
  const profileHash = Object.values(wrongProfile.components.profile)[0];
  wrongProfile.components.profile = { 'profiles/high-assurance.md': profileHash };
  const wrongProfileResult = await validateFrozenFixture(harness, verificationAbsent, { plan: wrongProfile });
  assert.ok(wrongProfileResult.errors.some((error) => error.includes('profile logical components')));
  const wrongSkill = clone(verificationAbsent);
  const selectedSkill = Object.entries(wrongSkill.components.skill).find(([name]) => name !== 'skills/catalog.txt');
  delete wrongSkill.components.skill[selectedSkill[0]];
  wrongSkill.components.skill['skills/wrong.md'] = selectedSkill[1];
  const wrongSkillResult = await validateFrozenFixture(harness, verificationAbsent, { plan: wrongSkill });
  assert.ok(wrongSkillResult.errors.some((error) => error.includes('skill logical components')));

  const mutated = await validateFrozenFixture(harness, verificationAbsent, { mutate: (archive) => writeFile(path.join(archive, 'profile.md'), '# changed\n') });
  assert.ok(mutated.errors.some((error) => error.includes('bytes do not match frozen SHA-256')));
  const missing = await validateFrozenFixture(harness, verificationAbsent, { mutate: (archive) => rm(path.join(archive, 'task-skill.md')) });
  assert.ok(missing.errors.some((error) => error.includes('archive files must be exactly')));
  const oversized = await validateFrozenFixture(harness, verificationAbsent, { mutate: (archive) => writeFile(path.join(archive, 'kernel.md'), Buffer.alloc(1_048_577, 0x61)) });
  assert.ok(oversized.errors.some((error) => error.includes('exceeds 1048576 bytes')));

  const clean = await validateFrozenFixture(harness, verificationAbsent);
  assert.deepEqual(clean.errors, []);
  assert.equal(clean.config.call_policy, 'requires-explicit-run-authorization');
  assert.equal(clean.config.model, 'claude-opus-5');
  assert.equal(clean.config.effort_mode, 'provider-default');
  assert.equal(clean.config.requested_effort, null);
  assert.ok(!clean.config.model.includes('fixture'));
  const expanded = clean.artifacts.get('expanded-instructions.txt').toString('utf8');
  assert.ok(!expanded.startsWith('---\n'));
  assert.ok(!expanded.includes('{{include:'));
  assert.ok(!expanded.includes('{{core}}'));

  const realArchive = await mkdtemp(path.join(tmpdir(), 'aer-eval-real-root-'));
  const linkedArchive = `${realArchive}-link`;
  try {
    await writeCellArchive(realArchive, harness.cellFixtures.get(verificationAbsent.cell_id));
    try { await symlink(realArchive, linkedArchive, process.platform === 'win32' ? 'junction' : 'dir'); }
    catch (error) {
      if (error.code === 'EPERM' || error.code === 'EACCES') { t.diagnostic(`symlink negative unavailable: ${error.code}`); return; }
      throw error;
    }
    const linked = await validateCellArchive(verificationAbsent, linkedArchive);
    assert.ok(linked.errors.some((error) => error.includes('archive root must be one real directory')));
  } finally {
    await rm(linkedArchive, { recursive: true, force: true });
    await rm(realArchive, { recursive: true, force: true });
  }
});

test('failed readiness is bounded and the child is terminated', async () => {
  assert.equal(await readinessFailureCleanupProbe(), true);
});

test('run schema resolves component hash-map references', async () => {
  const schema = JSON.parse(await readFile(path.join(source, 'run.schema.json'), 'utf8'));
  const example = JSON.parse(await readFile(path.join(source, 'run.example.json'), 'utf8'));
  assert.equal(schema.$id, 'https://github.com/aaarslan/agent-engineering-rules/source/evals/run.schema.json');
  assert.deepEqual(schemaValidationErrors(example, schema), []);
  const invalid = clone(example);
  invalid.instructions.components.kernel.contract = 'not-a-hash';
  assert.ok(schemaValidationErrors(invalid, schema).some((error) => error.includes('must match')));
  const missingFactor = clone(example);
  delete missingFactor.experiment_factor_value;
  assert.ok(schemaValidationErrors(missingFactor, schema).some((error) => error.includes('experiment_factor_value')));
  const offExperimentFactor = clone(example);
  offExperimentFactor.experiment_factor_value = false;
  assert.ok(schemaValidationErrors(offExperimentFactor, schema).some((error) => error.includes('must have type null')));
  const experimentWithoutCell = clone(example);
  experimentWithoutCell.experiment_id = 'gpt-effort-sweep';
  experimentWithoutCell.experiment_arm_id = 'low';
  experimentWithoutCell.experiment_factor_value = 'low';
  assert.ok(schemaValidationErrors(experimentWithoutCell, schema).some((error) => error.includes('cell_id')));
  const executableTreatmentWithoutCell = clone(example);
  executableTreatmentWithoutCell.execution_status = 'passed';
  executableTreatmentWithoutCell.artifact_status = 'passed';
  assert.ok(schemaValidationErrors(executableTreatmentWithoutCell, schema).some((error) => error.includes('must equal "invalid"')));
  const openAssemblyRef = clone(example);
  openAssemblyRef.instruction_assembly.unexpected = true;
  assert.ok(schemaValidationErrors(openAssemblyRef, schema).some((error) => error.includes('unsupported property unexpected')));
  const wrongConfigType = clone(example);
  wrongConfigType.execution_config.content_type = 'text/plain';
  assert.ok(schemaValidationErrors(wrongConfigType, schema).some((error) => error.includes('application/json')));
});

test('run semantics close artifacts, task/grader identity, authorization, topology, commands, and totals', async () => {
  const { context } = await fixtureContext();
  const example = JSON.parse(await readFile(path.join(source, 'run.example.json'), 'utf8'));
  assert.deepEqual(runRecordSemanticErrors(example, context), []);

  const wrongTask = clone(example);
  wrongTask.task_contract_sha256 = zero;
  assert.ok(runRecordSemanticErrors(wrongTask, context).some((error) => error.includes('exact bytes')));

  const wrongGrader = clone(example);
  wrongGrader.grader.id = 'missing-grader';
  assert.ok(runRecordSemanticErrors(wrongGrader, context).some((error) => error.includes('requires grader')));

  const artifactMismatch = clone(example);
  artifactMismatch.instructions.expanded_artifact.sha256 = '1'.repeat(64);
  assert.ok(runRecordSemanticErrors(artifactMismatch, context).some((error) => error.includes('expanded instructions hash')));

  const unauthorizedPass = clone(example);
  unauthorizedPass.execution_status = 'passed';
  assert.ok(runRecordSemanticErrors(unauthorizedPass, context).some((error) => error.includes('explicit provider authorization')));
  assert.ok(runRecordSemanticErrors(unauthorizedPass, context).some((error) => error.includes('structural examples only')));

  const overspend = clone(example);
  overspend.provider_authorization = { authorized: true, reference: 'approval-1', spend_cap_usd: 1 };
  overspend.cost_usd = 2;
  assert.ok(runRecordSemanticErrors(overspend, context).some((error) => error.includes('exceeds the authorized')));

  const topology = clone(example);
  topology.provider_authorization = { authorized: true, reference: 'approval-1', spend_cap_usd: 1 };
  topology.subagents = {
    count: 2, max_depth: 2, spend_usd: 0,
    nodes: [
      { id: 'a', parent_id: 'b', role: 'scout', model: 'example', depth: 1, spend_usd: 0, status: 'invalid' },
      { id: 'b', parent_id: 'a', role: 'reviewer', model: 'example', depth: 2, spend_usd: 0, status: 'invalid' }
    ]
  };
  assert.ok(runRecordSemanticErrors(topology, context).some((error) => error.includes('cycle')));

  const evidence = clone(example);
  evidence.test_runs = [{ sequence: 2, command: ['node', '--test'], working_directory: '../outside', status: 'passed', exit_code: 1, duration_ms: 1, output_artifact: null }];
  assert.ok(runRecordSemanticErrors(evidence, context).some((error) => error.includes('sequence')));
  assert.ok(runRecordSemanticErrors(evidence, context).some((error) => error.includes('exit code 0')));
  assert.ok(runRecordSemanticErrors(evidence, context).some((error) => error.includes('working directory')));

  const totals = clone(example);
  totals.tokens.total = 1;
  assert.ok(runRecordSemanticErrors(totals, context).some((error) => error.includes('input plus output')));

  const componentKey = clone(example);
  componentKey.instructions.components.kernel['a/../b'] = zero;
  componentKey.instructions.components.policy['trailing/'] = zero;
  const componentErrors = runRecordSemanticErrors(componentKey, context);
  assert.ok(componentErrors.some((error) => error.includes('a/../b')));
  assert.ok(componentErrors.some((error) => error.includes('trailing/')));
});

test('experiment runs are closed to one covered frozen cell and its archived instruction/config refs', async () => {
  const { harness, context } = await fixtureContext();
  const example = JSON.parse(await readFile(path.join(source, 'run.example.json'), 'utf8'));
  const cells = frozenCells(harness);
  assert.equal(cells.length, 47);
  const cell = cells.find((candidate) => candidate.experiment_id === 'gpt-effort-sweep'
    && (candidate.experiment_arm_id ?? candidate.arm_id) === 'low'
    && candidate.task_id === 'synthetic-normalize-record-v2');
  const record = recordForCell(example, cell, context);
  assert.deepEqual(runRecordSemanticErrors(record, context), []);

  const uncoveredContext = { ...context, tasks: new Map(context.tasks) };
  const uncoveredTask = clone(uncoveredContext.tasks.get(record.task_id));
  uncoveredTask.experiment_coverage.find((entry) => entry.experiment_id === record.experiment_id).arm_ids = ['medium'];
  uncoveredContext.tasks.set(uncoveredTask.id, uncoveredTask);
  assert.ok(runRecordSemanticErrors(record, uncoveredContext).some((error) => error.includes('experiment_coverage does not contain')));

  const unknownCell = clone(record);
  unknownCell.cell_id = 'not-a-frozen-cell';
  assert.ok(runRecordSemanticErrors(unknownCell, context).some((error) => error.includes('unknown frozen cell')));

  const wrongTuple = clone(record);
  wrongTuple.experiment_arm_id = 'medium';
  wrongTuple.experiment_factor_value = 'medium';
  wrongTuple.effort = 'medium';
  assert.ok(runRecordSemanticErrors(wrongTuple, context).some((error) => error.includes('experiment_arm_id does not match')));

  const wrongFactor = clone(record);
  wrongFactor.experiment_factor_value = 'medium';
  assert.ok(runRecordSemanticErrors(wrongFactor, context).some((error) => error.includes('frozen cell') && error.includes('factor value')));

  const wrongAssembly = clone(record);
  wrongAssembly.instruction_assembly.sha256 = '1'.repeat(64);
  assert.ok(runRecordSemanticErrors(wrongAssembly, context).some((error) => error.includes('instruction assembly reference')));

  const missingConfigArtifact = clone(record);
  delete missingConfigArtifact.artifacts[missingConfigArtifact.execution_config.name];
  assert.ok(runRecordSemanticErrors(missingConfigArtifact, context).some((error) => error.includes('execution config references missing artifact')));

  const wrongComponents = clone(record);
  wrongComponents.instructions.components.profile['profiles/standard.md'] = '2'.repeat(64);
  assert.ok(runRecordSemanticErrors(wrongComponents, context).some((error) => error.includes('component hashes do not match')));

  const wrongLogicalSkill = clone(record);
  const [skillName, skillHash] = Object.entries(wrongLogicalSkill.instructions.components.skill)[1];
  delete wrongLogicalSkill.instructions.components.skill[skillName];
  wrongLogicalSkill.instructions.components.skill['skills/wrong.md'] = skillHash;
  assert.ok(runRecordSemanticErrors(wrongLogicalSkill, context).some((error) => error.includes('requires exact skill logical components')));

  const forbiddenPlugin = clone(record);
  forbiddenPlugin.instructions.components.plugin['plugins/unexpected.md'] = zero;
  assert.ok(runRecordSemanticErrors(forbiddenPlugin, context).some((error) => error.includes('forbids plugin')));

  const wrongEffort = clone(record);
  wrongEffort.effort = 'medium';
  assert.ok(runRecordSemanticErrors(wrongEffort, context).some((error) => error.includes('archived execution config')));

  const subagentCell = cells.find((candidate) => candidate.experiment_id === 'opus-subagent-count'
    && (candidate.experiment_arm_id ?? candidate.arm_id) === 'one');
  const subagent = recordForCell(example, subagentCell, context);
  subagent.subagents = { count: 2, max_depth: 1, spend_usd: 0, nodes: [
    { id: 'one', parent_id: null, role: 'worker', model: subagent.model, depth: 1, spend_usd: 0, status: 'invalid' },
    { id: 'two', parent_id: null, role: 'worker', model: subagent.model, depth: 1, spend_usd: 0, status: 'invalid' },
  ] };
  const subagentErrors = runRecordSemanticErrors(subagent, context);
  assert.ok(subagentErrors.some((error) => error.includes('exceeds its applied maximum')));
  assert.ok(subagentErrors.some((error) => error.includes('archived execution config maximum')));
});
