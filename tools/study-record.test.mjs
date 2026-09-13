import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { freezeProtocol, localPath, validateProtocol, validateStudy } from './study-record.mjs';

const digest = (text) => createHash('sha256').update(text).digest('hex');
const frozenAt = '2000-01-02T00:00:00.000Z';

// Synthetic format fixtures only. These are not provider runs or empirical outcomes.
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'aer-format-fixture-'));
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(tmpdir()));
    assert.ok(path.basename(root).startsWith('aer-format-fixture-'));
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(path.join(root, 'inputs'));
  const inputs = {};
  for (const name of ['prompt', 'contract', 'rubric', 'baseline', 'treatment']) {
    const content = `Synthetic ${name} format fixture; not a model experiment.\n`;
    await writeFile(path.join(root, 'inputs', `${name}.txt`), content);
    inputs[name] = { path: `inputs/${name}.txt`, sha256: digest(content) };
  }
  const protocol = {
    schemaVersion: 'aer-study/1', studyId: 'format-fixture-only', question: 'Exercise record validation, not model effectiveness.',
    review: { reviewer: 'format fixture', reviewedAt: '2000-01-01T00:00:00.000Z', reference: 'synthetic test; no real review claimed' },
    authorization: { reference: 'format fixture; no provider or spend authorized', provider: 'fixture-only', model: 'fixture-only', currency: 'USD', spendCeiling: 0 },
    configuration: { provider: 'fixture-only', model: 'fixture-only', modelRevision: 'not a model', effort: 'not applicable', hostVersion: 'fixture', toolVersions: 'fixture', repositoryRevision: 'fixture-only', maxTokens: 100, timeoutSeconds: 10, maxAttempts: 2, budgetEnforcement: 'No execution occurs.', overshootPolicy: 'No execution occurs.' },
    analysis: { method: 'No efficacy analysis.', uncertainty: 'No population inference.', stoppingRules: 'No runs.', exclusions: 'None; format fixture.', randomization: 'Fixed test ordering only.', fairnessAudit: 'No benchmark.', isolation: 'Temporary fixture directory.', humanRework: 'Not measured.' },
    tasks: [{ id: 'fixture-task', version: 'fixture-1', prompt: inputs.prompt, contract: inputs.contract, rubric: inputs.rubric, editableFiles: ['fixture.txt'] }],
    treatments: [{ id: 'fixture-base', role: 'baseline', revision: 'fixture-only', instructions: inputs.baseline }, { id: 'fixture-treatment', role: 'treatment', revision: 'fixture-only', instructions: inputs.treatment }],
    pairs: [{ id: 'fixture-pair', taskId: 'fixture-task', order: ['fixture-base', 'fixture-treatment'] }],
  };
  const protocolFile = path.join(root, 'protocol.json'), lockFile = path.join(root, 'protocol.lock.json'), reportFile = path.join(root, 'records.json');
  await writeFile(protocolFile, JSON.stringify(protocol, null, 2));
  const lock = await freezeProtocol(protocolFile, lockFile, frozenAt);
  const attempt = (id) => ({
    id: `not-a-run-${id}`, pairId: 'fixture-pair', treatmentId: id, attempt: 1, configurationSha256: null, configurationNote: 'No execution; format fixture.', status: 'skipped', startedAt: null, endedAt: null, terminationReason: 'Synthetic format fixture. No model was run.',
    usage: { inputTokens: null, outputTokens: null, cost: null, currency: 'USD', unavailableReason: 'No model was run.' },
    scoring: { status: 'unavailable', reviewer: 'format fixture', strictScore: null, engineeringQuality: 'Not assessed; format fixture.', humanReworkMinutes: null, disagreement: null },
    artifacts: ['transcript', 'diff', 'checks', 'output', 'usage', 'scoring'].map((kind) => ({ kind, status: 'missing', path: null, sha256: null, reason: 'No model was run.' })),
  });
  const report = { schemaVersion: 'aer-study-records/1', studyId: protocol.studyId, protocolSha256: lock.protocolSha256, status: 'complete', attempts: protocol.treatments.map((item) => attempt(item.id)) };
  const save = async () => writeFile(reportFile, JSON.stringify(report));
  await save();
  return { root, protocol, report, protocolFile, lockFile, reportFile, save };
}

test('incomplete planning template is not an approved frozen protocol', async () => {
  const template = JSON.parse(await readFile(new URL('../docs/evidence/protocol.template.json', import.meta.url), 'utf8'));
  await assert.rejects(validateProtocol(template, '.'), /reviewed value/);
});

test('freeze binds exact bytes and artifacts and refuses lock replacement', async (t) => {
  const f = await fixture(t);
  assert.equal((await validateStudy(f.protocolFile, f.lockFile)).valid, true);
  await assert.rejects(freezeProtocol(f.protocolFile, f.lockFile, frozenAt), /EEXIST/);
  await writeFile(f.protocolFile, `${JSON.stringify(f.protocol, null, 2)}\n`);
  await assert.rejects(validateStudy(f.protocolFile, f.lockFile), /lock mismatch/);
  await writeFile(f.protocolFile, JSON.stringify(f.protocol, null, 2));
  await writeFile(path.join(f.root, 'inputs', 'contract.txt'), 'Changed contract after freeze');
  await assert.rejects(validateStudy(f.protocolFile, f.lockFile), /digest mismatch/);
});

test('valid format preserves skipped cells, unavailable evidence and unknown cost', async (t) => {
  const f = await fixture(t);
  const result = await validateStudy(f.protocolFile, f.lockFile, f.reportFile);
  assert.equal(result.valid, true); assert.equal(result.costIsIncomplete, true);
  assert.equal(result.attempts, 2); assert.equal(result.incompleteEvidence.length, 2);
  assert.equal(result.configurationExceptions.length, 2);
  assert.match(result.scope, /not execution/);
  assert.deepEqual(JSON.parse(await readFile(f.reportFile, 'utf8')), f.report, 'validation must not mutate imports');
});

test('partial reports expose missing cells; complete reports cannot silently omit them', async (t) => {
  const f = await fixture(t);
  f.report.attempts.pop(); await f.save();
  await assert.rejects(validateStudy(f.protocolFile, f.lockFile, f.reportFile), /omits planned cells/);
  f.report.status = 'partial'; await f.save();
  assert.deepEqual((await validateStudy(f.protocolFile, f.lockFile, f.reportFile)).missingCells, [{ pairId: 'fixture-pair', treatmentId: 'fixture-treatment' }]);
});

test('rejects duplicate IDs, missing retry attempts, unsupported states and false scored skips', async (t) => {
  const f = await fixture(t);
  const original = structuredClone(f.report);
  const cases = [
    [(report) => { report.attempts[1].id = report.attempts[0].id; }, /duplicate/],
    [(report) => { report.attempts[0].attempt = 2; }, /sequence has a gap/],
    [(report) => { report.attempts[0].status = 'pass'; }, /execution status/],
    [(report) => { report.attempts[0].scoring.status = 'scored'; report.attempts[0].scoring.strictScore = { earned: 1, possible: 1 }; }, /skipped execution/],
    [(report) => { report.attempts[0].usage.cost = -1; }, /non-negative/],
    [(report) => { report.attempts[0].usage.unavailableReason = null; }, /unavailable usage reason/],
    [(report) => { report.attempts[0].artifacts.pop(); }, /every artifact kind/],
    [(report) => { report.attempts[0].providerSecret = 'must not become an accepted field'; }, /unexpected or missing/],
    [(report) => { report.attempts[0].configurationNote = null; }, /configuration mismatch/],
  ];
  for (const [mutate, error] of cases) {
    Object.assign(f.report, structuredClone(original)); mutate(f.report); await f.save();
    await assert.rejects(validateStudy(f.protocolFile, f.lockFile, f.reportFile), error);
  }
});

test('enforces frozen time/order and exposes budget exceptions without discarding failed records', async (t) => {
  const f = await fixture(t);
  for (const [index, run] of f.report.attempts.entries()) {
    Object.assign(run, { status: 'failed', startedAt: `2000-01-02T00:0${index}:00.000Z`, endedAt: `2000-01-02T00:0${index}:20.000Z` });
    run.usage = { inputTokens: 100, outputTokens: 1, cost: 1, currency: 'USD', unavailableReason: null };
  }
  await f.save();
  const result = await validateStudy(f.protocolFile, f.lockFile, f.reportFile);
  assert.equal(result.budgetExceptions.length, 2); assert.equal(result.knownCostExceedsCeiling, true);
  f.report.attempts[0].startedAt = '1999-01-01T00:00:00.000Z'; await f.save();
  await assert.rejects(validateStudy(f.protocolFile, f.lockFile, f.reportFile), /predates freeze/);
  f.report.attempts[0].startedAt = '2000-01-02T00:02:00.000Z'; f.report.attempts[0].endedAt = '2000-01-02T00:02:20.000Z'; await f.save();
  await assert.rejects(validateStudy(f.protocolFile, f.lockFile, f.reportFile), /pair order/);
});

test('available evidence is hashed as data; mismatches and symlink paths fail', async (t) => {
  const f = await fixture(t);
  const bytes = "throw new Error('never execute this evidence');\n";
  await writeFile(path.join(f.root, 'inert.js'), bytes);
  f.report.attempts[0].artifacts[0] = { kind: 'transcript', status: 'available', path: 'inert.js', sha256: digest(bytes), reason: null };
  await f.save(); assert.equal((await validateStudy(f.protocolFile, f.lockFile, f.reportFile)).valid, true);
  await writeFile(path.join(f.root, 'inert.js'), 'tampered');
  await assert.rejects(validateStudy(f.protocolFile, f.lockFile, f.reportFile), /digest mismatch/);
  await symlink(path.join(f.root, 'inputs'), path.join(f.root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  f.protocol.tasks[0].prompt.path = 'linked/prompt.txt';
  await assert.rejects(validateProtocol(f.protocol, f.root), /symbolic link/);
});

test('portable evidence paths reject traversal, absolute paths, aliases and invisible controls', () => {
  for (const value of ['../secret', '/absolute', 'C:/secret', 'a\\b', 'a//b', './a', 'a/../b', 'a%2fb', 'file.', 'e\u0301.md', 'a\u202eb']) assert.throws(() => localPath(value), /artifact path/);
  assert.equal(localPath('inputs/café.md'), 'inputs/café.md');
});
