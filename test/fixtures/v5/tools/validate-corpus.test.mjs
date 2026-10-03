import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from './build-distributions.mjs';
import { analyzeRuntimeLoads, runtimeLoadErrors } from './validate-runtime-loads.mjs';

import {
  compatibilityErrors,
  directiveScenarioErrors,
  frozenHistoryErrors,
  grievanceErrors,
  policyErrors,
} from './validate-corpus.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(repo, 'source');
const clone = (value) => structuredClone(value);
const json = async (relative) => JSON.parse(await readFile(path.join(source, relative), 'utf8'));

test('selected Codex context content remains within the always-on budget across profiles', async (context) => {
  const output = await mkdtemp(path.join(tmpdir(), 'aer-context-budget-'));
  context.after(() => rm(output, { recursive: true, force: true }));
  await build(output);
  const report = await analyzeRuntimeLoads(output);
  assert.deepEqual(runtimeLoadErrors(report), []);
  const rootPlan = report.plans.find((plan) => plan.id === 'codex:repository-root');
  for (const profile of report.profile_inventory.active) {
    const id = profile === 'standard' ? 'codex:repository-root' : `codex:profile:${profile}`;
    const missing = clone(report);
    missing.plans.find((plan) => plan.id === id).selected_contexts = [];
    assert.ok(runtimeLoadErrors(missing).some((error) => error.includes(`${id} must include all selected Codex contexts`)));
    const misclassified = clone(report);
    const wrongPlan = misclassified.plans.find((plan) => plan.id === id);
    wrongPlan.budget_class = 'routed';
    wrongPlan.routed_reference_reads = [];
    assert.ok(runtimeLoadErrors(misclassified).some((error) => error.includes(`${id} must count selected Codex context content as always-on`)));
  }

  const thresholds = await json('config/thresholds.json');
  const headroom = report.budgets.always_on_estimated_tokens - rootPlan.estimated_tokens - report.skill_catalog_representative_estimated_tokens;
  const padding = 'x'.repeat((headroom + 1) * thresholds.ESTIMATED_TOKEN_BYTES);
  const rootPath = path.join(output, 'codex', 'AGENTS.md');
  const original = await readFile(rootPath, 'utf8');
  await writeFile(rootPath, original.replace('Detail: `agent-rules/reference/web-ui.md`', `${padding} Detail: \`agent-rules/reference/web-ui.md\``));
  const oversized = await analyzeRuntimeLoads(output);
  const errors = runtimeLoadErrors(oversized);
  assert.ok(errors.some((error) => error.startsWith('codex:repository-root plus the representative skill catalog')), errors.join('\n'));
  assert.equal(oversized.plans.find((plan) => plan.id === 'codex:contexts:none').estimated_tokens,
    report.plans.find((plan) => plan.id === 'codex:contexts:none').estimated_tokens,
    'selected-only growth must not change the omitted-context measurement');
});

test('live directive and scenario registries close over the kernel', async () => {
  const [directives, scenarios, kernel] = await Promise.all([
    json('evals/directives.json'),
    json('evals/scenarios.json'),
    readFile(path.join(source, 'kernel/contract.md'), 'utf8'),
  ]);
  assert.deepEqual(directiveScenarioErrors(directives, scenarios, kernel), []);

  const missingKernel = kernel.replace(/^- \*\*AE-26.*$/m, '');
  assert.ok(directiveScenarioErrors(directives, scenarios, missingKernel).some((error) => error.includes('kernel and directive registry')));

  const brokenLink = clone(scenarios);
  brokenLink.scenarios[0].directive_ids.push('AE-99');
  assert.ok(directiveScenarioErrors(directives, brokenLink, kernel).some((error) => error.includes('unknown directive AE-99')));
});

test('grievance traceability rejects gaps, dead owners, and efficacy claims', async () => {
  const [document, directives, evaluation] = await Promise.all([
    json('evals/grievances.json'),
    json('evals/directives.json'),
    readFile(path.join(repo, 'docs/evaluation.md'), 'utf8'),
  ]);
  const context = {
    liveDirectiveIds: new Set(directives.directives.map((entry) => entry.id)),
    availableFiles: new Set(['source/kernel/contract.md', 'docs/evaluation.md', 'tools/validate-source.mjs', 'tools/validate-corpus.mjs']),
    fileContents: new Map([['docs/evaluation.md', evaluation]]),
  };
  const errors = grievanceErrors(document, context);
  assert.ok(!errors.some((error) => /IDs|missing directive|evidence file/.test(error)), errors.join('\n'));

  const missing = clone(document);
  missing.grievances.pop();
  assert.ok(grievanceErrors(missing, context).some((error) => error.includes('exactly 1 through 110')));

  const deadOwner = clone(document);
  deadOwner.grievances[0].owner = 'kernel/contract.md#AE-99';
  assert.ok(grievanceErrors(deadOwner, context).some((error) => error.includes('missing directive AE-99')));

  const claimed = clone(document);
  claimed.grievances[0].efficacy = 'proven';
  assert.ok(grievanceErrors(claimed, context).some((error) => error.includes('must remain unmeasured')));
});

test('frozen history requires exact inventory and bytes', async () => {
  const manifest = await json('evals/frozen-history.json');
  const paths = manifest.files.map((entry) => entry.path);
  const bytes = new Map(await Promise.all(paths.map(async (relative) => [relative, await readFile(path.join(source, relative))])));
  assert.deepEqual(frozenHistoryErrors(manifest, paths, bytes), []);

  const omitted = clone(manifest);
  omitted.files.pop();
  assert.ok(frozenHistoryErrors(omitted, paths, bytes).some((error) => error.includes('inventory')));

  const wrongHash = clone(manifest);
  wrongHash.files[0].sha256 = '0'.repeat(64);
  assert.ok(frozenHistoryErrors(wrongHash, paths, bytes).some((error) => error.includes('bytes differ')));

  const mutatedBytes = new Map(bytes);
  mutatedBytes.set(paths[0], Buffer.concat([bytes.get(paths[0]), Buffer.from('changed')]));
  assert.ok(frozenHistoryErrors(manifest, paths, mutatedBytes).some((error) => error.includes('bytes differ')));

  const rewrittenManifest = clone(manifest);
  const rewrittenBytes = new Map(bytes);
  const replacement = Buffer.from('replacement historical bytes');
  rewrittenBytes.set(paths[0], replacement);
  rewrittenManifest.files[0].sha256 = createHash('sha256').update(replacement).digest('hex');
  assert.ok(frozenHistoryErrors(rewrittenManifest, paths, rewrittenBytes).some((error) => error.includes('pinned canonical digest')));
});

test('compatibility validation rejects stale and unofficial records', async () => {
  const [hosts, models, conflicts, directives, scenarios] = await Promise.all([
    json('compatibility/hosts.json'),
    json('compatibility/models.json'),
    json('compatibility/conflicts.json'),
    json('evals/directives.json'),
    json('evals/scenarios.json'),
  ]);
  const context = {
    liveDirectiveIds: new Set(directives.directives.map((entry) => entry.id)),
    scenarioIds: new Set(scenarios.scenarios.map((entry) => entry.id)),
    today: '2026-09-12',
  };
  assert.deepEqual(compatibilityErrors(hosts, models, conflicts, context), []);

  const stale = clone(models);
  stale.overlays[0].reviewed = '2026-08-01';
  stale.overlays[0].revalidate_after = '2026-09-01';
  assert.ok(compatibilityErrors(hosts, stale, conflicts, context).some((error) => error.includes('expired')));

  const unofficial = clone(hosts);
  unofficial.supported_hosts.claude.sources = ['https://developers.openai.com/claims'];
  assert.ok(compatibilityErrors(unofficial, models, conflicts, context).some((error) => error.includes('official HTTPS source for that host')));

  const credentialed = clone(models);
  credentialed.overlays[0].source = 'https://user:secret@platform.claude.com/docs/en/example';
  assert.ok(compatibilityErrors(hosts, credentialed, conflicts, context).some((error) => error.includes('official HTTPS source')));
});

test('policy closure rejects missing host coverage and dead directive IDs', async () => {
  const [policy, directives, hosts] = await Promise.all([
    json('policy/policy-map.json'),
    json('evals/directives.json'),
    json('compatibility/hosts.json'),
  ]);
  const context = {
    supportedHosts: new Set(Object.keys(hosts.supported_hosts)),
    liveDirectiveIds: new Set(directives.directives.map((entry) => entry.id)),
  };
  assert.deepEqual(policyErrors(policy, context), []);

  const missingHost = clone(policy);
  delete missingHost.entries[0].mechanisms.codex;
  assert.ok(policyErrors(missingHost, context).some((error) => error.includes('mechanisms for codex')));

  const deadDirective = clone(policy);
  deadDirective.entries[0].directive_ids.push('AE-99');
  assert.ok(policyErrors(deadDirective, context).some((error) => error.includes('unknown directive AE-99')));
});
