#!/usr/bin/env node
// Provider-free validation for current research traceability and frozen history.

import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANIFEST } from './manifest.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(repo, 'source');
const HASH = /^[a-f0-9]{64}$/;
const DIRECTIVE_ID = /^AE-\d{2}$/;
const OFFICIAL_SOURCE_HOSTS = new Map([
  ['claude', new Set(['code.claude.com', 'platform.claude.com'])],
  ['codex', new Set(['developers.openai.com', 'learn.chatgpt.com'])],
]);
const FROZEN_SOURCE_REVISION = 'c1353c7993b4ff78e09963b01207d8b2d2c5d29e';
const FROZEN_MANIFEST_SHA256 = '52d1213a8eb9cae7d8c227657c1d792f966b152a08f759284ae8542ecc8f84de';
const FROZEN_FIXED = new Set([
  'evals/run.example.json',
  'evals/run.schema.json',
  'evals/treatments.json',
]);

const posix = (value) => value.replaceAll('\\', '/');
const duplicates = (values) => [...new Set(values.filter((value, index) => values.indexOf(value) !== index))].sort();
const sameMembers = (left, right) => left.length === right.length
  && [...left].sort().every((value, index) => value === [...right].sort()[index]);
const exactKeys = (value, expected) => value && typeof value === 'object' && !Array.isArray(value)
  && sameMembers(Object.keys(value), expected);
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function json(relative) {
  return JSON.parse(await readFile(path.join(sourceRoot, relative), 'utf8'));
}

async function walk(directory, root = directory, found = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(absolute, root, found);
    else if (entry.isFile()) found.push(posix(path.relative(root, absolute)));
  }
  return found;
}

function strictDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function directiveIdsInKernel(text) {
  return [...text.matchAll(/^- \*\*(AE-\d{2})\b/gm)].map((match) => match[1]);
}

export function directiveScenarioErrors(directivesDoc, scenariosDoc, kernelText) {
  const errors = [];
  if (!exactKeys(directivesDoc, ['schema_version', 'directives']) || directivesDoc?.schema_version !== 1 || !Array.isArray(directivesDoc?.directives)) {
    return ['directive registry must be a closed schema_version 1 document with a directives array'];
  }
  if (!exactKeys(scenariosDoc, ['schema_version', 'scenarios']) || scenariosDoc?.schema_version !== 1 || !Array.isArray(scenariosDoc?.scenarios)) {
    return ['scenario registry must be a closed schema_version 1 document with a scenarios array'];
  }

  const directives = directivesDoc.directives;
  const scenarios = scenariosDoc.scenarios;
  const directiveIds = directives.map((entry) => entry?.id);
  const scenarioIds = scenarios.map((entry) => entry?.id);
  for (const id of duplicates(directiveIds)) errors.push(`directive registry repeats ${id}`);
  for (const id of duplicates(scenarioIds)) errors.push(`scenario registry repeats ${id}`);

  for (const [index, entry] of directives.entries()) {
    const label = `directive ${entry?.id ?? index}`;
    if (!exactKeys(entry, ['id', 'owner', 'rationale', 'counterexample', 'scenarios'])) errors.push(`${label} has unsupported or missing fields`);
    if (!DIRECTIVE_ID.test(entry?.id ?? '')) errors.push(`${label} needs an AE-nn id`);
    if (entry?.owner !== 'kernel/contract.md') errors.push(`${label} owner must be kernel/contract.md`);
    for (const field of ['rationale', 'counterexample']) if (!nonempty(entry?.[field])) errors.push(`${label} needs ${field}`);
    if (!Array.isArray(entry?.scenarios) || !entry.scenarios.length) errors.push(`${label} needs at least one scenario`);
    for (const scenario of entry?.scenarios ?? []) if (!scenarioIds.includes(scenario)) errors.push(`${label} names unknown scenario ${scenario}`);
  }

  for (const [index, entry] of scenarios.entries()) {
    const label = `scenario ${entry?.id ?? index}`;
    if (!exactKeys(entry, ['id', 'task_class', 'prompt', 'failure_class', 'directive_ids', 'assertions'])) errors.push(`${label} has unsupported or missing fields`);
    for (const field of ['id', 'task_class', 'prompt', 'failure_class']) if (!nonempty(entry?.[field])) errors.push(`${label} needs ${field}`);
    if (!Array.isArray(entry?.directive_ids) || !entry.directive_ids.length) errors.push(`${label} needs directive_ids`);
    if (!Array.isArray(entry?.assertions) || !entry.assertions.length || entry.assertions.some((item) => !nonempty(item))) errors.push(`${label} needs non-empty assertions`);
    for (const id of entry?.directive_ids ?? []) {
      if (!directiveIds.includes(id)) errors.push(`${label} names unknown directive ${id}`);
      const directive = directives.find((candidate) => candidate.id === id);
      if (directive && !directive.scenarios.includes(entry.id)) errors.push(`${label} and directive ${id} disagree about their link`);
    }
  }
  for (const directive of directives) {
    for (const scenarioId of directive.scenarios ?? []) {
      const scenario = scenarios.find((candidate) => candidate.id === scenarioId);
      if (scenario && !scenario.directive_ids.includes(directive.id)) errors.push(`directive ${directive.id} and scenario ${scenarioId} disagree about their link`);
    }
  }

  const kernelIds = directiveIdsInKernel(kernelText);
  for (const id of duplicates(kernelIds)) errors.push(`kernel repeats directive ${id}`);
  if (!sameMembers(kernelIds, directiveIds)) errors.push(`kernel and directive registry IDs differ: kernel=${kernelIds.join(',')} registry=${directiveIds.join(',')}`);
  return errors;
}

export function grievanceErrors(document, { liveDirectiveIds, availableFiles, fileContents = new Map() }) {
  const errors = [];
  if (!exactKeys(document, ['schema_version', 'coverage_kind', 'origin', 'grievances'])) {
    errors.push('grievance map must contain exactly schema_version, coverage_kind, origin, grievances');
  }
  if (document?.schema_version !== 1) errors.push('grievance map schema_version must equal 1');
  if (document?.coverage_kind !== 'design-traceability-not-efficacy') errors.push('grievance map must identify design traceability, not efficacy');
  if (!nonempty(document?.origin)) errors.push('grievance map needs an origin');
  const grievances = Array.isArray(document?.grievances) ? document.grievances : [];
  const expectedIds = Array.from({ length: 110 }, (_, index) => index + 1);
  const ids = grievances.map((entry) => entry?.id);
  if (!sameMembers(ids, expectedIds)) errors.push('grievance IDs must be exactly 1 through 110');
  for (const id of duplicates(ids)) errors.push(`grievance map repeats ${id}`);

  for (const [index, entry] of grievances.entries()) {
    const label = `grievance ${entry?.id ?? index}`;
    if (!exactKeys(entry, ['id', 'requirement', 'owner', 'validation', 'evidence', 'efficacy'])) errors.push(`${label} has unsupported or missing fields`);
    for (const field of ['requirement', 'owner', 'evidence']) if (!nonempty(entry?.[field])) errors.push(`${label} needs ${field}`);
    if (!['design-review', 'deterministic'].includes(entry?.validation)) errors.push(`${label} validation must be design-review or deterministic`);
    if (entry?.efficacy !== 'unmeasured') errors.push(`${label} efficacy must remain unmeasured`);

    const ownerMatch = String(entry?.owner ?? '').match(/^(kernel\/contract\.md#(AE-\d{2})|docs\/evaluation\.md#future-evaluation)$/);
    if (!ownerMatch) errors.push(`${label} owner must be a live kernel directive or docs/evaluation.md#future-evaluation`);
    else if (ownerMatch[2] && !liveDirectiveIds.has(ownerMatch[2])) errors.push(`${label} owner names missing directive ${ownerMatch[2]}`);

    const ownerPath = ownerMatch?.[2] ? 'source/kernel/contract.md' : ownerMatch ? 'docs/evaluation.md' : null;
    if (ownerPath && !availableFiles.has(ownerPath)) errors.push(`${label} owner file does not exist: ${ownerPath}`);
    if (ownerPath === 'docs/evaluation.md' && !/^#{1,6}\s+Future evaluation\s*$/im.test(fileContents.get(ownerPath) ?? '')) {
      errors.push(`${label} owner anchor does not exist: docs/evaluation.md#future-evaluation`);
    }
    if (nonempty(entry?.evidence) && !availableFiles.has(entry.evidence)) errors.push(`${label} evidence file does not exist: ${entry.evidence}`);
  }
  return errors;
}

export function frozenHistoryErrors(document, expectedPaths, bytesByPath) {
  const errors = [];
  if (!exactKeys(document, ['schema_version', 'status', 'source_revision', 'claim', 'files'])) errors.push('frozen history manifest has unsupported or missing fields');
  if (document?.schema_version !== 1) errors.push('frozen history schema_version must equal 1');
  if (document?.status !== 'historical-unexecuted-design') errors.push('frozen history status must remain historical-unexecuted-design');
  if (document?.source_revision !== FROZEN_SOURCE_REVISION) errors.push(`frozen history source revision must remain ${FROZEN_SOURCE_REVISION}`);
  if (digest(JSON.stringify(document)) !== FROZEN_MANIFEST_SHA256) errors.push('frozen history manifest differs from its pinned canonical digest');
  if (!nonempty(document?.claim) || !/not outcome or efficacy evidence/i.test(document.claim)) errors.push('frozen history must disclaim outcome and efficacy evidence');
  const records = Array.isArray(document?.files) ? document.files : [];
  const paths = records.map((record) => record?.path);
  if (!sameMembers(paths, expectedPaths)) errors.push('frozen history file inventory does not exactly cover the historical evaluation files');
  for (const item of duplicates(paths)) errors.push(`frozen history repeats ${item}`);
  for (const [index, record] of records.entries()) {
    const label = `frozen history file ${record?.path ?? index}`;
    if (!exactKeys(record, ['path', 'sha256'])) errors.push(`${label} has unsupported or missing fields`);
    if (!nonempty(record?.path) || record.path.includes('\\') || path.posix.normalize(record.path) !== record.path || record.path.startsWith('../')) errors.push(`${label} path must be portable and source-relative`);
    if (!HASH.test(record?.sha256 ?? '')) errors.push(`${label} needs a lowercase SHA-256`);
    const bytes = bytesByPath.get(record?.path);
    if (!bytes) errors.push(`${label} is missing`);
    else if (digest(bytes) !== record.sha256) errors.push(`${label} bytes differ from their frozen SHA-256`);
  }
  return errors;
}

export function compatibilityErrors(hostsDoc, modelsDoc, conflictsDoc, { liveDirectiveIds, scenarioIds, today }) {
  const errors = [];
  const now = strictDate(today);
  if (!now) return [`validation date is invalid: ${today}`];
  const checkWindow = (label, record) => {
    const reviewed = strictDate(record?.reviewed);
    const expires = strictDate(record?.revalidate_after);
    if (!reviewed || !expires || expires <= reviewed) errors.push(`${label} needs a valid review window`);
    else if (expires < now) errors.push(`${label} expired on ${record.revalidate_after}`);
  };
  const officialSource = (host, source) => {
    let url;
    try { url = new URL(source); } catch { return false; }
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && (OFFICIAL_SOURCE_HOSTS.get(host)?.has(url.hostname) ?? false);
  };
  const hosts = hostsDoc?.supported_hosts ?? {};
  if (hostsDoc?.schema_version !== 1 || !Object.keys(hosts).length) errors.push('host compatibility registry must contain supported hosts');
  checkWindow('host compatibility registry', hostsDoc);
  for (const [host, record] of Object.entries(hosts)) {
    if (record?.root_install_strategy !== 'managed-block') errors.push(`${host} root installation must remain managed-block`);
    if (record?.hard_policy_delivery !== 'consumer-owned') errors.push(`${host} hard policy delivery must remain consumer-owned`);
    if (!Array.isArray(record?.sources) || !record.sources.length) errors.push(`${host} needs official sources`);
    for (const source of record?.sources ?? []) if (!officialSource(host, source)) errors.push(`${host} source is not an official HTTPS source for that host: ${source}`);
  }
  if (modelsDoc?.schema_version !== 1 || !Array.isArray(modelsDoc?.overlays)) errors.push('model compatibility registry must contain overlays');
  for (const overlay of modelsDoc?.overlays ?? []) {
    const label = `model overlay ${overlay?.id ?? '<missing>'}`;
    if (!Object.hasOwn(hosts, overlay?.host)) errors.push(`${label} names unsupported host ${overlay?.host}`);
    checkWindow(label, overlay);
    if (!officialSource(overlay?.host, overlay?.source)) errors.push(`${label} source is not an official HTTPS source for ${overlay?.host ?? 'its host'}`);
    for (const scenario of overlay?.evaluation_scenarios ?? []) if (!scenarioIds.has(scenario)) errors.push(`${label} names unknown scenario ${scenario}`);
  }
  if (conflictsDoc?.schema_version !== 1 || !Array.isArray(conflictsDoc?.directive_conflicts)) errors.push('conflict registry must contain directive_conflicts');
  for (const conflict of conflictsDoc?.directive_conflicts ?? []) {
    if (!Array.isArray(conflict?.directive_ids) || conflict.directive_ids.length !== 2) errors.push('each directive conflict must name a pair');
    for (const id of conflict?.directive_ids ?? []) if (!liveDirectiveIds.has(id)) errors.push(`directive conflict names unknown ${id}`);
  }
  return errors;
}

export function policyErrors(policyDoc, { supportedHosts, liveDirectiveIds }) {
  const errors = [];
  if (policyDoc?.schema_version !== 1 || policyDoc?.delivery !== 'consumer-owned' || !Array.isArray(policyDoc?.entries)) {
    return ['policy map must be schema_version 1 with consumer-owned delivery and entries'];
  }
  for (const [index, entry] of policyDoc.entries.entries()) {
    const label = `policy entry ${entry?.concern ?? index}`;
    if (!nonempty(entry?.concern)) errors.push(`${label} needs a concern`);
    if (!Array.isArray(entry?.directive_ids) || !entry.directive_ids.length) errors.push(`${label} needs directive IDs`);
    for (const id of entry?.directive_ids ?? []) if (!liveDirectiveIds.has(id)) errors.push(`${label} names unknown directive ${id}`);
    for (const host of supportedHosts) {
      if (!Array.isArray(entry?.mechanisms?.[host]) || !entry.mechanisms[host].length) errors.push(`${label} needs mechanisms for ${host}`);
    }
    for (const host of Object.keys(entry?.mechanisms ?? {})) if (!supportedHosts.has(host)) errors.push(`${label} names unsupported host ${host}`);
  }
  return errors;
}

function isHistoricalPath(relative) {
  return relative.startsWith('evals/components/v2/')
    || relative.endsWith('.v2.json')
    || FROZEN_FIXED.has(relative);
}

export async function validateCorpus({ today = new Date().toISOString().slice(0, 10) } = {}) {
  const [directives, scenarios, grievances, frozenHistory, hosts, models, conflicts, policy, kernel, evaluationDoc] = await Promise.all([
    json('evals/directives.json'),
    json('evals/scenarios.json'),
    json('evals/grievances.json'),
    json('evals/frozen-history.json'),
    json('compatibility/hosts.json'),
    json('compatibility/models.json'),
    json('compatibility/conflicts.json'),
    json('policy/policy-map.json'),
    readFile(path.join(sourceRoot, 'kernel/contract.md'), 'utf8'),
    readFile(path.join(repo, 'docs/evaluation.md'), 'utf8'),
  ]);
  const errors = [];
  errors.push(...directiveScenarioErrors(directives, scenarios, kernel));
  const liveDirectiveIds = new Set(directives.directives.map((entry) => entry.id));
  const scenarioIds = new Set(scenarios.scenarios.map((entry) => entry.id));

  const availableFiles = new Set();
  for (const relative of ['source/kernel/contract.md', 'docs/evaluation.md', 'tools/validate-source.mjs', 'tools/validate-corpus.mjs']) {
    try { await stat(path.join(repo, relative)); availableFiles.add(relative); } catch { /* reported by the owning validation */ }
  }
  for (const entry of grievances.grievances ?? []) {
    if (!nonempty(entry?.evidence) || availableFiles.has(entry.evidence)) continue;
    try { await stat(path.join(repo, entry.evidence)); availableFiles.add(entry.evidence); } catch { /* reported below */ }
  }
  errors.push(...grievanceErrors(grievances, {
    liveDirectiveIds,
    availableFiles,
    fileContents: new Map([['docs/evaluation.md', evaluationDoc]]),
  }));

  const evalPaths = (await walk(path.join(sourceRoot, 'evals'))).map((relative) => `evals/${relative}`);
  const historicalPaths = evalPaths.filter(isHistoricalPath).sort();
  const bytesByPath = new Map(await Promise.all(historicalPaths.map(async (relative) => [relative, await readFile(path.join(sourceRoot, relative))])));
  errors.push(...frozenHistoryErrors(frozenHistory, historicalPaths, bytesByPath));
  const research = new Set(MANIFEST.research ?? []);
  for (const relative of ['evals/directives.json', 'evals/scenarios.json', 'evals/grievances.json', 'evals/frozen-history.json', ...historicalPaths]) {
    if (!research.has(relative)) errors.push(`MANIFEST.research omits ${relative}`);
  }

  errors.push(...compatibilityErrors(hosts, models, conflicts, { liveDirectiveIds, scenarioIds, today }));
  errors.push(...policyErrors(policy, { supportedHosts: new Set(Object.keys(hosts.supported_hosts ?? {})), liveDirectiveIds }));
  return {
    errors,
    metrics: {
      directives: liveDirectiveIds.size,
      scenarios: scenarioIds.size,
      grievances: grievances.grievances?.length ?? 0,
      frozen_files: historicalPaths.length,
    },
  };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  validateCorpus().then(({ errors, metrics }) => {
    if (errors.length) {
      console.error(`FAIL (${errors.length})`);
      for (const error of errors) console.error(`  - ${error}`);
      process.exitCode = 1;
    } else {
      console.log(`PASS (${metrics.directives} directives, ${metrics.scenarios} scenarios, ${metrics.grievances} grievances, ${metrics.frozen_files} frozen files)`);
    }
  }).catch((error) => { console.error(`FAIL: ${error.message}`); process.exitCode = 1; });
}
