#!/usr/bin/env node
// Executes a dependency-free, provider-disabled evaluation harness fixture.
// It validates portable inputs, starts bounded loopback runtime/proxy roles with
// a scrubbed environment, captures exact artifacts, runs a local grader, and
// proves cleanup. No provider SDK, credential, or non-loopback network is used.

import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { access, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeEvaluationComponent } from './build-distributions.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(repo, 'source');
const TASKS = 'evals/tasks.v2.json';
const GRADERS = 'evals/graders.v2.json';
const EXPERIMENTS = 'evals/experiments.v2.json';
const CELLS = 'evals/cells.v2.json';
const DIRECTIVES = 'evals/directives.json';
const FROZEN_EXPERIMENTS_V2_SHA256 = '00e62acc062da76c8fe84e072bdb308ed79dda0a75141f545718397543f79a46';
const FROZEN_CELLS_V2_SHA256 = '42961ae4befff0de91825dcbab43e522aa1c5b5847befb80d3821ff2f48a6f0e';
const FROZEN_EXECUTABLE_FIXTURES_V2_SHA256 = '2083458d5dbdbf1397423a81ab501eb08859aa8cbd6125783e8042a035b19c10';
const MAX_TEXT_BYTES = 1_048_576;
const MAX_STREAM_BYTES = 65_536;
const EXPECTED_EXPERIMENTS = [
  'opus-final-verification',
  'opus-subagent-count',
  'gpt-instruction-group-removal',
  'gpt-effort-sweep',
  'duplicate-instruction-ingestion',
  'skill-surface-size',
];
const CREDENTIAL_NAME = /(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i;
const FINAL_VERIFICATION_FRAGMENT = 'Before reporting completion, run one final verification pass over the requested outcome and report the exact result.\n';
const KERNEL_GROUP_IDS = ['authority-and-scope', 'operating-mode', 'implementation', 'evidence-and-completion', 'enforcement-and-compatibility'];
const FORBIDDEN_COMPONENT_KINDS = ['plugin', 'hook', 'policy'];

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const posix = (value) => value.replaceAll('\\', '/');
const sameValue = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const closedKeys = (value, expected, label, errors) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) { errors.push(`${label} must be an object`); return; }
  const actual = Object.keys(value).sort().join(',');
  const wanted = [...expected].sort().join(',');
  if (actual !== wanted) errors.push(`${label} keys must be exactly ${wanted || '(none)'}, found ${actual || '(none)'}`);
};

export function frozenEvaluationHashErrors(actual) {
  const expected = {
    experiments: FROZEN_EXPERIMENTS_V2_SHA256,
    cells: FROZEN_CELLS_V2_SHA256,
    executable_fixtures: FROZEN_EXECUTABLE_FIXTURES_V2_SHA256,
  };
  const errors = [];
  for (const [name, digest] of Object.entries(actual)) {
    if (!Object.hasOwn(expected, name)) errors.push(`unknown frozen evaluation document ${name}`);
    else if (digest !== expected[name]) errors.push(`${name} bytes changed after the version-2 freeze; create a new evaluation version for intentional changes`);
  }
  return errors;
}

function executableFixtureDigest(files) {
  const manifest = [...files.values()]
    .map((file) => `${file.relative}\0${file.sha256}\n`)
    .sort()
    .join('');
  return sha256(Buffer.from(manifest, 'utf8'));
}

export function portableRelativePathError(value, { flat = false, allowDot = false } = {}) {
  if (allowDot && value === '.') return null;
  if (typeof value !== 'string' || !value) return 'must be a non-empty string';
  if (/[\x00-\x1f\x7f]/.test(value)) return 'contains control characters';
  if (value.includes('\\')) return 'must use portable forward slashes';
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || /^[A-Za-z]:/.test(value)) return 'must be repository-relative';
  if (path.posix.normalize(value) !== value) return 'must not contain empty, dot, or parent segments';
  const parts = value.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) return 'must not contain empty, dot, or parent segments';
  if (flat && parts.length !== 1) return 'must be a flat artifact name';
  if (parts.some((part) => /[<>:"|?*]/.test(part) || /[. ]$/.test(part))) return 'contains a non-portable path component';
  return null;
}

export function utf8LfErrors(bytes, label = 'text') {
  const errors = [];
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
  if (bytes.length > MAX_TEXT_BYTES) errors.push(`${label} exceeds ${MAX_TEXT_BYTES} bytes`);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) errors.push(`${label} has a UTF-8 BOM`);
  if (bytes.includes(0)) errors.push(`${label} contains NUL`);
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { errors.push(`${label} is not valid UTF-8`); return errors; }
  if (text.includes('\r')) errors.push(`${label} must use LF line endings only`);
  if (!text.endsWith('\n')) errors.push(`${label} must end with LF`);
  return errors;
}

async function safeSourceFile(relative, errors, { parseJson = true } = {}) {
  const pathError = portableRelativePathError(relative);
  if (pathError) { errors.push(`${relative}: ${pathError}`); return null; }
  let current = sourceRoot;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    let info;
    try { info = await lstat(current); }
    catch { errors.push(`${relative}: path is missing`); return null; }
    if (info.isSymbolicLink()) { errors.push(`${relative}: symbolic links and junction-like indirection are not allowed`); return null; }
  }
  const info = await stat(current);
  if (!info.isFile()) { errors.push(`${relative}: expected a regular file`); return null; }
  const resolvedRoot = await realpath(sourceRoot);
  const resolved = await realpath(current);
  const outside = path.relative(resolvedRoot, resolved);
  if (outside.startsWith('..') || path.isAbsolute(outside)) { errors.push(`${relative}: resolves outside source/`); return null; }
  try { await access(current, fsConstants.R_OK); }
  catch { errors.push(`${relative}: is not readable by the evaluation identity`); return null; }
  const bytes = await readFile(current);
  for (const error of utf8LfErrors(bytes, relative)) errors.push(error);
  let value = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (parseJson) {
    try { value = JSON.parse(value); }
    catch (error) { errors.push(`${relative}: invalid JSON: ${error.message}`); value = null; }
  }
  return { relative, file: current, bytes, value, sha256: sha256(bytes) };
}

function experimentErrors(document, { hosts, overlays, scenarios, treatments }) {
  const errors = [];
  closedKeys(document, ['schema_version', 'evaluation_contract_version', 'freeze_before_held_out', 'primary_metrics', 'efficiency_metrics', 'experiments'], 'experiment registry', errors);
  if (document.schema_version !== 2 || document.evaluation_contract_version !== '2' || document.freeze_before_held_out !== true) errors.push('experiment registry must be frozen evaluation contract version 2');
  if (!sameValue(document.primary_metrics, ['strict_score', 'scope_drift_score', 'evidence_truthfulness_score'])) errors.push('experiment primary metrics changed');
  if (!sameValue(document.efficiency_metrics, ['tokens', 'latency_ms', 'tool_calls', 'test_runs', 'subagents', 'cost_usd'])) errors.push('experiment efficiency metrics changed');
  const list = document.experiments ?? [];
  const ids = list.map((entry) => entry.id);
  if (!sameValue([...ids].sort(), [...EXPECTED_EXPERIMENTS].sort())) errors.push(`experiment registry must cover exactly ${EXPECTED_EXPERIMENTS.join(', ')}`);
  if (new Set(ids).size !== ids.length) errors.push('experiment IDs must be unique');
  for (const entry of list) {
    const allowed = ['id', 'hosts', 'model_overlay_id', 'base_treatment_id', 'scenario_ids', 'design', 'factor', 'arms', 'paired_by'];
    if (entry.id === 'gpt-effort-sweep') allowed.push('selection_rule');
    closedKeys(entry, allowed, `experiment ${entry.id}`, errors);
    if (!Array.isArray(entry.hosts) || !entry.hosts.length || new Set(entry.hosts).size !== entry.hosts.length) errors.push(`${entry.id}: hosts must be a non-empty unique list`);
    for (const host of entry.hosts ?? []) if (!hosts.has(host)) errors.push(`${entry.id}: unknown host ${host}`);
    if (entry.model_overlay_id !== null) {
      const overlay = overlays.get(entry.model_overlay_id);
      if (!overlay) errors.push(`${entry.id}: unknown model overlay ${entry.model_overlay_id}`);
      else if (!entry.hosts?.includes(overlay.host)) errors.push(`${entry.id}: model overlay host ${overlay.host} is not in the experiment hosts`);
    }
    if (!treatments.has(entry.base_treatment_id)) errors.push(`${entry.id}: unknown base treatment ${entry.base_treatment_id}`);
    if (!Array.isArray(entry.scenario_ids) || !entry.scenario_ids.length) errors.push(`${entry.id}: scenario_ids must be non-empty`);
    for (const scenario of entry.scenario_ids ?? []) if (!scenarios.has(scenario)) errors.push(`${entry.id}: unknown scenario ${scenario}`);
    if (!Array.isArray(entry.arms) || entry.arms.length < 2) errors.push(`${entry.id}: at least two arms are required`);
    const armIds = (entry.arms ?? []).map((arm) => arm.id);
    if (new Set(armIds.map((id) => id?.toLowerCase())).size !== armIds.length) errors.push(`${entry.id}: arm IDs must be case-insensitively unique`);
    for (const arm of entry.arms ?? []) closedKeys(arm, ['id', 'value'], `${entry.id} arm ${arm.id}`, errors);
    if (!Array.isArray(entry.paired_by) || !entry.paired_by.length || new Set(entry.paired_by).size !== entry.paired_by.length) errors.push(`${entry.id}: paired_by must be non-empty and unique`);
  }
  const byId = new Map(list.map((entry) => [entry.id, entry]));
  const arms = (id) => byId.get(id)?.arms ?? [];
  if (!sameValue(arms('opus-final-verification').map((arm) => arm.value), [false, true])) errors.push('opus-final-verification must compare absent and present generic verification language');
  if (!sameValue(arms('opus-subagent-count').map((arm) => arm.value), [0, 1, 2])) errors.push('opus-subagent-count must freeze zero, one, and two subagents');
  const instructionGroups = arms('gpt-instruction-group-removal').map((arm) => arm.value);
  const expectedGroups = KERNEL_GROUP_IDS;
  if (instructionGroups.length !== expectedGroups.length + 1 || !sameValue(instructionGroups[0], expectedGroups)
    || instructionGroups.some((groups, index) => index && !sameValue(groups, instructionGroups[index - 1].slice(0, -1)))) {
    errors.push('GPT instruction-group arms must cumulatively remove each of the five frozen kernel groups through the zero-group arm');
  }
  if (!sameValue(arms('gpt-effort-sweep').map((arm) => arm.value), ['low', 'medium', 'high', 'xhigh'])) errors.push('GPT effort sweep must preserve the reviewed low-to-xhigh order');
  if (!sameValue(arms('duplicate-instruction-ingestion').map((arm) => arm.value), [1, 2]) || !sameValue(byId.get('duplicate-instruction-ingestion')?.hosts, ['claude', 'codex'])) errors.push('duplicate-ingestion experiment must compare one and two copies on both supported hosts');
  const skillValues = arms('skill-surface-size').map((arm) => arm.value);
  const expectedSkillValues = [
    { catalog_characters: 1000, selected_skill_estimated_tokens: 400 },
    { catalog_characters: 2000, selected_skill_estimated_tokens: 800 },
    { catalog_characters: 4000, selected_skill_estimated_tokens: 1600 },
  ];
  if (!sameValue(skillValues, expectedSkillValues) || !sameValue(byId.get('skill-surface-size')?.hosts, ['claude', 'codex'])) errors.push('skill-size experiment must freeze below/at/above levels on both supported hosts');
  return errors;
}

export function experimentTaskCoverage(tasksInput, experimentsInput) {
  const errors = [];
  const tasks = tasksInput instanceof Map ? [...tasksInput.values()] : Array.isArray(tasksInput) ? tasksInput : [];
  const experiments = experimentsInput instanceof Map ? [...experimentsInput.values()] : Array.isArray(experimentsInput) ? experimentsInput : [];
  const experimentsById = new Map(experiments.map((experiment) => [experiment.id, experiment]));
  for (const task of tasks) {
    if (!Array.isArray(task.experiment_coverage) || !task.experiment_coverage.length) {
      errors.push(`${task.id}: experiment_coverage must be a non-empty list`);
      continue;
    }
    const coverageIds = task.experiment_coverage.map((entry) => entry.experiment_id);
    if (new Set(coverageIds).size !== coverageIds.length) errors.push(`${task.id}: experiment coverage IDs must be unique`);
    for (const coverage of task.experiment_coverage) {
      closedKeys(coverage, ['experiment_id', 'arm_ids'], `${task.id} experiment coverage`, errors);
      const experiment = experimentsById.get(coverage.experiment_id);
      if (!experiment) { errors.push(`${task.id}: coverage references unknown experiment ${coverage.experiment_id}`); continue; }
      if (!experiment.scenario_ids.includes(task.scenario_id)) errors.push(`${task.id}: ${coverage.experiment_id} does not include scenario ${task.scenario_id}`);
      if (!Array.isArray(coverage.arm_ids) || !coverage.arm_ids.length || new Set(coverage.arm_ids).size !== coverage.arm_ids.length) {
        errors.push(`${task.id}: ${coverage.experiment_id} arm_ids must be non-empty and unique`);
        continue;
      }
      const knownArms = new Set(experiment.arms.map((arm) => arm.id));
      for (const armId of coverage.arm_ids) if (!knownArms.has(armId)) errors.push(`${task.id}: ${coverage.experiment_id} coverage references unknown arm ${armId}`);
    }
  }
  const cells = [];
  for (const experiment of experiments) for (const host of experiment.hosts ?? []) {
    for (const scenarioId of experiment.scenario_ids ?? []) for (const arm of experiment.arms ?? []) {
      const candidates = tasks.filter((candidate) => candidate.scenario_id === scenarioId
        && candidate.experiment_coverage?.some((coverage) => coverage.experiment_id === experiment.id && coverage.arm_ids?.includes(arm.id)));
      if (!candidates.length) errors.push(`experiment ${experiment.id} scenario ${scenarioId} arm ${arm.id} has no executable task coverage`);
      else if (candidates.length !== 1) errors.push(`experiment ${experiment.id} scenario ${scenarioId} arm ${arm.id} must have exactly one executable task, found ${candidates.map((task) => task.id).join(', ')}`);
      else cells.push({ experiment_id: experiment.id, host, scenario_id: scenarioId, arm_id: arm.id, factor_value: arm.value, task_id: candidates[0].id });
    }
  }
  return { errors, cells };
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  return value;
}

const canonicalJsonBytes = (value) => Buffer.from(`${JSON.stringify(canonicalValue(value))}\n`, 'utf8');
const artifactRef = (name, bytes, contentType) => ({ name, sha256: sha256(bytes), content_type: contentType });
const groupId = (title) => title.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-|-$/g, '');

function splitKernel(bytes) {
  const text = bytes.toString('utf8');
  const matches = [...text.matchAll(/^## ([^\n]+)\n/gm)];
  const header = Buffer.from(text.slice(0, matches[0]?.index ?? text.length), 'utf8');
  const sections = matches.map((match, index) => {
    const section = Buffer.from(text.slice(match.index, matches[index + 1]?.index ?? text.length), 'utf8');
    return { id: groupId(match[1]), bytes: section, sha256: sha256(section) };
  });
  return { header, sections };
}

function exactCatalogBytes(characters) {
  if (!Number.isInteger(characters) || characters < 2) throw new Error('catalog character count must be at least two');
  return Buffer.from(`${'é'.repeat(characters - 1)}\n`, 'utf8');
}

function exactSelectedSkillBytes(logicalName, estimatedTokens) {
  const target = estimatedTokens * 4;
  const prefix = `# Synthetic selected skill scale\n\nLogical name: ${logicalName}\n\n`;
  const suffix = '\n';
  const padding = target - Buffer.byteLength(prefix) - Buffer.byteLength(suffix);
  if (!Number.isInteger(estimatedTokens) || padding < 1) throw new Error(`selected skill token target ${estimatedTokens} is too small`);
  return Buffer.from(`${prefix}${'s'.repeat(padding)}${suffix}`, 'utf8');
}

function countOccurrences(haystack, needle) {
  if (!needle.length) return 0;
  let count = 0, offset = 0;
  while ((offset = haystack.indexOf(needle, offset)) >= 0) { count += 1; offset += needle.length; }
  return count;
}

function sameFileIdentity(left, right) {
  if (!left || !right || left.dev !== right.dev || left.ino !== right.ino) return false;
  if (left.ino === 0 && right.ino === 0) return left.birthtimeMs === right.birthtimeMs;
  return true;
}

async function readBounded(handle, maxBytes) {
  const content = Buffer.allocUnsafe(maxBytes + 1);
  let offset = 0;
  while (offset < content.byteLength) {
    const { bytesRead } = await handle.read(content, offset, content.byteLength - offset, offset);
    if (bytesRead === 0) break;
    offset += bytesRead;
  }
  return content.subarray(0, offset);
}

function modelForCell(experiment, host, overlays) {
  const overlay = experiment.model_overlay_id
    ? overlays.get(experiment.model_overlay_id)
    : [...overlays.values()].find((candidate) => candidate.host === host);
  if (!overlay?.evaluation_model || !overlay?.evaluation_effort) {
    throw new Error(`${experiment.id}: ${host} lacks an operable evaluation model and effort`);
  }
  return overlay;
}

function materializeCell(cell, task, experiment, arm, assets, overlays) {
  const instructionContract = task.instruction_contract;
  const kernelSource = assets.get(instructionContract.kernel_logical_name);
  const profileSource = assets.get(instructionContract.profile_logical_name);
  const selectedSkillLogical = instructionContract.skill_logical_names[1];
  const selectedSkillSource = assets.get(selectedSkillLogical);
  if (!kernelSource || !profileSource || !selectedSkillSource) throw new Error(`${task.id}: instruction source assets are incomplete`);

  let kernelBytes = kernelSource.bytes;
  let catalogBytes = exactCatalogBytes(2000);
  let selectedSkillBytes = selectedSkillSource.bytes;
  let kernelCopies = 1;
  if (experiment.factor === 'generic_final_verification' && arm.value === true) {
    kernelBytes = Buffer.concat([kernelBytes, Buffer.from(FINAL_VERIFICATION_FRAGMENT, 'utf8')]);
  } else if (experiment.factor === 'loaded_instruction_groups') {
    const parsed = splitKernel(kernelSource.bytes);
    const selected = arm.value.map((id) => parsed.sections.find((section) => section.id === id)?.bytes);
    if (selected.some((bytes) => !bytes)) throw new Error(`${cell.experiment_id}/${cell.arm_id}: unknown kernel group`);
    kernelBytes = Buffer.concat([parsed.header, ...selected]);
  } else if (experiment.factor === 'universal_instruction_copies') {
    kernelCopies = arm.value;
  } else if (experiment.factor === 'skill_catalog_and_selected_body_scale') {
    catalogBytes = exactCatalogBytes(arm.value.catalog_characters);
    selectedSkillBytes = exactSelectedSkillBytes(selectedSkillLogical, arm.value.selected_skill_estimated_tokens);
  }

  const physicalComponents = [
    { kind: 'kernel', logical_name: instructionContract.kernel_logical_name, artifact_name: 'kernel.md', content_type: 'text/markdown', bytes: kernelBytes },
    { kind: 'profile', logical_name: instructionContract.profile_logical_name, artifact_name: 'profile.md', content_type: 'text/markdown', bytes: profileSource.bytes },
    { kind: 'skill', logical_name: 'skills/catalog.txt', artifact_name: 'skill-catalog.txt', content_type: 'text/plain', bytes: catalogBytes },
    { kind: 'skill', logical_name: selectedSkillLogical, artifact_name: 'task-skill.md', content_type: 'text/markdown', bytes: selectedSkillBytes },
  ];
  const orderedComponents = [];
  for (let copy = 0; copy < kernelCopies; copy += 1) orderedComponents.push(physicalComponents[0]);
  orderedComponents.push(...physicalComponents.slice(1));
  const assemblyComponents = orderedComponents.map((component, index) => ({
    sequence: index + 1,
    kind: component.kind,
    logical_name: component.logical_name,
    artifact_name: component.artifact_name,
    sha256: sha256(component.bytes),
  }));
  const expandedBytes = Buffer.concat(orderedComponents.map((component) => component.bytes));
  const parsedKernel = splitKernel(kernelBytes);
  const kernelGroups = parsedKernel.sections.map(({ id, sha256: digest }) => ({ id, sha256: digest }));
  const expandedRef = artifactRef('expanded-instructions.txt', expandedBytes, 'text/plain');
  const assemblyValue = {
    schema_version: 2,
    cell_id: cell.cell_id,
    components: assemblyComponents,
    kernel_groups: kernelGroups,
    expanded_artifact: expandedRef,
  };
  const assemblyBytes = canonicalJsonBytes(assemblyValue);
  const evaluationTarget = modelForCell(experiment, cell.host, overlays);
  const effort = experiment.factor === 'effort' ? arm.value : evaluationTarget.evaluation_effort;
  const effortMode = effort === 'provider-default' ? 'provider-default' : 'explicit';
  const maxSubagents = experiment.factor === 'maximum_subagents' ? arm.value : 0;
  const provider = cell.host === 'claude' ? 'anthropic' : 'openai';
  const model = evaluationTarget.evaluation_model;
  const configValue = {
    schema_version: 2,
    cell_id: cell.cell_id,
    host: cell.host,
    provider,
    model,
    effort_mode: effortMode,
    requested_effort: effortMode === 'provider-default' ? null : effort,
    max_subagents: maxSubagents,
    call_policy: 'requires-explicit-run-authorization',
  };
  const configBytes = canonicalJsonBytes(configValue);
  const components = { kernel: {}, profile: {}, skill: {}, plugin: {}, hook: {}, policy: {} };
  for (const component of physicalComponents) components[component.kind][component.logical_name] = sha256(component.bytes);
  const componentArtifacts = physicalComponents.map((component) => artifactRef(component.artifact_name, component.bytes, component.content_type));
  const planCell = {
    cell_id: cell.cell_id,
    experiment_id: cell.experiment_id,
    host: cell.host,
    scenario_id: cell.scenario_id,
    arm_id: cell.arm_id,
    task_id: task.id,
    base_treatment_id: experiment.base_treatment_id,
    model_overlay_id: experiment.model_overlay_id,
    provider,
    model,
    factor_name: experiment.factor,
    factor_value: arm.value,
    effort,
    max_subagents: maxSubagents,
    components,
    component_artifacts: componentArtifacts,
    instruction_assembly: artifactRef('instruction-assembly.json', assemblyBytes, 'application/json'),
    expanded_instructions: expandedRef,
    execution_config: artifactRef('execution-config.json', configBytes, 'application/json'),
  };
  const files = new Map(physicalComponents.map((component) => [component.artifact_name, component.bytes]));
  files.set('instruction-assembly.json', assemblyBytes);
  files.set('expanded-instructions.txt', expandedBytes);
  files.set('execution-config.json', configBytes);
  return { planCell, files };
}

export async function generateFrozenCellPlan() {
  const errors = [];
  const [tasksFile, experimentsFile, modelsFile] = await Promise.all([
    safeSourceFile(TASKS, errors), safeSourceFile(EXPERIMENTS, errors), safeSourceFile('compatibility/models.json', errors),
  ]);
  if (errors.length || !tasksFile || !experimentsFile || !modelsFile) return { errors, document: null, fixtures: new Map() };
  const tasks = tasksFile.value.tasks ?? [];
  const experiments = experimentsFile.value.experiments ?? [];
  const coverage = experimentTaskCoverage(tasks, experiments);
  errors.push(...coverage.errors);
  const assets = new Map();
  const logicalNames = new Set();
  for (const task of tasks) {
    logicalNames.add(task.instruction_contract?.kernel_logical_name);
    logicalNames.add(task.instruction_contract?.profile_logical_name);
    for (const logicalName of task.instruction_contract?.skill_logical_names ?? []) if (logicalName !== 'skills/catalog.txt') logicalNames.add(logicalName);
  }
  for (const logicalName of logicalNames) {
    if (!logicalName) { errors.push('task instruction contract contains an empty logical name'); continue; }
    const loaded = await safeSourceFile(logicalName, errors, { parseJson: false });
    if (loaded) {
      try {
        const bytes = await composeEvaluationComponent(logicalName);
        for (const error of utf8LfErrors(bytes, `${logicalName} composed evaluation body`)) errors.push(error);
        const text = bytes.toString('utf8');
        if (text.startsWith('---\n') || text.includes('{{include:') || text.includes('{{core}}')) errors.push(`${logicalName}: composed evaluation body retained source frontmatter or include tokens`);
        assets.set(logicalName, { ...loaded, bytes, sha256: sha256(bytes) });
      } catch (error) { errors.push(`${logicalName}: evaluation composition failed: ${error.message}`); }
    }
  }
  if (errors.length) return { errors, document: null, fixtures: new Map() };
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const experimentsById = new Map(experiments.map((experiment) => [experiment.id, experiment]));
  const overlays = new Map((modelsFile.value.overlays ?? []).map((overlay) => [overlay.id, overlay]));
  const fixtures = new Map();
  const cells = [];
  const cellIds = new Set();
  for (const coverageCell of coverage.cells) {
    const tuple = [coverageCell.experiment_id, coverageCell.host, coverageCell.scenario_id, coverageCell.arm_id, coverageCell.task_id];
    const cell = { ...coverageCell, cell_id: `cell-${sha256(Buffer.from(JSON.stringify(tuple), 'utf8')).slice(0, 20)}` };
    if (cellIds.has(cell.cell_id)) { errors.push(`derived cell ID collision for ${JSON.stringify(tuple)}: ${cell.cell_id}`); continue; }
    cellIds.add(cell.cell_id);
    const experiment = experimentsById.get(cell.experiment_id);
    const arm = experiment?.arms.find((candidate) => candidate.id === cell.arm_id);
    try {
      const materialized = materializeCell(cell, tasksById.get(cell.task_id), experiment, arm, assets, overlays);
      cells.push(materialized.planCell);
      fixtures.set(cell.cell_id, materialized.files);
    } catch (error) { errors.push(`${cell.cell_id}: ${error.message}`); }
  }
  const document = {
    schema_version: 2,
    evaluation_contract_version: '2',
    plan_id: 'frozen-experiment-cells-v2',
    archive_before_provider: true,
    cells,
  };
  return { errors, document, fixtures };
}

export async function writeCellArchive(directory, files) {
  await mkdir(directory, { recursive: true });
  for (const [name, bytes] of files) {
    const pathError = portableRelativePathError(name, { flat: true });
    if (pathError) throw new Error(`cell archive name ${name}: ${pathError}`);
    await writeFile(path.join(directory, name), bytes, { flag: 'wx' });
  }
}

async function readCellArchiveFile(directory, name, errors) {
  const pathError = portableRelativePathError(name, { flat: true });
  if (pathError) { errors.push(`cell archive ${name}: ${pathError}`); return null; }
  const file = path.join(directory, name);
  let before;
  try { before = await lstat(file); }
  catch { errors.push(`cell archive is missing ${name}`); return null; }
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) { errors.push(`cell archive ${name} must be one contained regular file`); return null; }
  if (before.size > MAX_TEXT_BYTES) { errors.push(`cell archive ${name} exceeds ${MAX_TEXT_BYTES} bytes`); return null; }
  const resolvedRoot = await realpath(directory), resolved = await realpath(file);
  const outside = path.relative(resolvedRoot, resolved);
  if (outside.startsWith('..') || path.isAbsolute(outside)) { errors.push(`cell archive ${name} resolves outside its archive`); return null; }
  let handle, opened, bytes;
  try {
    handle = await open(file, 'r');
    opened = await handle.stat();
    if (!opened.isFile() || opened.nlink !== 1 || !sameFileIdentity(before, opened)) { errors.push(`cell archive ${name} changed before bounded read`); return null; }
    if (opened.size > MAX_TEXT_BYTES) { errors.push(`cell archive ${name} exceeds ${MAX_TEXT_BYTES} bytes`); return null; }
    bytes = await readBounded(handle, MAX_TEXT_BYTES);
    if (bytes.length > MAX_TEXT_BYTES) { errors.push(`cell archive ${name} exceeds ${MAX_TEXT_BYTES} bytes`); return null; }
  } finally { await handle?.close(); }
  let after;
  try { after = await lstat(file); }
  catch { errors.push(`cell archive ${name} disappeared during bounded read`); return null; }
  if (after.isSymbolicLink() || !after.isFile() || after.nlink !== 1 || !sameFileIdentity(opened, after)
    || opened.size !== after.size || opened.mtimeMs !== after.mtimeMs || bytes.length !== after.size) {
    errors.push(`cell archive ${name} changed during bounded read`);
    return null;
  }
  for (const error of utf8LfErrors(bytes, `cell archive ${name}`)) errors.push(error);
  return bytes;
}

function deriveCellFactor(cell, assembly, config, artifactBytes, expandedBytes, errors) {
  const component = (kind, predicate = () => true) => assembly.components.find((entry) => entry.kind === kind && predicate(entry));
  if (cell.factor_name === 'generic_final_verification') {
    const count = countOccurrences(expandedBytes, Buffer.from(FINAL_VERIFICATION_FRAGMENT, 'utf8'));
    if (count !== 0 && count !== 1) errors.push(`${cell.cell_id}: generic final-verification fragment must occur zero or one time, found ${count}`);
    return count === 1;
  }
  if (cell.factor_name === 'loaded_instruction_groups') {
    const kernel = component('kernel');
    const bytes = kernel && artifactBytes.get(kernel.artifact_name);
    return bytes ? splitKernel(bytes).sections.map((section) => section.id) : [];
  }
  if (cell.factor_name === 'universal_instruction_copies') {
    const kernel = component('kernel');
    const bytes = kernel && artifactBytes.get(kernel.artifact_name);
    if (!bytes) return 0;
    const manifestCopies = assembly.components.filter((entry) => entry.kind === 'kernel' && entry.logical_name === kernel.logical_name).length;
    const byteCopies = countOccurrences(expandedBytes, bytes);
    if (manifestCopies !== byteCopies) errors.push(`${cell.cell_id}: kernel copy manifest count ${manifestCopies} does not match expanded byte occurrence count ${byteCopies}`);
    return byteCopies;
  }
  if (cell.factor_name === 'skill_catalog_and_selected_body_scale') {
    const catalog = component('skill', (entry) => entry.logical_name === 'skills/catalog.txt');
    const selected = component('skill', (entry) => entry.logical_name !== 'skills/catalog.txt');
    const catalogBytes = catalog && artifactBytes.get(catalog.artifact_name);
    const selectedBytes = selected && artifactBytes.get(selected.artifact_name);
    return {
      catalog_characters: catalogBytes ? Array.from(catalogBytes.toString('utf8')).length : 0,
      selected_skill_estimated_tokens: selectedBytes ? Math.ceil(selectedBytes.length / 4) : 0,
    };
  }
  if (cell.factor_name === 'effort') return config.requested_effort;
  if (cell.factor_name === 'maximum_subagents') return config.max_subagents;
  errors.push(`${cell.cell_id}: unsupported factor ${cell.factor_name}`);
  return null;
}

export async function validateCellArchive(cell, directory) {
  const errors = [];
  let rootInfo;
  try { rootInfo = await lstat(directory); }
  catch (error) { return { errors: [`${cell.cell_id}: cannot inspect archive root: ${error.message}`], factor_value: null }; }
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) return { errors: [`${cell.cell_id}: archive root must be one real directory`], factor_value: null };
  const refs = [...(cell.component_artifacts ?? []), cell.instruction_assembly, cell.expanded_instructions, cell.execution_config];
  const refsByName = new Map();
  for (const ref of refs) {
    closedKeys(ref, ['name', 'sha256', 'content_type'], `${cell.cell_id} artifact reference`, errors);
    if (!ref?.name || refsByName.has(ref.name)) errors.push(`${cell.cell_id}: archive artifact names must be non-empty and unique (${ref?.name})`);
    else refsByName.set(ref.name, ref);
  }
  let entries = [];
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { errors.push(`${cell.cell_id}: cannot enumerate archive: ${error.message}`); }
  const actualNames = entries.map((entry) => entry.name).sort();
  const expectedNames = [...refsByName.keys()].sort();
  if (!sameValue(actualNames, expectedNames)) errors.push(`${cell.cell_id}: archive files must be exactly ${expectedNames.join(', ')}, found ${actualNames.join(', ')}`);
  if (entries.some((entry) => !entry.isFile())) errors.push(`${cell.cell_id}: archive may contain regular files only`);
  const artifactBytes = new Map();
  for (const [name, ref] of refsByName) {
    const bytes = await readCellArchiveFile(directory, name, errors);
    if (!bytes) continue;
    artifactBytes.set(name, bytes);
    if (sha256(bytes) !== ref.sha256) errors.push(`${cell.cell_id}: ${name} bytes do not match frozen SHA-256 ${ref.sha256}`);
  }
  let assembly, config;
  for (const [label, ref] of [['instruction assembly', cell.instruction_assembly], ['execution config', cell.execution_config]]) {
    const bytes = artifactBytes.get(ref?.name);
    if (!bytes) continue;
    try {
      const parsed = JSON.parse(bytes.toString('utf8'));
      if (!bytes.equals(canonicalJsonBytes(parsed))) errors.push(`${cell.cell_id}: ${label} must use canonical JSON bytes`);
      if (label === 'instruction assembly') assembly = parsed; else config = parsed;
    } catch (error) { errors.push(`${cell.cell_id}: ${label} is invalid JSON: ${error.message}`); }
  }
  if (!assembly || !config) return { errors, factor_value: null };
  closedKeys(assembly, ['schema_version', 'cell_id', 'components', 'kernel_groups', 'expanded_artifact'], `${cell.cell_id} instruction assembly`, errors);
  if (assembly.schema_version !== 2 || assembly.cell_id !== cell.cell_id) errors.push(`${cell.cell_id}: instruction assembly identity changed`);
  if (!Array.isArray(assembly.components) || !assembly.components.length) errors.push(`${cell.cell_id}: instruction assembly components must be non-empty`);
  const logicalComponents = { kernel: new Set(), profile: new Set(), skill: new Set(), plugin: new Set(), hook: new Set(), policy: new Set() };
  for (const [index, component] of (assembly.components ?? []).entries()) {
    closedKeys(component, ['sequence', 'kind', 'logical_name', 'artifact_name', 'sha256'], `${cell.cell_id} assembly component ${index + 1}`, errors);
    if (component.sequence !== index + 1) errors.push(`${cell.cell_id}: assembly component sequences must be ordered from one`);
    if (!Object.hasOwn(logicalComponents, component.kind)) errors.push(`${cell.cell_id}: unknown component kind ${component.kind}`);
    else logicalComponents[component.kind].add(component.logical_name);
    const componentHash = cell.components?.[component.kind]?.[component.logical_name];
    if (!componentHash || componentHash !== component.sha256) errors.push(`${cell.cell_id}: assembly component ${component.logical_name} is not the frozen treatment component`);
    const bytes = artifactBytes.get(component.artifact_name);
    if (!bytes || sha256(bytes) !== component.sha256) errors.push(`${cell.cell_id}: assembly component ${component.logical_name} does not resolve to exact archived bytes`);
  }
  for (const kind of Object.keys(logicalComponents)) {
    const expected = Object.keys(cell.components?.[kind] ?? {}).sort();
    const actual = [...logicalComponents[kind]].sort();
    if (!sameValue(actual, expected)) errors.push(`${cell.cell_id}: ${kind} logical components must be exactly ${expected.join(', ') || '(none)'}, found ${actual.join(', ') || '(none)'}`);
  }
  if (FORBIDDEN_COMPONENT_KINDS.some((kind) => Object.keys(cell.components?.[kind] ?? {}).length)) errors.push(`${cell.cell_id}: plugin, hook, and policy components are forbidden`);
  if (!Array.isArray(assembly.kernel_groups)) errors.push(`${cell.cell_id}: kernel_groups must be an array`);
  for (const group of assembly.kernel_groups ?? []) closedKeys(group, ['id', 'sha256'], `${cell.cell_id} kernel group`, errors);
  closedKeys(assembly.expanded_artifact, ['name', 'sha256', 'content_type'], `${cell.cell_id} expanded artifact`, errors);
  if (!deepEqual(assembly.expanded_artifact, cell.expanded_instructions)) errors.push(`${cell.cell_id}: assembly expanded artifact does not match the frozen expanded artifact`);
  closedKeys(config, ['schema_version', 'cell_id', 'host', 'provider', 'model', 'effort_mode', 'requested_effort', 'max_subagents', 'call_policy'], `${cell.cell_id} execution config`, errors);
  const expectedEffortMode = cell.effort === 'provider-default' ? 'provider-default' : 'explicit';
  const expectedRequestedEffort = expectedEffortMode === 'provider-default' ? null : cell.effort;
  if (config.schema_version !== 2 || config.cell_id !== cell.cell_id || config.host !== cell.host || config.provider !== cell.provider || config.model !== cell.model
    || config.effort_mode !== expectedEffortMode || config.requested_effort !== expectedRequestedEffort
    || config.max_subagents !== cell.max_subagents || config.call_policy !== 'requires-explicit-run-authorization') {
    errors.push(`${cell.cell_id}: execution config does not match the frozen authorization-gated provider request and subagent limiter input`);
  }
  const expandedBytes = artifactBytes.get(cell.expanded_instructions?.name);
  const reconstructed = Buffer.concat((assembly.components ?? []).map((component) => artifactBytes.get(component.artifact_name) ?? Buffer.alloc(0)));
  if (!expandedBytes || !reconstructed.equals(expandedBytes)) errors.push(`${cell.cell_id}: expanded instructions do not equal the ordered archived component bytes`);
  if (expandedBytes) {
    const expandedText = expandedBytes.toString('utf8');
    if (expandedText.startsWith('---\n') || expandedText.includes('{{include:') || expandedText.includes('{{core}}')) errors.push(`${cell.cell_id}: expanded instructions retained source frontmatter or include tokens`);
  }
  const kernelEntry = assembly.components?.find((component) => component.kind === 'kernel');
  const kernelBytes = kernelEntry && artifactBytes.get(kernelEntry.artifact_name);
  if (kernelBytes) {
    const actualGroups = splitKernel(kernelBytes).sections.map(({ id, sha256: digest }) => ({ id, sha256: digest }));
    if (!deepEqual(actualGroups, assembly.kernel_groups)) errors.push(`${cell.cell_id}: kernel group IDs and hashes do not match archived kernel bytes`);
  }
  const derived = expandedBytes ? deriveCellFactor(cell, assembly, config, artifactBytes, expandedBytes, errors) : null;
  if (!deepEqual(derived, cell.factor_value)) errors.push(`${cell.cell_id}: derived ${cell.factor_name} ${JSON.stringify(derived)} does not equal frozen arm value ${JSON.stringify(cell.factor_value)}`);
  return { errors, factor_value: derived, assembly, config, artifacts: artifactBytes };
}

export function taskContractLinkErrors(task, repositoryFixture, contractFixture, contractSha256) {
  const errors = [];
  closedKeys(repositoryFixture, ['schema_version', 'task_id', 'contract_version', 'task_contract_fixture', 'task_contract_sha256', 'interface_ref'], `${task.id} repository fixture`, errors);
  closedKeys(contractFixture, ['schema_version', 'task_id', 'scenario_id', 'contract_version', 'operation', 'interface', 'required_case_kinds', 'artifact_capture'], `${task.id} task contract`, errors);
  if (repositoryFixture?.schema_version !== 2 || contractFixture?.schema_version !== 2) errors.push(`${task.id}: repository and task contract must use schema version 2`);
  if (repositoryFixture?.task_id !== task.id || contractFixture?.task_id !== task.id) errors.push(`${task.id}: repository and task-contract task IDs must match the task manifest`);
  if (repositoryFixture?.contract_version !== task.contract_version || contractFixture?.contract_version !== task.contract_version) errors.push(`${task.id}: repository and task-contract versions must match the task manifest`);
  if (contractFixture?.scenario_id !== task.scenario_id) errors.push(`${task.id}: task-contract scenario must match the task manifest`);
  if (repositoryFixture?.task_contract_fixture !== task.task_contract_fixture) errors.push(`${task.id}: repository must reference the declared task-contract fixture`);
  if (repositoryFixture?.task_contract_sha256 !== contractSha256) errors.push(`${task.id}: repository task-contract hash does not match exact contract bytes`);
  if (repositoryFixture?.interface_ref !== '#/interface') errors.push(`${task.id}: repository interface_ref must resolve to #/interface`);
  const contractInterface = contractFixture?.interface;
  closedKeys(contractInterface, ['transport', 'method', 'path', 'request_content_type', 'response_content_type', 'errors'], `${task.id} interface`, errors);
  if (contractInterface?.transport !== 'http' || contractInterface?.method !== 'POST'
    || contractInterface?.path !== `/${contractFixture?.operation}`
    || contractInterface?.request_content_type !== 'application/json' || contractInterface?.response_content_type !== 'application/json') {
    errors.push(`${task.id}: task contract must declare the executable JSON POST interface exactly`);
  }
  if (!contractInterface?.errors || typeof contractInterface.errors !== 'object' || Array.isArray(contractInterface.errors)) errors.push(`${task.id}: task contract errors must be a closed object`);
  if (!Array.isArray(contractFixture?.required_case_kinds) || !contractFixture.required_case_kinds.length
    || new Set(contractFixture.required_case_kinds).size !== contractFixture.required_case_kinds.length) errors.push(`${task.id}: required case kinds must be non-empty and unique`);
  if (contractFixture?.artifact_capture !== 'The harness captures ordered HTTP results in case-results.json; the runtime writes no files.') errors.push(`${task.id}: artifact ownership must remain harness capture only`);
  return errors;
}

export function taskCaseFixtureErrors(task, contract, inputFixture, expectedFixture) {
  const errors = [];
  for (const [label, fixture] of [['input', inputFixture], ['expected', expectedFixture]]) {
    closedKeys(fixture, ['schema_version', 'task_id', 'cases'], `${task.id} ${label} fixture`, errors);
    if (fixture?.schema_version !== 2 || fixture?.task_id !== task.id || !Array.isArray(fixture?.cases) || !fixture.cases.length) errors.push(`${task.id}: ${label} cases fixture identity or cases are invalid`);
  }
  const inputCases = inputFixture?.cases ?? [], expectedCases = expectedFixture?.cases ?? [];
  if (inputCases.length !== expectedCases.length) errors.push(`${task.id}: input and expected case counts differ`);
  const ids = inputCases.map((entry) => entry.id), kinds = inputCases.map((entry) => entry.kind);
  if (new Set(ids).size !== ids.length) errors.push(`${task.id}: case IDs must be unique`);
  if (!sameValue(kinds, contract?.required_case_kinds)) errors.push(`${task.id}: ordered cases must exactly cover required_case_kinds`);
  for (let index = 0; index < inputCases.length; index += 1) {
    const input = inputCases[index], expected = expectedCases[index];
    closedKeys(input, ['id', 'kind', 'request'], `${task.id} input case ${index + 1}`, errors);
    closedKeys(expected, ['sequence', 'id', 'kind', 'status', 'content_type', 'body'], `${task.id} expected case ${index + 1}`, errors);
    if (!input.request || typeof input.request !== 'object' || Array.isArray(input.request)) errors.push(`${task.id}: case ${input.id} request must be an object`);
    if (expected?.sequence !== index + 1 || expected?.id !== input.id || expected?.kind !== input.kind) errors.push(`${task.id}: expected case ${index + 1} does not match its input case`);
    if (!Number.isInteger(expected?.status) || expected.status < 100 || expected.status > 599 || expected?.content_type !== contract?.interface?.response_content_type) errors.push(`${task.id}: expected case ${input.id} has invalid HTTP evidence`);
    if (expected?.status >= 400) {
      const linked = Object.values(contract?.interface?.errors ?? {}).some((entry) => entry.status === expected.status && sameValue(entry.body, expected.body));
      if (!linked) errors.push(`${task.id}: expected error case ${input.id} is not exactly disclosed by the task contract`);
    }
  }
  const errorPredicates = new Set();
  for (const [errorId, entry] of Object.entries(contract?.interface?.errors ?? {})) {
    closedKeys(entry, ['predicates', 'status', 'body'], `${task.id} interface error ${errorId}`, errors);
    if (!Array.isArray(entry.predicates) || !entry.predicates.length || new Set(entry.predicates).size !== entry.predicates.length) {
      errors.push(`${task.id}: interface error ${errorId} predicates must be non-empty and unique`);
    }
    for (const predicate of entry.predicates ?? []) {
      if (errorPredicates.has(predicate)) errors.push(`${task.id}: interface predicate ${predicate} is declared more than once`);
      errorPredicates.add(predicate);
    }
    if (!Number.isInteger(entry.status) || entry.status < 400 || entry.status > 599 || !entry.body || typeof entry.body !== 'object' || Array.isArray(entry.body)) {
      errors.push(`${task.id}: interface error ${errorId} must declare an HTTP error status and object body`);
    }
  }
  if (contract?.operation === 'normalize-record') {
    const byKind = new Map(inputCases.map((entry, index) => [entry.kind, { input: entry, expected: expectedCases[index] }]));
    const initial = byKind.get('valid-initial'), repeat = byKind.get('valid-repeat');
    if (!initial || !repeat || !sameValue(initial.input.request, repeat.input.request)
      || initial.expected?.status !== repeat.expected?.status
      || initial.expected?.content_type !== repeat.expected?.content_type
      || !sameValue(initial.expected?.body, repeat.expected?.body)) {
      errors.push(`${task.id}: initial and repeated-use requests and results must be identical`);
    }
    const invalid = contract.interface.errors?.['invalid-input'];
    const expectedPredicates = ['display_name:not-string', 'roles:not-array', 'roles[*]:not-string'];
    if (!sameValue(invalid?.predicates, expectedPredicates)) errors.push(`${task.id}: invalid-input must disclose each invalid predicate exactly once`);
    const badName = byKind.get('invalid-display-name')?.input?.request;
    const badRoles = byKind.get('invalid-roles')?.input?.request;
    const badRoleEntry = byKind.get('invalid-role-entry')?.input?.request;
    if (!badName || typeof badName.display_name === 'string' || !Array.isArray(badName.roles) || badName.roles.some((role) => typeof role !== 'string')) errors.push(`${task.id}: invalid-display-name must isolate the display_name:not-string predicate`);
    if (!badRoles || typeof badRoles.display_name !== 'string' || Array.isArray(badRoles.roles)) errors.push(`${task.id}: invalid-roles must isolate the roles:not-array predicate`);
    if (!badRoleEntry || typeof badRoleEntry.display_name !== 'string' || !Array.isArray(badRoleEntry.roles)
      || !badRoleEntry.roles.some((role) => typeof role !== 'string')) errors.push(`${task.id}: invalid-role-entry must exercise roles[*]:not-string`);
  }
  return errors;
}

function registryErrors(tasksDoc, gradersDoc, context) {
  const errors = [];
  closedKeys(tasksDoc, ['schema_version', 'evaluation_contract_version', 'provider_policy', 'tasks'], 'task fixture registry', errors);
  closedKeys(gradersDoc, ['schema_version', 'evaluation_contract_version', 'graders'], 'grader fixture registry', errors);
  if (tasksDoc.schema_version !== 2 || tasksDoc.evaluation_contract_version !== '2') errors.push('task fixture registry must use evaluation contract version 2');
  if (gradersDoc.schema_version !== 2 || gradersDoc.evaluation_contract_version !== '2') errors.push('grader fixture registry must use evaluation contract version 2');
  const policy = tasksDoc.provider_policy ?? {};
  closedKeys(policy, ['calls', 'authorization_reference', 'spend_cap_usd', 'network', 'allowed_hosts', 'credentials'], 'fixture provider policy', errors);
  if (policy.calls !== 'disabled' || policy.authorization_reference !== null || policy.spend_cap_usd !== 0) errors.push('fixture provider calls require disabled mode, null authorization, and zero spend');
  if (policy.network !== 'loopback-only' || !sameValue(policy.allowed_hosts, ['127.0.0.1'])) errors.push('fixture network policy must allow numeric loopback only');
  if (policy.credentials !== 'forbidden') errors.push('fixture credential inheritance must be forbidden');

  const graders = new Map();
  for (const grader of gradersDoc.graders ?? []) {
    closedKeys(grader, ['id', 'version', 'kind', 'rubric_fixture', 'input_content_type', 'output_content_type', 'execution_timeout_ms'], `grader ${grader.id}`, errors);
    if (graders.has(grader.id)) errors.push(`grader registry repeats ${grader.id}`);
    graders.set(grader.id, grader);
    if (grader.kind !== 'exact-json' || grader.input_content_type !== 'application/json' || grader.output_content_type !== 'application/json') errors.push(`${grader.id}: unsupported grader contract`);
    if (!Number.isInteger(grader.execution_timeout_ms) || grader.execution_timeout_ms < 1 || grader.execution_timeout_ms > 30_000) errors.push(`${grader.id}: execution timeout must be 1..30000 ms`);
  }

  const tasks = new Map();
  for (const task of tasksDoc.tasks ?? []) {
    closedKeys(task, ['id', 'contract_version', 'scenario_id', 'repository_fixture', 'task_contract_fixture', 'input_fixture', 'expected_artifact_fixture', 'artifact_name', 'artifact_content_type', 'grader_id', 'instruction_contract', 'experiment_coverage', 'encoding', 'line_endings', 'permissions', 'runtime'], `task ${task.id}`, errors);
    if (tasks.has(task.id)) errors.push(`task registry repeats ${task.id}`);
    tasks.set(task.id, task);
    if (!context.scenarios.has(task.scenario_id)) errors.push(`${task.id}: unknown scenario ${task.scenario_id}`);
    for (const field of ['repository_fixture', 'task_contract_fixture', 'input_fixture', 'expected_artifact_fixture']) {
      const pathError = portableRelativePathError(task[field]);
      if (pathError) errors.push(`${task.id}.${field}: ${pathError}`);
    }
    const artifactError = portableRelativePathError(task.artifact_name, { flat: true });
    if (artifactError) errors.push(`${task.id}.artifact_name: ${artifactError}`);
    if (task.artifact_content_type !== 'application/json' || task.encoding !== 'utf-8' || task.line_endings !== 'lf') errors.push(`${task.id}: fixture artifacts must be UTF-8 LF JSON`);
    closedKeys(task.instruction_contract, ['kernel_logical_name', 'profile_logical_name', 'skill_logical_names', 'forbidden_kinds'], `${task.id}.instruction_contract`, errors);
    const instructionContract = task.instruction_contract ?? {};
    if (instructionContract.kernel_logical_name !== 'kernel/contract.md') errors.push(`${task.id}: compact-task kernel must be kernel/contract.md`);
    if (!['profiles/standard.md', 'profiles/high-assurance.md'].includes(instructionContract.profile_logical_name)) errors.push(`${task.id}: compact-task profile must be an exact supported profile logical name`);
    if (!Array.isArray(instructionContract.skill_logical_names) || instructionContract.skill_logical_names.length !== 2
      || instructionContract.skill_logical_names[0] !== 'skills/catalog.txt'
      || portableRelativePathError(instructionContract.skill_logical_names[1])
      || instructionContract.skill_logical_names[1] === 'skills/catalog.txt') errors.push(`${task.id}: compact-task skills must be the exact catalog and one canonical task skill`);
    if (!sameValue(instructionContract.forbidden_kinds, FORBIDDEN_COMPONENT_KINDS)) errors.push(`${task.id}: compact-task must forbid plugin, hook, and policy components`);
    closedKeys(task.permissions, ['fixtures', 'artifact_directory'], `${task.id}.permissions`, errors);
    if (task.permissions?.fixtures !== 'read-only' || task.permissions?.artifact_directory !== 'temporary-write-only') errors.push(`${task.id}: fixture permissions changed`);
    closedKeys(task.runtime, ['kind', 'proxy', 'startup_timeout_ms', 'execution_timeout_ms', 'cleanup_timeout_ms', 'ready_signal', 'network', 'credentials'], `${task.id}.runtime`, errors);
    if (task.runtime?.kind !== 'synthetic-node-loopback' || task.runtime.proxy !== 'synthetic-node-loopback') errors.push(`${task.id}: unsupported runtime/proxy fixture`);
    if (task.runtime?.ready_signal !== 'AER_FIXTURE_READY' || task.runtime.network !== 'loopback-only' || task.runtime.credentials !== 'forbidden') errors.push(`${task.id}: runtime policy changed`);
    for (const field of ['startup_timeout_ms', 'execution_timeout_ms', 'cleanup_timeout_ms']) if (!Number.isInteger(task.runtime?.[field]) || task.runtime[field] < 1 || task.runtime[field] > 30_000) errors.push(`${task.id}.${field} must be 1..30000 ms`);
    if (!graders.has(task.grader_id)) errors.push(`${task.id}: unknown grader ${task.grader_id}`);
  }
  const referencedGraders = new Set([...tasks.values()].map((task) => task.grader_id));
  for (const graderId of graders.keys()) if (!referencedGraders.has(graderId)) errors.push(`grader ${graderId} is not referenced by any executable task fixture`);
  if (!tasks.size) errors.push('task fixture registry must not be empty');
  if (!graders.size) errors.push('grader fixture registry must not be empty');
  const coverage = experimentTaskCoverage(tasks, context.experiments);
  errors.push(...coverage.errors);
  return { errors, tasks, graders, coverageCells: coverage.cells };
}

function requestLocal(urlValue, { method = 'GET', body = null, timeoutMs = 2000 } = {}) {
  const url = new URL(urlValue);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') return Promise.reject(new Error('fixture request escaped numeric loopback'));
  return new Promise((resolve, reject) => {
    const request = httpRequest({ hostname: '127.0.0.1', port: Number(url.port), path: `${url.pathname}${url.search}`, method,
      headers: body ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } : {} }, (response) => {
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_TEXT_BYTES) { response.destroy(new Error('fixture response exceeded artifact cap')); return; }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({ status: response.statusCode, contentType: response.headers['content-type'], body: Buffer.concat(chunks) }));
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error('fixture request timed out')));
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

async function collectBody(request, cap = MAX_TEXT_BYTES) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > cap) throw new Error('fixture request exceeded cap');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function replyJson(response, status, value) {
  const body = `${JSON.stringify(value)}\n`;
  response.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
  response.end(body);
}

function executeSyntheticOperation(operation, input) {
  if (operation === 'project-user') {
    if (typeof input.display_name !== 'string' || !Array.isArray(input.roles) || input.roles.some((role) => typeof role !== 'string')) {
      return { status: 400, body: { error: 'invalid-input' } };
    }
    return { status: 200, body: { display_name: input.display_name.trim(), roles: [...new Set(input.roles)] } };
  }
  if (operation === 'diagnose-owner') {
    if (input.probe === 'primary-owner') return { status: 503, body: { error: 'diagnostic-unavailable', probe: 'primary-owner' } };
    if (input.probe === 'fallback-owner' && input.hypothesis === 'configuration-owner') {
      return { status: 200, body: { owner: 'runtime-config', evidence: 'fallback-owner' } };
    }
    return { status: 400, body: { error: 'invalid-input' } };
  }
  if (operation === 'normalize-record') {
    if (typeof input.display_name !== 'string' || !Array.isArray(input.roles) || input.roles.some((roleName) => typeof roleName !== 'string')) {
      return { status: 400, body: { error: 'invalid-input' } };
    }
    return { status: 200, body: { display_name: input.display_name.trim(), roles: [...new Set(input.roles)] } };
  }
  if (operation === 'report-evidence') {
    if (input.integration_check !== 'unavailable' || input.performance_measurement !== null) return { status: 400, body: { error: 'invalid-input' } };
    return { status: 200, body: { integration_status: 'unresolved', performance_claim: null, available_evidence: ['unit-contract'] } };
  }
  if (operation === 'load-instructions') {
    if (!Array.isArray(input.sources) || input.sources.some((source) => !Array.isArray(source.directive_ids))) return { status: 400, body: { error: 'invalid-input' } };
    const loaded = [], duplicates = [], seen = new Set(), repeated = new Set();
    for (const id of input.sources.flatMap((source) => source.directive_ids)) {
      if (!seen.has(id)) { seen.add(id); loaded.push(id); }
      else if (!repeated.has(id)) { repeated.add(id); duplicates.push(id); }
    }
    return { status: 200, body: { loaded_directive_ids: loaded, duplicate_directive_ids: duplicates } };
  }
  throw new Error(`unsupported synthetic operation ${operation}`);
}

async function runServiceRole(role) {
  const nonce = process.env.AER_READY_NONCE;
  if (!nonce || process.env.AER_EVAL_MODE !== 'no-provider-preflight') throw new Error('fixture role requires an explicit no-provider nonce');
  const operation = process.env.AER_OPERATION;
  if (portableRelativePathError(operation, { flat: true })) throw new Error('fixture role requires one portable repository operation');
  const credentials = Object.keys(process.env).filter((name) => CREDENTIAL_NAME.test(name));
  const upstream = role === 'proxy' ? new URL(process.env.AER_UPSTREAM_URL) : null;
  if (upstream && (upstream.protocol !== 'http:' || upstream.hostname !== '127.0.0.1')) throw new Error('proxy upstream escaped loopback');
  const server = createServer(async (request, response) => {
    try {
      if (request.method === 'GET' && request.url === '/healthz') {
        if (upstream) {
          const result = await requestLocal(new URL('/healthz', upstream), { timeoutMs: 1000 });
          if (result.status !== 200) throw new Error('runtime health probe failed');
        }
        replyJson(response, 200, { ok: true, role });
        return;
      }
      if (request.method === 'POST' && request.url === `/${operation}`) {
        const bytes = await collectBody(request);
        if (upstream) {
          const result = await requestLocal(new URL(`/${operation}`, upstream), { method: 'POST', body: bytes, timeoutMs: 1000 });
          response.writeHead(result.status, { 'content-type': 'application/json', 'content-length': result.body.length });
          response.end(result.body);
          return;
        }
        const result = executeSyntheticOperation(operation, JSON.parse(bytes.toString('utf8')));
        replyJson(response, result.status, result.body);
        return;
      }
      replyJson(response, 404, { error: 'not-found' });
    } catch (error) {
      replyJson(response, 500, { error: error.message });
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  process.stdout.write(`AER_FIXTURE_READY ${JSON.stringify({ role, operation, nonce, host: address.address, port: address.port, uid: typeof process.getuid === 'function' ? process.getuid() : null, credential_names: credentials })}\n`);
  const stop = () => server.close(() => process.exit(0));
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}

function deepEqual(left, right) {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => deepEqual(value, right[index]));
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const leftKeys = Object.keys(left).sort(), rightKeys = Object.keys(right).sort();
    return sameValue(leftKeys, rightKeys) && leftKeys.every((key) => deepEqual(left[key], right[key]));
  }
  return false;
}

async function runGraderRole() {
  if (process.env.AER_EVAL_MODE !== 'no-provider-preflight' || Object.keys(process.env).some((name) => CREDENTIAL_NAME.test(name))) {
    throw new Error('grader requires provider-disabled execution without credentials');
  }
  const bytes = await collectBody(process.stdin);
  const packet = JSON.parse(bytes.toString('utf8'));
  if (packet.rubric?.grader_id !== packet.id || packet.rubric?.pass_score !== 1 || packet.rubric?.fail_score !== 0) throw new Error('grader rubric contract changed');
  const passed = deepEqual(packet.actual, packet.expected);
  process.stdout.write(`${JSON.stringify({ id: packet.id, version: packet.version, passed, strict_score: passed ? 1 : 0, assertions: [{ id: 'exact-structure', passed }] })}\n`);
}

function readReady(child, role, operation, nonce, timeoutMs) {
  return new Promise((resolve, reject) => {
    let output = Buffer.alloc(0), stderr = Buffer.alloc(0), settled = false;
    const done = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.stderr.off('data', onErrorData);
      child.off('exit', onExit);
      error ? reject(error) : resolve(value);
    };
    const onData = (chunk) => {
      output = Buffer.concat([output, chunk]);
      if (output.length > 8192) { done(new Error(`${role} readiness output exceeded 8192 bytes`)); return; }
      const newline = output.indexOf(10);
      if (newline < 0) return;
      const line = output.subarray(0, newline).toString('utf8');
      if (!line.startsWith('AER_FIXTURE_READY ')) { done(new Error(`${role} emitted an invalid readiness line`)); return; }
      try {
        const value = JSON.parse(line.slice('AER_FIXTURE_READY '.length));
        if (value.role !== role || value.operation !== operation || value.nonce !== nonce || value.host !== '127.0.0.1' || !Number.isInteger(value.port) || value.port < 1 || value.port > 65535) throw new Error('readiness identity changed');
        if (value.credential_names?.length) throw new Error(`credential variables reached ${role}`);
        if (typeof process.getuid === 'function' && value.uid !== process.getuid()) throw new Error(`${role} execution identity changed`);
        done(null, value);
      } catch (error) { done(new Error(`${role} readiness rejected: ${error.message}`)); }
    };
    const onErrorData = (chunk) => {
      stderr = Buffer.concat([stderr, chunk]);
      if (stderr.length > MAX_STREAM_BYTES) done(new Error(`${role} stderr exceeded ${MAX_STREAM_BYTES} bytes`));
    };
    const onExit = (code) => done(new Error(`${role} exited before readiness with code ${code}: ${stderr.toString('utf8').trim()}`));
    child.stdout.on('data', onData);
    child.stderr.on('data', onErrorData);
    child.once('exit', onExit);
    const timer = setTimeout(() => done(new Error(`${role} startup timed out`)), timeoutMs);
  });
}

async function startService(role, timeoutMs, upstream = null, operation = 'normalize-record') {
  const nonce = randomBytes(16).toString('hex');
  const env = { AER_EVAL_MODE: 'no-provider-preflight', AER_ROLE: role, AER_OPERATION: operation, AER_READY_NONCE: nonce };
  if (upstream) env.AER_UPSTREAM_URL = upstream;
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--fixture-role', role], { cwd: repo, env, shell: false, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  try {
    const ready = await readReady(child, role, operation, nonce, timeoutMs);
    return { child, role, url: `http://127.0.0.1:${ready.port}`, port: ready.port };
  } catch (error) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    if (!await waitForExit(child, Math.max(timeoutMs, 500))) throw new Error(`${error.message}; readiness-failed child did not terminate`);
    throw error;
  }
}

export async function readinessFailureCleanupProbe() {
  try {
    await startService('hang-for-readiness-test', 50);
    return false;
  } catch (error) {
    return error.message.includes('startup timed out');
  }
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => { child.off('exit', exited); resolve(false); }, timeoutMs);
    const exited = () => { clearTimeout(timer); resolve(true); };
    child.once('exit', exited);
  });
}

async function assertPortClosed(service) {
  try {
    await requestLocal(`${service.url}/healthz`, { timeoutMs: 300 });
    throw new Error(`${service.role} still accepts connections after cleanup`);
  } catch (error) {
    if (error.message.includes('still accepts')) throw error;
  }
}

async function stopService(service, timeoutMs) {
  if (!service) return;
  if (service.child.exitCode === null && service.child.signalCode === null) service.child.kill('SIGTERM');
  if (!await waitForExit(service.child, timeoutMs)) {
    service.child.kill('SIGKILL');
    if (!await waitForExit(service.child, timeoutMs)) throw new Error(`${service.role} did not terminate`);
  }
  await assertPortClosed(service);
}

async function runLocalGrader(grader, packet, timeoutMs) {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--fixture-role', 'grader'], {
    cwd: repo, env: { AER_EVAL_MODE: 'no-provider-preflight', AER_ROLE: 'grader' }, shell: false, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  });
  const input = `${JSON.stringify({ id: grader.id, version: grader.version, ...packet })}\n`;
  child.stdin.end(input);
  return new Promise((resolve, reject) => {
    let stdout = Buffer.alloc(0), stderr = Buffer.alloc(0), settled = false;
    const done = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(value);
    };
    child.stdout.on('data', (chunk) => { stdout = Buffer.concat([stdout, chunk]); if (stdout.length > MAX_STREAM_BYTES) { child.kill('SIGKILL'); done(new Error('grader stdout exceeded cap')); } });
    child.stderr.on('data', (chunk) => { stderr = Buffer.concat([stderr, chunk]); if (stderr.length > MAX_STREAM_BYTES) { child.kill('SIGKILL'); done(new Error('grader stderr exceeded cap')); } });
    child.once('error', (error) => done(error));
    child.once('exit', (code) => {
      if (code !== 0) { done(new Error(`grader exited ${code}: ${stderr.toString('utf8').trim()}`)); return; }
      try { done(null, { bytes: stdout, value: JSON.parse(stdout.toString('utf8')) }); }
      catch (error) { done(new Error(`grader output is invalid JSON: ${error.message}`)); }
    });
    const timer = setTimeout(() => { child.kill('SIGKILL'); done(new Error('grader execution timed out')); }, timeoutMs);
  });
}

async function captureArtifact(directory, name, bytes) {
  const pathError = portableRelativePathError(name, { flat: true });
  if (pathError) throw new Error(`${name}: ${pathError}`);
  const file = path.join(directory, name);
  const handle = await open(file, 'wx');
  try { await handle.writeFile(bytes); }
  finally { await handle.close(); }
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new Error(`${name}: artifact is not one new regular file`);
  const resolvedRoot = await realpath(directory), resolved = await realpath(file);
  const outside = path.relative(resolvedRoot, resolved);
  if (outside.startsWith('..') || path.isAbsolute(outside)) throw new Error(`${name}: artifact escaped scratch`);
  const captured = await readFile(file);
  if (captured.length > MAX_TEXT_BYTES) throw new Error(`${name}: artifact exceeded cap`);
  for (const error of utf8LfErrors(captured, name)) throw new Error(error);
  return { file, bytes: captured, sha256: sha256(captured) };
}

export async function validateNoProviderHarness() {
  const errors = [];
  const required = [TASKS, GRADERS, EXPERIMENTS, CELLS, DIRECTIVES, 'evals/scenarios.json', 'evals/treatments.json', 'compatibility/models.json', 'compatibility/hosts.json'];
  const documents = new Map();
  for (const relative of required) {
    const loaded = await safeSourceFile(relative, errors);
    if (loaded) documents.set(relative, loaded);
  }
  if (errors.length) return { errors, tasks: new Map(), graders: new Map(), experimentArms: new Map(), cellPlans: new Map(), metrics: {} };
  const scenariosDoc = documents.get('evals/scenarios.json').value;
  const treatmentsDoc = documents.get('evals/treatments.json').value;
  const modelsDoc = documents.get('compatibility/models.json').value;
  const hostsDoc = documents.get('compatibility/hosts.json').value;
  const experimentRecords = documents.get(EXPERIMENTS).value.experiments ?? [];
  const context = {
    hosts: new Set(Object.keys(hostsDoc.supported_hosts ?? {})),
    overlays: new Map((modelsDoc.overlays ?? []).map((overlay) => [overlay.id, overlay])),
    scenarios: new Set((scenariosDoc.scenarios ?? []).map((scenario) => scenario.id)),
    treatments: new Set((treatmentsDoc.treatments ?? []).map((treatment) => treatment.id)),
    experiments: experimentRecords,
  };
  const registry = registryErrors(documents.get(TASKS).value, documents.get(GRADERS).value, context);
  errors.push(...registry.errors);
  errors.push(...experimentErrors(documents.get(EXPERIMENTS).value, context));
  errors.push(...frozenEvaluationHashErrors({
    experiments: documents.get(EXPERIMENTS).sha256,
    cells: documents.get(CELLS).sha256,
  }));
  const generatedPlan = await generateFrozenCellPlan();
  errors.push(...generatedPlan.errors);
  const declaredPlan = documents.get(CELLS).value;
  const declaredCellIds = (declaredPlan?.cells ?? []).map((cell) => cell.cell_id);
  if (new Set(declaredCellIds).size !== declaredCellIds.length) errors.push('frozen cell plan cell_id values must be unique');
  const generatedCellIds = (generatedPlan.document?.cells ?? []).map((cell) => cell.cell_id);
  if (new Set(generatedCellIds).size !== generatedCellIds.length) errors.push('mechanically derived frozen cell IDs collided');
  if (generatedPlan.document && !deepEqual(declaredPlan, generatedPlan.document)) errors.push('frozen cell plan does not exactly match the mechanically derived experiment/task/component/config plan');
  if (declaredPlan?.archive_before_provider !== true) errors.push('frozen cell plan must archive the exact assembly and execution config before any provider request');

  const taskFiles = new Map(), graderFiles = new Map();
  for (const task of registry.tasks.values()) {
    const loaded = {};
    for (const field of ['repository_fixture', 'task_contract_fixture', 'input_fixture', 'expected_artifact_fixture']) {
      loaded[field] = await safeSourceFile(task[field], errors);
    }
    taskFiles.set(task.id, loaded);
  }
  for (const grader of registry.graders.values()) graderFiles.set(grader.id, await safeSourceFile(grader.rubric_fixture, errors));
  const executableFiles = new Map([
    [TASKS, documents.get(TASKS)],
    [GRADERS, documents.get(GRADERS)],
    [DIRECTIVES, documents.get(DIRECTIVES)],
    ['evals/scenarios.json', documents.get('evals/scenarios.json')],
  ]);
  for (const files of taskFiles.values()) for (const file of Object.values(files)) if (file) executableFiles.set(file.relative, file);
  for (const file of graderFiles.values()) if (file) executableFiles.set(file.relative, file);
  errors.push(...frozenEvaluationHashErrors({ executable_fixtures: executableFixtureDigest(executableFiles) }));
  for (const task of registry.tasks.values()) {
    const files = taskFiles.get(task.id);
    if (Object.values(files).some((file) => !file)) continue;
    errors.push(...taskContractLinkErrors(task, files.repository_fixture.value, files.task_contract_fixture.value, files.task_contract_fixture.sha256));
    errors.push(...taskCaseFixtureErrors(task, files.task_contract_fixture.value, files.input_fixture.value, files.expected_artifact_fixture.value));
  }
  if (errors.length) return { errors, tasks: new Map(), graders: new Map(), experimentArms: new Map(), cellPlans: new Map(), metrics: {} };

  const taskRecords = new Map([...registry.tasks].map(([id, task]) => [id, { ...task, task_contract_sha256: taskFiles.get(id).task_contract_fixture.sha256 }]));
  const graderRecords = new Map([...registry.graders].map(([id, grader]) => [id, { ...grader, rubric_sha256: graderFiles.get(id).sha256 }]));
  const experimentArms = new Map(experimentRecords.map((entry) => [entry.id, new Set(entry.arms.map((arm) => arm.id))]));

  const started = Date.now();
  const executedGraders = new Set();
  let executedTasks = 0, executedCases = 0, archivesValidated = 0;
  for (const cell of generatedPlan.document.cells) {
    let archive = null;
    try {
      archive = await mkdtemp(path.join(tmpdir(), 'aer-eval-cell-'));
      await writeCellArchive(archive, generatedPlan.fixtures.get(cell.cell_id));
      const result = await validateCellArchive(cell, archive);
      if (result.errors.length) throw new Error(result.errors.join('; '));
      archivesValidated += 1;
    } catch (error) { errors.push(`cell archive ${cell.cell_id}: ${error.message}`); }
    finally { if (archive) await rm(archive, { recursive: true, force: true }); }
  }
  for (const task of taskRecords.values()) {
    const grader = graderRecords.get(task.grader_id);
    let scratch = null, runtime = null, proxy = null;
    try {
      const files = taskFiles.get(task.id);
      const contractFixture = files.task_contract_fixture.value;
      const operation = contractFixture.operation;
      scratch = await mkdtemp(path.join(tmpdir(), 'aer-eval-preflight-'));
      await access(scratch, fsConstants.R_OK | fsConstants.W_OK);
      runtime = await startService('runtime', task.runtime.startup_timeout_ms, null, operation);
      const runtimeHealth = await requestLocal(`${runtime.url}/healthz`, { timeoutMs: task.runtime.execution_timeout_ms });
      if (runtimeHealth.status !== 200) throw new Error('runtime readiness probe failed');
      proxy = await startService('proxy', task.runtime.startup_timeout_ms, runtime.url, operation);
      const proxyHealth = await requestLocal(`${proxy.url}/healthz`, { timeoutMs: task.runtime.execution_timeout_ms });
      if (proxyHealth.status !== 200) throw new Error('proxy readiness probe failed');

      const caseResults = [];
      for (const [index, testCase] of files.input_fixture.value.cases.entries()) {
        const result = await requestLocal(`${proxy.url}${contractFixture.interface.path}`, {
          method: contractFixture.interface.method,
          body: JSON.stringify(testCase.request),
          timeoutMs: task.runtime.execution_timeout_ms,
        });
        const contentType = String(result.contentType ?? '').split(';', 1)[0];
        if (contentType !== contractFixture.interface.response_content_type) throw new Error(`case ${testCase.id} returned undeclared content type ${contentType}`);
        caseResults.push({ sequence: index + 1, id: testCase.id, kind: testCase.kind, status: result.status, content_type: contentType, body: JSON.parse(result.body.toString('utf8')) });
        executedCases += 1;
      }
      const rawBytes = Buffer.from(`${JSON.stringify({ schema_version: 2, task_id: task.id, cases: caseResults }, null, 2)}\n`);
      const rawArtifact = await captureArtifact(scratch, task.artifact_name, rawBytes);
      const expected = files.expected_artifact_fixture.value;
      const rubric = graderFiles.get(grader.id).value;
      if (rubric.grader_id !== grader.id) throw new Error(`${grader.id}: rubric fixture identity changed`);
      const grade = await runLocalGrader(grader, { actual: JSON.parse(rawArtifact.bytes.toString('utf8')), expected, rubric }, grader.execution_timeout_ms);
      executedGraders.add(grader.id);
      const gradeKeys = Object.keys(grade.value).sort();
      if (!sameValue(gradeKeys, ['assertions', 'id', 'passed', 'strict_score', 'version'])) throw new Error('grader output is not the closed contract');
      if (grade.value.id !== grader.id || grade.value.version !== grader.version || grade.value.passed !== true || grade.value.strict_score !== 1
        || !sameValue(grade.value.assertions, [{ id: 'exact-structure', passed: true }])) throw new Error('grader did not pass the synthetic expected artifact');
      await captureArtifact(scratch, 'grader-output.json', Buffer.from(`${JSON.stringify(grade.value, null, 2)}\n`));
      executedTasks += 1;
    } catch (error) {
      errors.push(`executable harness ${task.id}: ${error.message}`);
    } finally {
      try { await stopService(proxy, task.runtime.cleanup_timeout_ms); }
      catch (error) { errors.push(`executable harness cleanup ${task.id}: ${error.message}`); }
      try { await stopService(runtime, task.runtime.cleanup_timeout_ms); }
      catch (error) { errors.push(`executable harness cleanup ${task.id}: ${error.message}`); }
      if (scratch) await rm(scratch, { recursive: true, force: true });
    }
  }
  for (const graderId of graderRecords.keys()) if (!executedGraders.has(graderId)) errors.push(`executable harness did not execute grader ${graderId}`);
  return {
    errors,
    tasks: taskRecords,
    graders: graderRecords,
    experimentArms,
    experiments: new Map(experimentRecords.map((entry) => [entry.id, entry])),
    coverageCells: registry.coverageCells,
    cellPlans: new Map(generatedPlan.document.cells.map((cell) => [cell.cell_id, cell])),
    cellFixtures: generatedPlan.fixtures,
    metrics: { tasks: taskRecords.size, tasks_executed: executedTasks, cases_executed: executedCases, graders: graderRecords.size, graders_executed: executedGraders.size, experiments_registered: experimentArms.size, planned_experiment_cells: registry.coverageCells.length, cell_archives_validated: archivesValidated, elapsed_ms: Date.now() - started, provider_calls: 0 },
  };
}

const roleIndex = process.argv.indexOf('--fixture-role');
if (roleIndex >= 0) {
  const role = process.argv[roleIndex + 1];
  const run = role === 'grader' ? runGraderRole()
    : role === 'runtime' || role === 'proxy' ? runServiceRole(role)
      : role === 'hang-for-readiness-test' ? new Promise(() => { setInterval(() => {}, 1000); })
        : Promise.reject(new Error(`unknown fixture role ${role}`));
  run.catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
} else if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validateNoProviderHarness().then((result) => {
    if (result.errors.length) {
      console.error(`FAIL (${result.errors.length})`);
      for (const error of result.errors) console.error(`  - ${error}`);
      process.exitCode = 1;
      return;
    }
    console.log(`PASS (${result.metrics.tasks_executed}/${result.metrics.tasks} tasks, ${result.metrics.cases_executed} cases, ${result.metrics.graders_executed}/${result.metrics.graders} graders; ${result.metrics.cell_archives_validated}/${result.metrics.planned_experiment_cells} frozen cell archives validated; provider calls ${result.metrics.provider_calls})`);
  }).catch((error) => { console.error(`FAIL: ${error.message}`); process.exitCode = 1; });
}
