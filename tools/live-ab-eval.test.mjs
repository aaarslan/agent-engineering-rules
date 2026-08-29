import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  LIVE_AB_OPT_IN,
  createLiveAbPlan,
  executeLiveAbPlan,
  hashLiveAbFixture,
  liveAbAuthorizationErrors,
  prepareLiveAbArchive,
} from './live-ab-eval.mjs';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const hash = (character) => character.repeat(64);
const revision = 'a'.repeat(40);

function configuration(fixtureSha256 = hash('b'), standardArtifactSha256 = hash('c')) {
  return {
    schema_version: 1,
    plan_id: 'standard-versus-baseline',
    seed: 'published-seed-1',
    repository_revision: revision,
    repetitions: 2,
    tasks: [{
      id: 'bounded-change',
      prompt: 'Produce the requested bounded change and report exact evidence.',
      working_directory: '.',
      fixture_sha256: fixtureSha256,
    }],
    targets: [{
      id: 'codex-medium',
      host: 'codex',
      host_version: 'codex-test-1.0.0',
      provider: 'openai',
      model: 'gpt-test-snapshot',
      effort: 'medium',
      standard_artifact_directory: 'codex-standard',
      standard_artifact_sha256: standardArtifactSha256,
    }],
  };
}

function authorization(planSha256, adapterSha256) {
  return {
    schema_version: 1,
    authorized: true,
    plan_sha256: planSha256,
    adapter_sha256: adapterSha256,
    reference: 'approval-record-123',
    expires_at: '2030-01-01T00:00:00.000Z',
    allowed_providers: ['openai'],
    allowed_models: ['gpt-test-snapshot'],
    max_calls: 4,
    spend_cap_usd: 1,
    per_call_spend_cap_usd: 0.1,
    timeout_ms_per_call: 10_000,
  };
}

test('preparation is deterministic, paired, randomized, blinded, and provider-free', async () => {
  const config = configuration();
  const first = createLiveAbPlan(config);
  const second = createLiveAbPlan(config);
  assert.deepEqual(first, second);
  assert.equal(first.plan.provider_call_count, 4);
  assert.equal(first.plan.pairs.length, 2);
  for (const pair of first.plan.pairs) {
    assert.deepEqual(new Set(pair.dispatch_order.map((run) => run.treatment_id)), new Set(['host-baseline', 'standard']));
    assert.ok(pair.dispatch_order.every((run) => /^arm-[a-f0-9]{12}$/.test(run.blind_label)));
  }
  const possibleOrders = first.plan.pairs.map((pair) => pair.dispatch_order.map((run) => run.treatment_id).join(','));
  assert.ok(possibleOrders.every((order) => order === 'host-baseline,standard' || order === 'standard,host-baseline'));
  const gradingBytes = JSON.stringify(first.gradingPlan);
  assert.equal(gradingBytes.includes('host-baseline'), false);
  assert.equal(gradingBytes.includes('"standard"'), false);
  assert.equal(new Set(first.plan.pairs.map((pair) => pair.pair_id)).size, first.plan.pairs.length);

  const collisionConfig = configuration();
  collisionConfig.repetitions = 1;
  collisionConfig.tasks = [
    { ...collisionConfig.tasks[0], id: 'a' },
    { ...collisionConfig.tasks[0], id: 'a-b' },
  ];
  collisionConfig.targets = [
    { ...collisionConfig.targets[0], id: 'b-c' },
    { ...collisionConfig.targets[0], id: 'c' },
  ];
  const collisionPlan = createLiveAbPlan(collisionConfig).plan;
  assert.equal(new Set(collisionPlan.pairs.map((pair) => pair.pair_id)).size, collisionPlan.pairs.length);
  assert.equal(new Set(collisionPlan.pairs.flatMap((pair) => pair.dispatch_order.map((run) => run.run_id))).size, 8);

  const parent = await mkdtemp(path.join(tmpdir(), 'aer-live-ab-prepare-'));
  const archive = path.join(parent, 'archive');
  try {
    const prepared = await prepareLiveAbArchive(config, archive);
    assert.equal(prepared.providerCalls, 0);
    assert.equal(await readFile(path.join(archive, 'plan.sha256'), 'utf8'), `${prepared.planSha256}  plan.json\n`);
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test('default execution mode performs plan preflight without authorization or adapter dispatch', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'aer-live-ab-default-'));
  const archive = path.join(parent, 'archive');
  try {
    await prepareLiveAbArchive(configuration(), archive);
    const result = await executeLiveAbPlan({ planPath: path.join(archive, 'plan.json') });
    assert.deepEqual({ executed: result.executed, adapterDispatches: result.adapterDispatches, providerCalls: result.providerCalls, plannedCalls: result.plannedCalls }, {
      executed: false, adapterDispatches: 0, providerCalls: 0, plannedCalls: 4,
    });
    await assert.rejects(readFile(path.join(archive, 'authorization-evidence.json')), /ENOENT/);
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test('authorization closes plan, adapter, expiry, provider, model, call, and spend authority', () => {
  const plan = createLiveAbPlan(configuration()).plan;
  const valid = authorization(hash('d'), hash('e'));
  assert.deepEqual(liveAbAuthorizationErrors(valid, plan, hash('d'), hash('e'), new Date('2029-01-01T00:00:00.000Z')), []);
  const mutations = [
    ['plan hash', { plan_sha256: hash('f') }, 'exact plan bytes'],
    ['adapter hash', { adapter_sha256: hash('f') }, 'exact adapter bytes'],
    ['reference', { reference: ' ' }, 'durable'],
    ['expiry', { expires_at: '2028-01-01T00:00:00.000Z' }, 'future UTC'],
    ['provider', { allowed_providers: ['anthropic'] }, 'exactly equal'],
    ['provider extras', { allowed_providers: ['openai', 'anthropic'] }, 'exactly equal'],
    ['model', { allowed_models: ['different'] }, 'exactly equal'],
    ['model extras', { allowed_models: ['gpt-test-snapshot', 'different'] }, 'exactly equal'],
    ['calls', { max_calls: 3 }, 'exact plan'],
    ['spend', { spend_cap_usd: 0 }, 'spend_cap_usd'],
    ['per-call spend', { per_call_spend_cap_usd: 2 }, 'per_call_spend_cap_usd'],
  ];
  for (const [label, mutation, message] of mutations) {
    const errors = liveAbAuthorizationErrors({ ...valid, ...mutation }, plan, hash('d'), hash('e'), new Date('2029-01-01T00:00:00.000Z'));
    assert.ok(errors.some((error) => error.includes(message)), label);
  }
});

test('explicit execution uses a hash-authorized fake adapter with shell-free JSON dispatch and archives no credentials', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'aer-live-ab-execute-'));
  const archive = path.join(parent, 'archive');
  const workspace = path.join(parent, 'workspace');
  const artifacts = path.join(parent, 'artifacts');
  const standardArtifact = path.join(artifacts, 'codex-standard');
  const adapterDirectory = path.join(parent, 'adapter with spaces');
  const adapter = path.join(adapterDirectory, 'fake-adapter.mjs');
  const authorizationPath = path.join(parent, 'authorization.json');
  const fakeCredential = 'do-not-archive-this-provider-secret';
  try {
    await mkdir(workspace);
    await writeFile(path.join(workspace, 'fixture.txt'), 'exact fixture bytes\n');
    await mkdir(artifacts);
    await mkdir(standardArtifact);
    await writeFile(path.join(standardArtifact, 'AGENTS.md'), 'exact standard artifact bytes\n');
    await mkdir(adapterDirectory);
    const adapterSource = `
import { existsSync, writeFileSync } from 'node:fs';
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  const request = JSON.parse(input);
  if (request.working_directory !== '.') throw new Error('adapter did not receive the isolated workspace root');
  if (request.treatment_id === 'host-baseline' && Object.hasOwn(request, 'active_profile')) throw new Error('baseline received an active profile');
  if (request.treatment_id === 'standard' && request.active_profile !== 'standard') throw new Error('standard profile was not selected');
  if (request.treatment_id === 'host-baseline' && (Object.hasOwn(request, 'standard_artifact_directory') || existsSync('../standard-artifact'))) throw new Error('baseline received standard artifact bytes');
  if (request.treatment_id === 'standard' && (request.standard_artifact_directory !== '../standard-artifact' || !existsSync('../standard-artifact/AGENTS.md'))) throw new Error('standard artifact snapshot was not supplied');
  if (process.env.HOME === 'ambient-user-home' || process.env.USERPROFILE === 'ambient-user-home') throw new Error('ambient user home leaked');
  if (existsSync('prior-arm-mutation.txt')) throw new Error('an arm reused a prior workspace');
  writeFileSync('prior-arm-mutation.txt', request.run_id);
  const applied = request.treatment_id === 'standard' ? request.standard_artifact_sha256 : '${'0'.repeat(64)}';
  process.stdout.write(JSON.stringify({
    schema_version: 1,
    run_id: request.run_id,
    status: 'passed',
    observed_host_version: request.host_version,
    input_fixture_sha256: request.fixture_sha256,
    applied_treatment_sha256: applied,
    provider_calls: 0,
    cost_usd: 0,
    result: { output: 'fake adapter completed; provider credential present=' + Boolean(process.env.OPENAI_API_KEY), artifacts: [] }
  }));
});
`;
    await writeFile(adapter, adapterSource);
    const fixtureSha256 = await hashLiveAbFixture(workspace);
    const standardArtifactSha256 = await hashLiveAbFixture(standardArtifact);
    const prepared = await prepareLiveAbArchive(configuration(fixtureSha256, standardArtifactSha256), archive);
    const auth = authorization(prepared.planSha256, sha256(Buffer.from(adapterSource)));
    await writeFile(authorizationPath, `${JSON.stringify(auth, null, 2)}\n`);

    await assert.rejects(executeLiveAbPlan({
      planPath: path.join(archive, 'plan.json'), authorizationPath, adapterPath: adapter, workspaceRoot: workspace, artifactsRoot: artifacts, execute: true,
      environment: { ...process.env, HOME: 'ambient-user-home', USERPROFILE: 'ambient-user-home', OPENAI_API_KEY: fakeCredential },
      now: new Date('2029-01-01T00:00:00.000Z'),
    }), /AER_LIVE_EVAL_EXECUTE/);

    const result = await executeLiveAbPlan({
      planPath: path.join(archive, 'plan.json'),
      authorizationPath,
      adapterPath: adapter,
      workspaceRoot: workspace,
      artifactsRoot: artifacts,
      execute: true,
      environment: { ...process.env, HOME: 'ambient-user-home', USERPROFILE: 'ambient-user-home', AER_LIVE_EVAL_EXECUTE: LIVE_AB_OPT_IN, OPENAI_API_KEY: fakeCredential },
      now: new Date('2029-01-01T00:00:00.000Z'),
    });
    assert.equal(result.executed, true);
    assert.equal(result.adapter_dispatches, 4);
    assert.equal(result.provider_calls, 0);
    assert.equal(result.cost_usd, 0);

    const runNames = await readdir(path.join(archive, 'runs'));
    const evidenceNames = await readdir(path.join(archive, 'run-evidence'));
    const requestNames = await readdir(path.join(archive, 'run-requests'));
    assert.equal(runNames.length, 4);
    assert.equal(evidenceNames.length, 4);
    assert.equal(requestNames.length, 4);
    const archived = [
      await readFile(path.join(archive, 'plan.json'), 'utf8'),
      await readFile(path.join(archive, 'grading-plan.json'), 'utf8'),
      await readFile(path.join(archive, 'plan.sha256'), 'utf8'),
      await readFile(path.join(archive, 'authorization-evidence.json'), 'utf8'),
      await readFile(path.join(archive, 'input-snapshots.json'), 'utf8'),
      await readFile(path.join(archive, 'execution-summary.json'), 'utf8'),
      ...await Promise.all(runNames.map((name) => readFile(path.join(archive, 'runs', name), 'utf8'))),
      ...await Promise.all(evidenceNames.map((name) => readFile(path.join(archive, 'run-evidence', name), 'utf8'))),
      ...await Promise.all(requestNames.map((name) => readFile(path.join(archive, 'run-requests', name), 'utf8'))),
    ].join('\n');
    assert.equal(archived.includes(fakeCredential), false);
    const blindedOutputs = [
      await readFile(path.join(archive, 'grading-plan.json'), 'utf8'),
      ...await Promise.all(runNames.map((name) => readFile(path.join(archive, 'runs', name), 'utf8'))),
    ].join('\n');
    assert.equal(blindedOutputs.includes('host-baseline'), false);
    assert.equal(blindedOutputs.includes('"treatment_id"'), false);
    assert.equal(blindedOutputs.includes('"provider_calls"'), false);
    assert.equal(blindedOutputs.includes('"cost_usd"'), false);
    assert.equal(blindedOutputs.includes('"applied_treatment_sha256"'), false);
    assert.equal(archived.includes('provider credential present=true'), true);
    assert.equal(archived.includes('"host_version": "codex-test-1.0.0"'), true);
    assert.equal(await readFile(path.join(archive, 'inputs', 'fixtures', 'bounded-change', 'fixture.txt'), 'utf8'), 'exact fixture bytes\n');
    assert.equal(await readFile(path.join(archive, 'inputs', 'standard-artifacts', 'codex-medium', 'AGENTS.md'), 'utf8'), 'exact standard artifact bytes\n');
    await assert.rejects(readFile(path.join(workspace, 'prior-arm-mutation.txt')), /ENOENT/);
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test('runtime gates stop credential output, per-call overspend, and mid-run expiry before another dispatch', async (t) => {
  for (const testCase of [
    { name: 'credential output', mode: 'credential', expected: /credential material/ },
    { name: 'per-call overspend', mode: 'overspend', expected: /per-call spend cap/ },
    { name: 'mid-run expiry', mode: 'expiry', expected: /expired before the next adapter dispatch/ },
  ]) await t.test(testCase.name, async () => {
    const parent = await mkdtemp(path.join(tmpdir(), `aer-live-ab-${testCase.mode}-`));
    const archive = path.join(parent, 'archive');
    const workspace = path.join(parent, 'workspace');
    const artifacts = path.join(parent, 'artifacts');
    const standardArtifact = path.join(artifacts, 'codex-standard');
    const adapter = path.join(parent, 'adapter.mjs');
    const authorizationPath = path.join(parent, 'authorization.json');
    const secret = 'runtime-secret-must-not-be-archived';
    try {
      await mkdir(workspace);
      await writeFile(path.join(workspace, 'fixture.txt'), 'runtime fixture\n');
      await mkdir(artifacts);
      await mkdir(standardArtifact);
      await writeFile(path.join(standardArtifact, 'AGENTS.md'), 'runtime standard artifact\n');
      const adapterSource = `
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  const request = JSON.parse(input);
  const mode = ${JSON.stringify(testCase.mode)};
  const applied = request.treatment_id === 'standard' ? request.standard_artifact_sha256 : '${'0'.repeat(64)}';
  process.stdout.write(JSON.stringify({
    schema_version: 1,
    run_id: request.run_id,
    status: 'passed',
    observed_host_version: request.host_version,
    input_fixture_sha256: request.fixture_sha256,
    applied_treatment_sha256: applied,
    provider_calls: mode === 'overspend' ? 1 : 0,
    cost_usd: mode === 'overspend' ? 0.2 : 0,
    result: { output: mode === 'credential' ? process.env.OPENAI_API_KEY : 'bounded fake result', artifacts: [] }
  }));
});
`;
      await writeFile(adapter, adapterSource);
      const config = configuration(await hashLiveAbFixture(workspace), await hashLiveAbFixture(standardArtifact));
      config.repetitions = 1;
      const prepared = await prepareLiveAbArchive(config, archive);
      await writeFile(authorizationPath, `${JSON.stringify(authorization(prepared.planSha256, sha256(Buffer.from(adapterSource))), null, 2)}\n`);
      let clockReads = 0;
      const clock = () => new Date(testCase.mode === 'expiry' && ++clockReads > 1
        ? '2031-01-01T00:00:00.000Z'
        : '2029-01-01T00:00:00.000Z');
      await assert.rejects(executeLiveAbPlan({
        planPath: path.join(archive, 'plan.json'),
        authorizationPath,
        adapterPath: adapter,
        workspaceRoot: workspace,
        artifactsRoot: artifacts,
        execute: true,
        environment: { ...process.env, AER_LIVE_EVAL_EXECUTE: LIVE_AB_OPT_IN, OPENAI_API_KEY: secret },
        now: new Date('2029-01-01T00:00:00.000Z'),
        clock,
      }), testCase.expected);
      const archivedFiles = await readdir(path.join(archive, 'runs'));
      const archivedText = (await Promise.all(archivedFiles.map((name) => readFile(path.join(archive, 'runs', name), 'utf8')))).join('\n');
      assert.equal(archivedText.includes(secret), false);
    } finally { await rm(parent, { recursive: true, force: true }); }
  });
});
